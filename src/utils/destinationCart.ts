import { useCallback, useEffect, useMemo } from 'react';
import { router } from 'expo-router';
import { useTripStore } from '@/stores/tripStore';
import { useDestinationStore } from '@/stores/destinationStore';
import { useTripPrepStore } from '@/stores/tripPrepStore';
import { goToTabRoot } from '@/components/shell/tabNav';
import { notice } from '@/components/ui/ConfirmDialog';

export const PREP_HREF = '/(tabs)/trips/prep';

/**
 * '외근 목적지' 담기 — 4 현장 검색의 '+'·5 현장 상세의 [외근 목적지에 추가]·머리의 목적지 버튼.
 * 외근 중이면 그 외근의 목적지(destinationStore, 서버 POST), 외근 전이면 6 외근 준비에 담을 목록(tripPrepStore).
 * 외근 중에 담은 목적지는 여기서 빼지 않는다 — 진행 중 목적지 삭제 API 가 없고 7 에서 건너뛰기로 다룬다.
 */
export function useDestinationCart() {
  const activeTripId = useTripStore((s) => s.activeTripId);
  const destinations = useDestinationStore((s) => s.destinations);
  const prepIds = useTripPrepStore((s) => s.fieldIds);

  useEffect(() => {
    void useTripPrepStore.getState().hydrate();
  }, []);

  const ids = useMemo(
    () =>
      activeTripId
        ? destinations.filter((d) => d.tripId === activeTripId && d.status !== 'skipped').map((d) => d.fieldId)
        : prepIds,
    [activeTripId, destinations, prepIds],
  );
  const idSet = useMemo(() => new Set(ids), [ids]);

  const has = useCallback((fieldId: string) => idSet.has(fieldId), [idSet]);

  const add = useCallback(
    (fieldIds: string[]) => {
      if (activeTripId) {
        // 이 외근에서 건너뛴 목적지는 다시 담지 못한다 — 서버가 pending 으로 되돌리는 PATCH 를 받지 않는다
        // (arrived·skipped 만). 7-9 [되돌리기]는 서버에 보내기 전 4초 안에만 된다(utils/deferredSkip).
        const ds = useDestinationStore.getState();
        let skipped = 0;
        for (const id of fieldIds) {
          if (ds.findByTripField(activeTripId, id)?.status === 'skipped') skipped++;
          else ds.add(activeTripId, id);
        }
        if (skipped > 0) void notice('건너뛴 목적지예요', '이 외근에서 건너뛴 현장은 다시 담을 수 없어요.');
      } else {
        useTripPrepStore.getState().add(fieldIds);
      }
    },
    [activeTripId],
  );

  const toggle = useCallback(
    (fieldId: string) => {
      if (!idSet.has(fieldId)) {
        add([fieldId]);
        return;
      }
      if (!activeTripId) useTripPrepStore.getState().remove(fieldId);
    },
    [idSet, add, activeTripId],
  );

  /** 머리의 목적지 버튼 — 외근 중이면 7 외근 진행, 외근 전이면 6 외근 준비. */
  const open = useCallback(() => {
    if (activeTripId) {
      goToTabRoot('trips');
      return;
    }
    // 6 외근 준비가 스택에 있으면(6 → 4 검색) 거기까지 닫고, 없으면 이 화면을 6 으로 바꾼다.
    router.dismissTo(PREP_HREF as never);
  }, [activeTripId]);

  /** 외근 중이면 목적지를 뺄 수 없다(✓ 를 다시 눌러도 그대로). */
  const removable = !activeTripId;

  return { ids, count: ids.length, has, add, toggle, open, removable };
}
