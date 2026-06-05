import { useCallback, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { pickPhoto, type UploadFile } from '@/utils/media';
import { requestUserLocation, type LatLng } from '@/utils/geolocation';
import { findNearbyFields, type NearbyField } from '@/utils/nearestField';
import { stashQuickPhoto } from './quickPhotoHandoff';
import { fields as fieldsApi } from '@/api';
import { useFieldStore, listItemToField } from '@/stores/fieldStore';
import { useAuthStore } from '@/stores/authStore';
import type { Field } from '@/types/entities';

// Quick Photo — 카메라 촬영 → 현 위치 최근접 현장 자동 매칭 → 확인 1탭 등록.
// 계획: docs/reference/AUTO_PICTURE_REGISTRATION_PLAN.md §4-4
// 화면이 아닌 훅으로 분리 — 현장 목록 외 진입점(지도 등)에서도 재사용 가능.
// UI 는 QuickPhotoSheet 가 session/uploading 을 받아 렌더.

export type QuickPhotoFallbackReason =
  | 'no_location'
  | 'no_nearby'
  | 'list_failed'
  | 'manual';

export interface QuickPhotoSession {
  file: UploadFile;
  /** 임계값(100m) 이내 후보 — 거리 오름차순. fallback 모드에선 비어 있을 수 있음. */
  candidates: Array<NearbyField<Field>>;
  /** 수동 선택 폴백 대상 — 본인 현장 전체 (방문일 스코프 무관, §6-5). */
  myFields: Field[];
  /** 촬영 직후 측위 좌표 — "이 위치에 새 현장 등록" 진입용. 측위 실패 시 null. */
  pos: LatLng | null;
  mode: 'confirm' | 'fallback';
  fallbackReason?: QuickPhotoFallbackReason;
}

// 전체 현장 일회성 조회 — 페이지 순회는 API 레이어(listMineAll)로 승격되어 store.refresh 와 공유.
async function fetchAllMyFields(): Promise<Field[]> {
  const items = await fieldsApi.listMineAll({ visitDateScope: 'all' });
  return items.map(listItemToField);
}

// 현장 등록 화면 진입 href — 사진은 핸드오프에 적재(web data URI 가 URL 에 실리는 것 방지),
// params 로는 토큰·측위 좌표만 넘긴다. 등록 완료 시 새 현장에 사진이 자동 첨부 (new.tsx 가 소비).
function buildNewFieldHref(file: UploadFile, pos: LatLng | null) {
  return {
    pathname: '/(tabs)/fields/new',
    params: {
      photoToken: stashQuickPhoto(file),
      ...(pos ? { lat: String(pos.lat), lng: String(pos.lng) } : {}),
    },
  };
}

export function useQuickPhoto() {
  const router = useRouter();
  const addPhoto = useFieldStore((s) => s.addPhoto);
  const userId = useAuthStore((s) => s.user?.id);

  const [session, setSession] = useState<QuickPhotoSession | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [uploading, setUploading] = useState(false);
  // state 가드는 같은 프레임의 2번째 탭(stale closure)을 못 막는다 — ref 로 동기 재진입 차단.
  const startingRef = useRef(false);
  const uploadingRef = useRef(false);

  const start = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setPreparing(true);
    try {
      // 갤러리 사진은 촬영 위치 ≠ 현재 위치라 자동 매칭 대상이 아님 — 카메라 직촬영 전용.
      // web 은 launchCameraAsync 미지원이라 파일 선택기로 (§6-6, 1차 타깃은 모바일).
      const file = await pickPhoto(Platform.OS === 'web' ? 'library' : 'camera');
      if (!file) return; // 취소 또는 권한 거부 (pickPhoto 가 자체 Alert 처리)

      // GPS fix(high 는 수 초 가능)와 목록 fetch 는 독립 — 병렬로 시트 노출 지연 최소화.
      // - 좌표: 촬영 직후 1회, 100m 판정이라 Balanced(~100m 오차) 대신 high (§4-1).
      // - 목록: 화면 필터(방문일 30일 등)와 무관한 전체 스코프 일회성 조회 — store 미오염 (§6-5).
      const [pos, listResult] = await Promise.all([
        requestUserLocation({ high: true }),
        fetchAllMyFields().then(
          (fields) => ({ ok: true as const, fields }),
          () => ({ ok: false as const }),
        ),
      ]);

      // 조회 실패 시 store 목록은 화면 필터로 좁혀진 부분집합일 수 있다 —
      // 부분 목록 기준 자동 매칭은 오매칭/가짜 no_nearby 위험이라 수동 선택으로만 강등.
      const fetched = listResult.ok
        ? listResult.fields
        : useFieldStore.getState().fields;
      const myFields = userId
        ? fetched.filter((f) => f.userId === userId)
        : fetched;

      if (myFields.length === 0) {
        if (!listResult.ok) {
          // 조회 실패 + 폴백 목록도 빈 경우(콜드 스타트 오프라인 등) —
          // "현장이 없다"고 단정할 근거가 없으므로 조회 실패로 안내.
          Alert.alert('현장 목록을 불러오지 못했습니다', '네트워크 확인 후 다시 시도해주세요.');
          return;
        }
        // §6-3: 현장 0개 → 폴백 시트 대신 새 현장 등록 유도 — 사진·좌표도 함께 넘긴다.
        Alert.alert('등록된 현장이 없습니다', '사진을 등록하려면 먼저 현장이 필요해요.', [
          { text: '닫기', style: 'cancel' },
          {
            text: '새 현장 등록',
            onPress: () => router.push(buildNewFieldHref(file, pos) as never),
          },
        ]);
        return;
      }

      const fallback = (reason: QuickPhotoFallbackReason) =>
        setSession({
          file,
          candidates: [],
          myFields,
          pos,
          mode: 'fallback',
          fallbackReason: reason,
        });

      if (!listResult.ok) return fallback('list_failed');
      // §6-1: 권한 거부·GPS 실패는 silent 폴백 — 에러 아님.
      if (!pos) return fallback('no_location');

      const candidates = findNearbyFields(pos, myFields);
      if (candidates.length === 0) return fallback('no_nearby');
      setSession({ file, candidates, myFields, pos, mode: 'confirm' });
    } finally {
      startingRef.current = false;
      setPreparing(false);
    }
  }, [router, userId]);

  const upload = useCallback(
    async (field: Field) => {
      if (!session || uploadingRef.current) return;
      uploadingRef.current = true;
      setUploading(true);
      const res = await addPhoto(field.id, session.file);
      uploadingRef.current = false;
      setUploading(false);
      if (res.ok) {
        setSession(null);
        Alert.alert('등록 완료', `${field.address}에 사진을 등록했어요.`, [
          { text: '닫기', style: 'cancel' },
          {
            text: '현장 보기',
            onPress: () => router.push(`/(tabs)/fields/${field.id}` as never),
          },
        ]);
      } else {
        // §4-6: 파일·세션 유지 → 시트에서 재촬영 없이 그대로 다시 시도 가능.
        Alert.alert('등록 실패', res.error);
      }
    },
    [session, addPhoto, router],
  );

  /** 확인 모드 → 수동 선택 전환 ("다른 현장 선택"). */
  const toFallback = useCallback(() => {
    setSession((s) => (s ? { ...s, mode: 'fallback', fallbackReason: 'manual' } : s));
  }, []);

  /** 폴백 "이 위치에 새 현장 등록" — 사진·촬영 좌표를 등록 화면으로 넘기고 시트를 닫는다. */
  const createNew = useCallback(() => {
    if (!session || uploadingRef.current) return;
    const href = buildNewFieldHref(session.file, session.pos);
    setSession(null);
    router.push(href as never);
  }, [session, router]);

  /** 시트 닫기 — 업로드 중엔 무시 (§6-7). ref 기준 — Alert 콜백 등 stale closure 에서도 안전. */
  const cancel = useCallback(() => {
    if (uploadingRef.current) return;
    setSession(null);
  }, []);

  return { session, preparing, uploading, start, upload, toFallback, createNew, cancel };
}
