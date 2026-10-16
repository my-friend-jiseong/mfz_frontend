import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { KakaoMapWebView, type KakaoMapMarker, type MapPinKind } from '@/components/KakaoMapWebView';
import { STATUS_PIN_COLOR } from '@/components/shell/pinColors';
import { Text } from '@/components/ui/Text';
import { useFieldStore } from '@/stores/fieldStore';
import { fieldActionStatus } from '@/utils/fieldStatus';
import type { OverviewMapView } from '@/utils/overviewMapView';
import { c2, radius2, space } from '@/theme/v2';
import type { Field, FieldReport, FieldStatus } from '@/types/entities';

// 보고서 화면(9-2·9-3·9-6·9-8·9-10·9-11)이 같이 쓰는 조각.

export type Slot = 'before' | 'pending' | 'after';
export const SLOTS: { key: Slot; short: string; label: string }[] = [
  { key: 'before', short: '전', label: '조치 전' },
  { key: 'pending', short: '중', label: '조치 중' },
  { key: 'after', short: '후', label: '조치 후' },
];
export const SLOT_URL = {
  before: 'beforePhotoUrl',
  pending: 'pendingPhotoUrl',
  after: 'afterPhotoUrl',
} as const satisfies Record<Slot, keyof FieldReport>;
export const SLOT_CAPTION = {
  before: 'beforePhotoCaption',
  pending: 'pendingPhotoCaption',
  after: 'afterPhotoCaption',
} as const satisfies Record<Slot, keyof FieldReport>;

/**
 * 보고서 위치도 카드(Figma 9-2·9-3 Map 350×152 = 화면 폭 − 좌우 20). 9-7 구도 틀도 이 크기로 그린다 — 캡처가 이 카드를 찍는다.
 * 자동 맞춤 여백도 9-7 과 같이 쓴다(위 48: 핀이 좌표 위로 44 솟는다).
 */
export const OVERVIEW_MAP_HEIGHT = 152;
export const OVERVIEW_MAP_SIDE = 20;
export const OVERVIEW_FIT_PADDING: [number, number, number, number] = [48, 24, 12, 24];

export const fieldName = (f: Pick<Field, 'name' | 'address'> | undefined) =>
  f?.name?.trim() || f?.address || '알 수 없는 현장';

const hasCoord = (f: Field | undefined): f is Field => !!f && !(f.latitude === 0 && f.longitude === 0);

/** 현장 보고의 사진·설명 수(9-2 행 '사진 2 · 설명 2'). */
export function fieldReportCounts(fr: FieldReport): { photos: number; captions: number } {
  let photos = 0;
  let captions = 0;
  for (const s of SLOTS) {
    if (fr[SLOT_URL[s.key]]) photos += 1;
    if (fr[SLOT_CAPTION[s.key]]?.trim()) captions += 1;
  }
  return { photos, captions };
}

export interface ReportRow {
  fr: FieldReport;
  order: number;
  field: Field | undefined;
  kind: FieldStatus;
}

/**
 * 보고서 현장 보고 → 순번·현장·조치 상태 + 위치도 핀. 현장이 아직 없으면 받아 온다.
 * 순번은 현장 보고 순서(= 만든 순서, 백로그 §38)이고 위치도 핀 번호와 같다.
 */
export function useReportRows(fieldReports: readonly FieldReport[] | undefined) {
  const fields = useFieldStore((s) => s.fields);
  const frs = useMemo(() => fieldReports ?? [], [fieldReports]);
  const key = frs.map((fr) => fr.fieldId).join(',');
  useEffect(() => {
    if (!key) return;
    const have = new Set(useFieldStore.getState().fields.map((f) => f.id));
    for (const fid of key.split(',')) if (fid && !have.has(fid)) void useFieldStore.getState().loadDetail(fid);
  }, [key]);
  return useMemo(() => {
    const byId = new Map(fields.map((f) => [f.id, f]));
    const rows: ReportRow[] = frs.map((fr, i) => {
      const field = byId.get(fr.fieldId);
      return { fr, order: i + 1, field, kind: fieldActionStatus(field) };
    });
    const markers: KakaoMapMarker[] = rows
      .filter((r) => hasCoord(r.field))
      .map((r) => ({
        id: r.fr.id,
        lat: r.field!.latitude,
        lng: r.field!.longitude,
        label: fieldName(r.field),
        color: STATUS_PIN_COLOR[r.kind],
        pin: r.kind as MapPinKind,
        order: r.order,
      }));
    return { rows, markers };
  }, [frs, fields]);
}

/** 순번 원 28(9-2·9-3·9-8 행 앞). 색은 그 현장의 조치 상태. */
export function OrderBadge({ n, kind }: { n: number; kind: FieldStatus }) {
  return (
    <View style={[styles.order, { backgroundColor: STATUS_PIN_COLOR[kind] }]}>
      <Text v2="bodyS.extrabold" tone="inverse" numeric>
        {String(n)}
      </Text>
    </View>
  );
}

/**
 * 보고서 위치도(조작 끈 지도). 구도를 저장했으면(9-7) 그 중심·줌으로, 아니면 현장 전체가 들어오게.
 * 지도는 중심·줌을 띄울 때만 읽어 구도가 바뀌면 key 로 다시 띄운다.
 */
export function ReportOverviewMap({
  markers,
  view,
  onTilesLoaded,
  style,
}: {
  markers: KakaoMapMarker[];
  /** undefined = 아직 읽는 중(지도를 띄우지 않는다), null = 자동 맞춤 */
  view: OverviewMapView | null | undefined;
  onTilesLoaded?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const viewKey = view ? `${view.lat},${view.lng},${view.level}` : 'auto';
  return (
    <View style={[styles.map, style]} pointerEvents="none">
      {view !== undefined && markers.length > 0 ? (
        <KakaoMapWebView
          key={viewKey}
          markers={markers}
          interactive={false}
          fitToMarkers={!view}
          fitPadding={OVERVIEW_FIT_PADDING}
          holdCenterOnResize
          center={view ? { lat: view.lat, lng: view.lng } : undefined}
          initialLevel={view?.level}
          onTilesLoaded={onTilesLoaded}
        />
      ) : null}
    </View>
  );
}

/** 9-2·9-6 행 오른쪽 전·중·후 작은 칸 36. 채운 칸은 회색, 빈 칸은 점선. */
export function SlotMiniBoxes({ fr }: { fr: FieldReport }) {
  return (
    <View style={styles.minis}>
      {SLOTS.map((s) => {
        const filled = !!fr[SLOT_URL[s.key]];
        return (
          <View key={s.key} style={[styles.mini, filled && styles.miniFilled]}>
            {filled ? null : <DashedBox size={36} radius={8} color={c2.border.strong} />}
            <Text v2="nano" tone={filled ? 'tertiary' : 'disabled'}>
              {s.short}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * 점선 테두리. RN 의 borderStyle 'dashed' 는 Android 에서 모서리가 둥글면 실선으로 나와 SVG 로 그린다.
 * 부모 위에 겹친다(absoluteFill).
 */
export function DashedBox({ size, width, height, radius, color }: { size?: number; width?: number; height?: number; radius: number; color: string }) {
  const w = width ?? size ?? 0;
  const h = height ?? size ?? 0;
  if (!w || !h) return null;
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Rect x={0.5} y={0.5} width={w - 1} height={h - 1} rx={radius} ry={radius} fill="none" stroke={color} strokeWidth={1} strokeDasharray="4 3" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  order: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  map: {
    height: OVERVIEW_MAP_HEIGHT,
    borderRadius: radius2.xl,
    borderWidth: 1,
    borderColor: c2.border.default,
    backgroundColor: c2.bg.muted,
    overflow: 'hidden',
  },
  minis: { flexDirection: 'row', gap: space[4] },
  mini: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  miniFilled: { backgroundColor: c2.bg.placeholder },
});
