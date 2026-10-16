import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MapSettingsSheet } from './MapSettingsSheet';
import { RANGE_DAYS, useMapSettingsStore } from '@/stores/mapSettingsStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { fieldActionStatus } from '@/utils/fieldStatus';
import { mergeCategoryNames } from '@/utils/fieldFacets';
import type { Field } from '@/types/entities';

/**
 * 1-3 지도 설정 시트를 MapDashboard 밖 지도 화면(6 외근 준비·7 외근 진행)에서 쓰기 위한 묶음.
 * 설정은 1 지도와 같은 전역 store 를 쓴다. 필터(조치 상태·최근 방문일·분류)는 화면이 배경 핀에만 건다 —
 * 목적지 핀은 가리지 않는다. 표시 방식(히트맵 등)은 보이지 않는다 — 이 화면들은 늘 마커다.
 */
export function useSharedMapSettings(backgroundFields: readonly Field[], sections: 'filters' | 'baseMap' = 'filters') {
  const s = useMapSettingsStore();
  const [open, setOpen] = useState(false);
  const masterCategories = useCategoryStore((st) => st.categories);
  useEffect(() => {
    void useCategoryStore.getState().hydrate();
  }, []);

  const availableTags = useMemo(() => {
    const fromFields: string[] = [];
    backgroundFields.forEach((f) => f.categories?.forEach((t) => fromFields.push(t)));
    return mergeCategoryNames(masterCategories.map((c) => c.name), fromFields);
  }, [backgroundFields, masterCategories]);

  const { selectedStatuses, rangePreset, selectedTags } = s;
  const filterFields = useCallback(
    (list: readonly Field[]): Field[] => {
      let out = [...list];
      if (selectedStatuses.length > 0) out = out.filter((f) => selectedStatuses.includes(fieldActionStatus(f)));
      if (rangePreset !== 'all') {
        const cutoff = Date.now() - RANGE_DAYS[rangePreset] * 24 * 60 * 60 * 1000;
        out = out.filter((f) => {
          const t = f.recentVisitedAt ?? f.updatedAt;
          const ms = t ? new Date(t).getTime() : NaN;
          return Number.isFinite(ms) && ms >= cutoff;
        });
      }
      if (selectedTags.length > 0) out = out.filter((f) => selectedTags.some((tag) => f.categories?.includes(tag)));
      return out;
    },
    [selectedStatuses, rangePreset, selectedTags],
  );

  const visibleCount = useMemo(() => filterFields(backgroundFields).length, [filterFields, backgroundFields]);
  // 표시 방식은 이 화면들에서 쓰지 않는다(항상 마커) — 바뀐 표시 점에도 넣지 않는다.
  const changed =
    s.baseMapType !== 'roadmap' ||
    (sections === 'filters' && (selectedStatuses.length > 0 || rangePreset !== 'all' || selectedTags.length > 0));

  const sheet = (
    <MapSettingsSheet
      open={open}
      onClose={() => setOpen(false)}
      sections={sections}
      displayMode={s.displayMode}
      onChangeDisplayMode={s.setDisplayMode}
      baseMapType={s.baseMapType}
      onChangeBaseMapType={s.setBaseMapType}
      selectedStatuses={selectedStatuses}
      onChangeStatuses={s.setStatuses}
      rangePreset={rangePreset}
      onChangeRangePreset={s.setRangePreset}
      availableTags={availableTags}
      selectedTags={selectedTags}
      onToggleTag={s.toggleTag}
      visibleCount={visibleCount}
      onReset={s.reset}
    />
  );

  return {
    openSettings: () => setOpen(true),
    sheet,
    changed,
    baseMapType: s.baseMapType,
    filterFields,
  };
}
