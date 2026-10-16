import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabRootRedirect } from '@/components/shell/TabRootRedirect';
import { goToTabRoot } from '@/components/shell/tabNav';
import { openFullMap, type FullMapLegendRow, type FullMapPin } from '@/components/shell/fullMap';
import { useTripStore } from '@/stores/tripStore';
import { useVisitStore } from '@/stores/visitStore';
import { useDestinationStore } from '@/stores/destinationStore';
import { useFieldStore } from '@/stores/fieldStore';
import { useReportStore } from '@/stores/reportStore';
import { MapPreviewCard } from '@/components/MapPreviewCard';
import type { KakaoMapMarker, MapPath } from '@/components/KakaoMapWebView';
import { STATUS_PIN_COLOR } from '@/components/shell/pinColors';
import { TripStopRow } from '@/components/trips/TripStopRow';
import { Icon } from '@/components/icons';
import { Text } from '@/components/ui/Text';
import { Tag } from '@/components/ui/Tag';
import { Touchable } from '@/components/ui/Touchable';
import { Button2 } from '@/components/ui/Button2';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { EditableTitle } from '@/components/ui/EditableTitle';
import { showPopoverMenu } from '@/components/ui/PopoverMenu';
import { STATUS_LABEL } from '@/components/ui/StatusMark';
import { confirm, notice } from '@/components/ui/ConfirmDialog';
import { safeBack } from '@/utils/backNavigation';
import { memoForVisit } from '@/utils/visitRecord';
import { visitEditHref } from '@/utils/checkinNav';
import { fieldActionStatus } from '@/utils/fieldStatus';
import { fieldTitle } from '@/utils/fieldFacets';
import { useTripReportState, type TripReportState } from '@/utils/reportStatus';
import { fmtTripDateLine, tripTitle } from '@/utils/tripFormat';
import { findTripReportId, openReportForTrip, reportDetailHref, reportEditHref } from '@/utils/reportEntry';
import { fmtMonthDay, fmtTime } from '@/utils/datetime';
import { c2, radius2, space } from '@/theme/v2';
import type { Field, FieldStatus, Trip, Visit } from '@/types/entities';

type Stop =
  | { kind: 'visit'; key: string; order: number; visit: Visit; fieldId: string }
  | { kind: 'skipped'; key: string; order: number; fieldId: string };

/**
 * 외근의 들른 곳·건너뛴 곳을 순서대로. 계획 목적지 순서를 따르고, 목적지에 방문이 있으면 방문 행,
 * 없으면 건너뜀(종료된 외근에서 타임라인을 받은 뒤에만 — 받기 전엔 모두 건너뜀으로 보인다).
 * 목적지에 없는 방문(목적지 없이 기록한 곳)은 방문 시각 순으로 뒤에 붙인다.
 */
function buildStops(
  destinations: {
    id: string;
    fieldId: string;
    order: number;
    status: string;
  }[],
  visits: Visit[],
  judgeSkipped: boolean,
): Stop[] {
  const pool = [...visits].sort((a, b) => a.visitedAt.localeCompare(b.visitedAt));
  const used = new Set<string>();
  const out: Stop[] = [];
  for (const d of [...destinations].sort((a, b) => a.order - b.order)) {
    const v = pool.find((x) => !used.has(x.id) && x.fieldId === d.fieldId);
    if (v) {
      used.add(v.id);
      out.push({
        kind: 'visit',
        key: v.id,
        order: out.length + 1,
        visit: v,
        fieldId: v.fieldId,
      });
    } else if (d.status === 'skipped' || judgeSkipped) {
      out.push({
        kind: 'skipped',
        key: `d:${d.id}`,
        order: out.length + 1,
        fieldId: d.fieldId,
      });
    }
  }
  for (const v of pool) {
    if (used.has(v.id)) continue;
    out.push({
      kind: 'visit',
      key: v.id,
      order: out.length + 1,
      visit: v,
      fieldId: v.fieldId,
    });
  }
  return out;
}

const hasCoord = (f: Field | undefined): f is Field => !!f && !(f.latitude === 0 && f.longitude === 0);

// 3·3-1·3-2 머리 오른쪽 보고서 상태(인수인계: 외근 상세는 '보고서'를 붙인다).
const STAGE_TAG = {
  none: { label: '보고서 작성 전', tone: 'neutral', icon: null },
  draft: { label: '보고서 작성 중', tone: 'brand', icon: 'edit' },
  done: { label: '보고서 작성 완료', tone: 'success', icon: 'check' },
} as const;

// 3-8 경로 순서 카드의 조치 상태 글자색.
const LEGEND_TONE: Record<FieldStatus, FullMapLegendRow['trailingTone']> = {
  pending: 'warning',
  in_progress: 'brand',
  done: 'success',
};

/**
 * 3 외근 상세(Figma 687:3426) — 3-1 보고서 작성 중, 3-2 보고서 있음, 3-3 방문 0곳, 3-4 더보기, 3-5·3-6 삭제 확인,
 * 3-8 경로 지도(공통 전체 지도). 종료된 외근 전용 — 진행 중이면 외근 탭 첫 화면(7)으로.
 */
export default function TripDetail() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id = '' } = useLocalSearchParams<{ id?: string }>();

  const storeTrip = useTripStore((s) => (id ? s.getById(id) : undefined));
  // 삭제 직후 목록으로 돌아가는 동안 화면을 '없음'으로 뒤집지 않는다(떠나는 화면 플립 금지).
  const lastTripRef = useRef<Trip | undefined>(undefined);
  if (storeTrip) lastTripRef.current = storeTrip;
  const [deleting, setDeleting] = useState(false);
  const trip = storeTrip ?? (deleting ? lastTripRef.current : undefined);

  const activeTripId = useTripStore((s) => s.activeTripId);
  const timelineLoaded = useTripStore((s) => (id ? s.detailStatus[id] === 'success' : false));
  const allVisits = useVisitStore((s) => s.visits);
  const allDestinations = useDestinationStore((s) => s.destinations);
  const fields = useFieldStore((s) => s.fields);
  const directAttachments = useFieldStore((s) => s.directAttachments);
  const photosByVisit = useVisitStore((s) => s.photosByVisit);
  const liveReportState = useTripReportState(id);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const moreRef = useRef<View>(null);
  const deleteBusyRef = useRef(false);

  const fieldById = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields]);
  const visits = useMemo(() => allVisits.filter((v) => v.tripId === id), [allVisits, id]);
  const destinations = useMemo(() => allDestinations.filter((d) => d.tripId === id), [allDestinations, id]);
  const liveStops = useMemo(
    () => buildStops(destinations, visits, !!trip?.endedAt && timelineLoaded),
    [destinations, visits, trip?.endedAt, timelineLoaded],
  );
  // 삭제 중에는 지운 방문·보고서가 store 에서 빠져도 떠나는 화면이 3-3 으로 바뀌지 않게 지운 순간의 모습을 쥔다.
  const frozenRef = useRef<{ stops: Stop[]; reportState: TripReportState } | null>(null);
  const frozen = deleting ? frozenRef.current : null;
  const stops = frozen?.stops ?? liveStops;
  const reportState = frozen?.reportState ?? liveReportState;
  const visitCount = stops.filter((s) => s.kind === 'visit').length;

  // 진입 시 타임라인(방문)·목적지 받기.
  useEffect(() => {
    if (id) void useTripStore.getState().loadDetail(id);
  }, [id]);
  // 방문 현장의 메모(현장 첨부) — 펼친 행에 보인다.
  const fieldKey = useMemo(() => [...new Set(visits.map((v) => v.fieldId).filter(Boolean))].sort().join(','), [visits]);
  useEffect(() => {
    if (!fieldKey) return;
    for (const fid of fieldKey.split(',')) void useFieldStore.getState().loadDetail(fid);
  }, [fieldKey]);
  // 방문 사진은 처음 펼칠 때 받는다(방문 수만큼 요청이 나가지 않게).
  useEffect(() => {
    if (id && expandedId && !photosByVisit[expandedId]) void useVisitStore.getState().loadPhotos(id, expandedId);
  }, [id, expandedId, photosByVisit]);

  // 경로 카드·3-8 의 핀과 선. 방문한 곳은 조치 상태 색 순번 핀, 건너뛴 곳은 회색 순번 핀.
  const route = useMemo(() => {
    const pins: FullMapPin[] = [];
    const visited: { lat: number; lng: number }[] = [];
    const all: { lat: number; lng: number }[] = [];
    for (const s of stops) {
      const f = fieldById.get(s.fieldId);
      if (!hasCoord(f)) continue;
      const kind = s.kind === 'visit' ? fieldActionStatus(f) : 'visited';
      pins.push({
        id: s.key,
        lat: f.latitude,
        lng: f.longitude,
        kind,
        order: s.order,
        label: fieldTitle(f),
      });
      all.push({ lat: f.latitude, lng: f.longitude });
      if (s.kind === 'visit') visited.push({ lat: f.latitude, lng: f.longitude });
    }
    // 지나온 길은 진한 파랑 실선, 한 곳도 안 들렀으면 계획한 길을 회색 점선으로(3-3).
    const paths: MapPath[] =
      visited.length >= 2
        ? [{ points: visited, tone: 'brand' }]
        : visited.length === 0 && all.length >= 2
          ? [{ points: all, tone: 'muted', dotted: true }]
          : [];
    // 건너뛴 회색 핀을 먼저 그려 방문한 핀이 위에 오게 한다(카드·전체 지도 공통).
    pins.sort((a, b) => Number(b.kind === 'visited') - Number(a.kind === 'visited'));
    return { pins, paths };
  }, [stops, fieldById]);

  const markers = useMemo<KakaoMapMarker[]>(
    () =>
      route.pins.map((p) => ({
        id: p.id,
        lat: p.lat,
        lng: p.lng,
        label: p.label ?? '',
        color: STATUS_PIN_COLOR[p.kind],
        pin: p.kind,
        order: p.order,
      })),
    [route.pins],
  );

  if (!id || !trip) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Header onBack={() => safeBack(router)} />
        <View style={styles.missing}>
          <Text v2="bodyL.bold">외근을 찾을 수 없어요</Text>
          <Text v2="bodyS.regular" tone="tertiary">
            삭제됐거나 다른 사람의 외근일 수 있어요.
          </Text>
        </View>
      </View>
    );
  }
  if (activeTripId === id) return <TabRootRedirect tab="trips" />;

  const title = tripTitle(trip);
  const saveTitle = async (next: string) => {
    const r = await useTripStore.getState().update(id, { title: next });
    if (!r.ok) {
      await notice('제목을 저장하지 못했어요', r.error);
      throw new Error(r.error);
    }
  };

  const openRouteMap = () => {
    const legend: FullMapLegendRow[] = [
      {
        key: 'start',
        marker: 'start',
        label: '출발',
        trailing: fmtTime(trip.startedAt),
      },
      ...stops.map((s): FullMapLegendRow => {
        const f = fieldById.get(s.fieldId);
        if (s.kind === 'skipped') {
          return {
            key: s.key,
            marker: { order: s.order, kind: 'visited' },
            label: fieldTitle(f),
            trailing: '건너뜀',
            dim: true,
          };
        }
        const st = fieldActionStatus(f);
        return {
          key: s.key,
          marker: { order: s.order, kind: st },
          label: fieldTitle(f),
          trailing: STATUS_LABEL[st],
          trailingTone: LEGEND_TONE[st],
        };
      }),
    ];
    openFullMap({
      title: `${title} · ${fmtMonthDay(trip.startedAt)}`,
      pins: route.pins,
      paths: route.paths,
      legend,
    });
  };

  const deleteTrip = async () => {
    // 확인·삭제가 끝나기 전에 다시 누르면(메뉴를 또 열어) 요청이 겹친다.
    if (deleteBusyRef.current) return;
    deleteBusyRef.current = true;
    try {
      await runDelete();
    } finally {
      deleteBusyRef.current = false;
    }
  };

  const runDelete = async () => {
    // 보고서가 있는지는 서버에서 확인한다 — 로컬 목록이 오래됐으면 3-6 경고 없이 보고서를 지우게 된다.
    const reportId = await findTripReportId(id);
    if (reportId === 'error') {
      await notice('외근을 삭제하지 못했어요', '보고서가 있는지 확인하지 못했어요. 잠시 뒤 다시 해 주세요.');
      return;
    }
    const reports = useReportStore.getState();
    const reportTitle = reportId
      ? (reports.getById(reportId) ?? (await reports.loadDetail(reportId)))?.title
      : undefined;
    const ok = await confirm({
      title: '외근을 삭제할까요?',
      warning: reportId
        ? reportTitle
          ? `이 외근으로 만든 보고서 '${reportTitle}'도 함께 지워져요.`
          : '이 외근으로 만든 보고서도 함께 지워져요.'
        : undefined,
      message: '방문 기록과 이 외근에서만 들른 현장이 지워지고 되돌릴 수 없어요.',
      confirmLabel: '삭제',
      destructive: true,
    });
    if (!ok) return;
    frozenRef.current = { stops, reportState };
    setDeleting(true);
    // 서버의 외근 삭제(force)는 보고서를 남긴다(2026-10-17 실측, 백로그 C) — 보고서를 먼저 지운다.
    if (reportId) {
      const rr = await useReportStore.getState().remove(reportId);
      if (!rr.ok) {
        setDeleting(false);
        await notice('외근을 삭제하지 못했어요', `보고서를 지우지 못했어요. ${rr.error}`);
        return;
      }
    }
    const store = useTripStore.getState();
    let r = await store.remove(id);
    // 방문이 붙은 외근은 409 — 확인 창에서 함께 지워진다고 이미 알렸으므로 바로 강제 삭제한다.
    if (!r.ok && 'needsConfirm' in r) r = await store.remove(id, true);
    if (!r.ok) {
      setDeleting(false);
      const why = 'error' in r ? r.error : r.message;
      await notice(
        reportId ? '보고서는 지웠지만 외근을 삭제하지 못했어요. 다시 삭제해 주세요.' : '외근을 삭제하지 못했어요',
        why,
      );
      return;
    }
    void useReportStore.getState().refresh();
    // 화면 상태 변경과 이동을 한 배치에 섞지 않는다.
    requestAnimationFrame(() => goToTabRoot('trips'));
  };

  const openMore = () =>
    !deleteBusyRef.current &&
    showPopoverMenu(moreRef.current, [
      {
        label: '외근 삭제',
        icon: 'trash',
        tone: 'danger',
        onPress: () => void deleteTrip(),
      },
    ]);

  // 방문 0곳(3-3)은 보고서를 만들 수 없어 상태를 보이지 않는다.
  const stage = visitCount === 0 || reportState.stage === 'checking' ? null : STAGE_TAG[reportState.stage];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Header onBack={() => safeBack(router)} moreRef={moreRef} onMore={openMore} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.titleRow}>
          <View style={styles.titleWrap}>
            <EditableTitle value={title} onSubmit={saveTitle} maxLength={50} label="외근 제목" appearance="pencil" />
          </View>
          {stage ? (
            <Tag
              label={stage.label}
              tone={stage.tone}
              style={styles.tag}
              leading={
                stage.icon ? (
                  <Icon name={stage.icon} size={13} color={stage.tone === 'brand' ? c2.text.brand : c2.text.success} />
                ) : undefined
              }
            />
          ) : null}
        </View>
        <Text v2="bodyS.regular" tone="tertiary" style={styles.dateLine}>
          {fmtTripDateLine(trip)}
        </Text>
        <View style={styles.progress}>
          {stops.length > 0 ? (
            <View style={styles.dots}>
              {stops.map((s) =>
                s.kind === 'visit' ? (
                  <View key={s.key} style={styles.dot} />
                ) : (
                  <Icon key={s.key} name="skipped" size={12} color={c2.text.disabled} />
                ),
              )}
            </View>
          ) : null}
          <Text v2="bodyS.bold" tone="body">
            {`${visitCount}/${stops.length} 방문`}
          </Text>
        </View>

        <MapPreviewCard
          markers={markers}
          paths={route.paths}
          onExpand={openRouteMap}
          accessibilityLabel="외근 경로 지도 크게 보기"
          style={styles.map}
        />

        {stops.length > 0 ? (
          <Text v2="bodyM.bold" style={styles.sectionTitle}>
            {visitCount === 0 ? '계획한 현장' : '방문한 현장'}
          </Text>
        ) : null}
        {stops.map((s, i) => {
          const f = fieldById.get(s.fieldId);
          if (s.kind === 'skipped') {
            return <TripStopRow key={s.key} kind="skipped" order={s.order} title={fieldTitle(f)} divider={i > 0} />;
          }
          const vid = s.visit.id;
          return (
            <TripStopRow
              key={s.key}
              kind="visit"
              order={s.order}
              title={fieldTitle(f)}
              visitedAt={s.visit.visitedAt}
              status={fieldActionStatus(f)}
              expanded={expandedId === vid}
              onToggle={() => setExpandedId((cur) => (cur === vid ? null : vid))}
              photos={photosByVisit[vid]}
              memo={memoForVisit(directAttachments[s.fieldId], s.visit.visitedAt)?.text}
              onEdit={() => router.push(visitEditHref(vid, id) as never)}
              onOpenField={() => router.push(`/(tabs)/trips/fields/${s.fieldId}` as never)}
              divider={i > 0}
            />
          );
        })}
        {visitCount === 0 ? (
          <View style={styles.info}>
            <Text v2="bodyS.regular" tone="secondary">
              방문한 현장이 없어 보고서를 만들 수 없어요.
            </Text>
          </View>
        ) : null}
      </ScrollView>
      {visitCount > 0 ? <ReportFooter tripId={id} state={reportState} /> : null}
    </View>
  );
}

function Header({
  onBack,
  onMore,
  moreRef,
}: {
  onBack: () => void;
  onMore?: () => void;
  moreRef?: React.RefObject<View | null>;
}) {
  return (
    <View style={styles.header}>
      <Touchable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="외근 내역으로"
        style={styles.headerBtn}
      >
        <Icon name="arrow-left" size={24} color={c2.text.primary} />
      </Touchable>
      {onMore ? (
        <Touchable
          ref={moreRef}
          onPress={onMore}
          accessibilityRole="button"
          accessibilityLabel="외근 더보기"
          style={styles.headerBtn}
        >
          <Icon name="more" size={24} color={c2.text.primary} />
        </Touchable>
      ) : null}
    </View>
  );
}

/** 하단 바 — 작성 전 [보고서 작성] · 3-1 작성 중 '현장 N곳 중 M곳 작성했어요' + [이어서 작성] · 3-2 [보고서 보기]. */
function ReportFooter({ tripId, state }: { tripId: string; state: TripReportState }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );
  const report = state.report;
  const listFailed = useReportStore((s) => s.listStatus === 'error' && !s.listLoaded);
  // 상태를 모르는 동안엔 버튼을 두지 않는다 — 작성 전으로 잘못 보이면 같은 외근에 보고서가 둘 생긴다.
  if (state.stage === 'checking') {
    if (!listFailed) return null;
    return (
      <BottomActionBar
        safeArea={false}
        style={[styles.footer, styles.footerDraft]}
        header={
          <Text v2="caption.regular" tone="tertiary" style={styles.center}>
            보고서 상태를 확인하지 못했어요
          </Text>
        }
      >
        <Button2 variant="secondary" onPress={() => void useReportStore.getState().hydrate()} fullWidth>
          다시 시도
        </Button2>
      </BottomActionBar>
    );
  }
  if (state.stage === 'none' || !report) {
    // 보고서를 만들고 9-2 보고서 작성을 연다(reportEntry). 만드는 동안 버튼을 돌린다.
    const write = async () => {
      setCreating(true);
      const navigated = await openReportForTrip(router, tripId);
      // 이동한 틱에는 이 화면 상태를 바꾸지 않는다(Fabric 크래시 이력) — 다음 프레임에, 아직 있을 때만.
      if (navigated) requestAnimationFrame(() => mountedRef.current && setCreating(false));
      else if (mountedRef.current) setCreating(false);
    };
    return (
      <BottomActionBar safeArea={false} style={styles.footer}>
        <Button2 onPress={() => void write()} loading={creating} fullWidth>
          보고서 작성
        </Button2>
      </BottomActionBar>
    );
  }
  if (state.stage === 'draft') {
    const open = () => router.push(reportEditHref(report.id, 'create') as never);
    return (
      <BottomActionBar
        safeArea={false}
        style={[styles.footer, styles.footerDraft]}
        header={
          <Text v2="caption.regular" tone="tertiary" style={styles.center}>
            <Text v2="caption.bold" tone="link">
              {`현장 ${state.total ?? 0}곳 중 ${state.filled ?? 0}곳`}
            </Text>
            {' 작성했어요'}
          </Text>
        }
      >
        <Button2 onPress={open} fullWidth>
          이어서 작성
        </Button2>
      </BottomActionBar>
    );
  }
  return (
    <BottomActionBar safeArea={false} style={styles.footer}>
      <Button2 onPress={() => router.push(reportDetailHref(report.id) as never)} fullWidth>
        보고서 보기
      </Button2>
    </BottomActionBar>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c2.bg.canvas },
  center: { textAlign: 'center' },
  // Figma: 상태 표시줄 아래 4 에 44 버튼(좌 4·우 8).
  header: {
    height: 48,
    paddingTop: space[4],
    paddingLeft: space[4],
    paddingRight: space[8],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { paddingHorizontal: space[20], paddingBottom: space[24] },
  // 제목 줄(44)은 머리 아래로 3 겹쳐 올라가고 날짜 줄과도 5 겹친다(Figma 좌표 그대로).
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[8],
    marginTop: -3,
  },
  titleWrap: { flex: 1, minWidth: 0 },
  tag: { height: 26, marginTop: 9 },
  dateLine: { marginTop: -5 },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[10],
    marginTop: space[8],
  },
  dots: { flexDirection: 'row', alignItems: 'center', gap: space[6] },
  dot: {
    width: 12,
    height: 12,
    borderRadius: radius2.full,
    backgroundColor: c2.bg.brand,
  },
  map: { marginTop: 22 },
  sectionTitle: { marginTop: 22, marginBottom: space[4] },
  info: {
    marginTop: 22,
    paddingVertical: space[14],
    paddingHorizontal: space[16],
    borderRadius: radius2.lg,
    backgroundColor: c2.bg.subtle,
  },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[8],
    padding: space[20],
  },
  footer: {
    paddingTop: space[12],
    paddingBottom: 13,
    borderTopColor: c2.border.default,
    backgroundColor: c2.bg.canvas,
  },
  footerDraft: { paddingTop: space[10], paddingBottom: space[12] },
});
