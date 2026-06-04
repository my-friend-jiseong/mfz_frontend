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

export type QuickPhotoFallbackReason = 'no_location' | 'no_nearby' | 'manual';

export interface QuickPhotoSession {
  file: UploadFile;
  /** 임계값(100m) 이내 후보 — 거리 오름차순. fallback 모드에선 비어 있을 수 있음. */
  candidates: Array<NearbyField<Field>>;
  /** 수동 선택 폴백 대상 — 본인 현장 전체 (방문일 스코프 무관, §6-5). */
  myFields: Field[];
  mode: 'confirm' | 'fallback';
  fallbackReason?: QuickPhotoFallbackReason;
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

      // 촬영 직후 좌표 1회 — 100m 판정이라 Balanced(~100m 오차) 대신 high (§4-1).
      const pos = await requestUserLocation({ high: true });

      // 화면 필터(방문일 30일 등)와 무관한 전체 스코프 일회성 조회 — store 미오염 (§6-5).
      let myFields: Field[];
      try {
        const res = await fieldsApi.listMine({ visitDateScope: 'all' });
        myFields = res.items.map(listItemToField);
      } catch {
        // 조회 실패 → store 에 이미 있는 목록으로 폴백 (오프라인 등).
        myFields = useFieldStore.getState().fields;
      }
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

      if (!pos) {
        // §6-1: 권한 거부·GPS 실패는 silent 폴백 — 에러 아님.
        setSession({
          file,
          candidates: [],
          myFields,
          mode: 'fallback',
          fallbackReason: 'no_location',
        });
        return;
      }

      const candidates = findNearbyFields(pos, myFields);
      if (candidates.length === 0) {
        setSession({
          file,
          candidates: [],
          myFields,
          mode: 'fallback',
          fallbackReason: 'no_nearby',
        });
        return;
      }
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
