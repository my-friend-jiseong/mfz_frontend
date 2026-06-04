import { useCallback, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { pickPhoto, type UploadFile } from '@/utils/media';
import { requestUserLocation } from '@/utils/geolocation';
import { findNearbyFields, type NearbyField } from '@/utils/nearestField';
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
  mode: 'confirm' | 'fallback';
  fallbackReason?: QuickPhotoFallbackReason;
}

// listMine 은 기본 limit 이 작아 1페이지만 받으면 21번째+ 현장이 매칭에서 누락된다
// (capture_screens.mjs 가 같은 API 에 limit=200 을 명시하는 이유). 페이지 순회로 전체 확보.
// 상한 10페이지(=1000현장)는 무한 루프 방어 — 초과분은 현실적으로 없음.
async function fetchAllMyFields(): Promise<Field[]> {
  const out: Field[] = [];
  for (let page = 1; page <= 10; page++) {
    const res = await fieldsApi.listMine({ visitDateScope: 'all', limit: 100, page });
    out.push(...res.items.map(listItemToField));
    if (!res.pagination?.hasNext) break;
  }
  return out;
}

export function useQuickPhoto() {
  const router = useRouter();
  const addPhoto = useFieldStore((s) => s.addPhoto);
  const userId = useAuthStore((s) => s.user?.id);

  const [session, setSession] = useState<QuickPhotoSession | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const start = useCallback(async () => {
    if (preparing) return;
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
      let myFields = listResult.ok
        ? listResult.fields
        : useFieldStore.getState().fields;
      if (userId) myFields = myFields.filter((f) => f.userId === userId);

      if (myFields.length === 0) {
        // §6-3: 현장 0개 → 폴백 시트 대신 새 현장 등록 유도.
        Alert.alert('등록된 현장이 없습니다', '사진을 등록하려면 먼저 현장이 필요해요.', [
          { text: '닫기', style: 'cancel' },
          {
            text: '새 현장 등록',
            onPress: () => router.push('/(tabs)/fields/new' as never),
          },
        ]);
        return;
      }

      const fields = myFields;
      const fallback = (reason: QuickPhotoFallbackReason) =>
        setSession({
          file,
          candidates: [],
          myFields: fields,
          mode: 'fallback',
          fallbackReason: reason,
        });

      if (!listResult.ok) return fallback('list_failed');
      // §6-1: 권한 거부·GPS 실패는 silent 폴백 — 에러 아님.
      if (!pos) return fallback('no_location');

      const candidates = findNearbyFields(pos, myFields);
      if (candidates.length === 0) return fallback('no_nearby');
      setSession({ file, candidates, myFields, mode: 'confirm' });
    } finally {
      setPreparing(false);
    }
  }, [preparing, router, userId]);

  const upload = useCallback(
    async (field: Field) => {
      if (!session || uploading) return;
      setUploading(true);
      const res = await addPhoto(field.id, session.file);
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
    [session, uploading, addPhoto, router],
  );

  /** 확인 모드 → 수동 선택 전환 ("다른 현장 선택"). */
  const toFallback = useCallback(() => {
    setSession((s) => (s ? { ...s, mode: 'fallback', fallbackReason: 'manual' } : s));
  }, []);

  /** 시트 닫기 — 업로드 중엔 무시 (§6-7). */
  const cancel = useCallback(() => {
    if (uploading) return;
    setSession(null);
  }, [uploading]);

  return { session, preparing, uploading, start, upload, toFallback, cancel };
}
