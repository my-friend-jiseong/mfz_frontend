import { fieldTitle } from '@/utils/fieldFacets';
import React, { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toAbsoluteFileUrl } from '@/api';
import type { VisitPhoto } from '@/api';
import { Icon } from '@/components/icons';
import { DashedBox, OrderBadge, SLOTS, SLOT_CAPTION, SLOT_URL, useReportRows, type Slot } from '@/components/reports/ReportParts';
import { ReportModalHeader } from '@/components/reports/ReportModalHeader';
import { STATUS_TONE } from '@/components/trips/TripStopRow';
import { showPopoverMenu } from '@/components/ui/PopoverMenu';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { Button2 } from '@/components/ui/Button2';
import { confirm, notice } from '@/components/ui/ConfirmDialog';
import { KeyboardAvoid } from '@/components/ui/KeyboardAvoid';
import { STATUS_LABEL } from '@/components/ui/StatusMark';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { useFieldStore } from '@/stores/fieldStore';
import { useReportStore } from '@/stores/reportStore';
import { useTripStore } from '@/stores/tripStore';
import { useVisitStore } from '@/stores/visitStore';
import { safeBack } from '@/utils/backNavigation';
import { fmtMonthDay, fmtTime } from '@/utils/datetime';
import { fieldActionStatus } from '@/utils/fieldStatus';
import { withObjectJosa } from '@/utils/josa';
import { pickPhoto, promptPhotoSource, type UploadFile } from '@/utils/media';
import { memoForVisit } from '@/utils/visitRecord';
import { c2, radius2, space, type2 } from '@/theme/v2';
import type { FieldReportInput } from '@/api';
import type { Visit } from '@/types/entities';

const CAPTION_MAX = 200;

interface SlotState {
  /** 서버 경로('/storage/…'). 새로 고른 파일이면 null. */
  url: string | null;
  /** 새로 고른 사진 — 저장할 때 올린다. */
  file?: UploadFile;
  caption: string;
}
type Slots = Record<Slot, SlotState>;
const EMPTY: Slots = {
  before: { url: null, caption: '' },
  pending: { url: null, caption: '' },
  after: { url: null, caption: '' },
};

/**
 * 9-8 현장 보고(Figma 714:3536) · 9-11 현장 보고 추가(619:3366). 한 화면이다.
 *   ?reportId&frId            9-8 — 이 현장 보고의 전·중·후 사진과 설명을 고친다. [보고서에서 빼기](9-9) · [저장]
 *   ?reportId&fieldId[&visitId] 9-11 — 9-10 에서 고른 현장을 빈 칸으로. [보고서에 넣기] → 9-6 맨 아래 '작성 전'(9-14)
 * 아래 '방문 사진'을 누르면 첫 빈 칸에 들어간다(이미 들어간 사진은 다시 누르면 뺀다). 빈 칸을 누르면 사진을 찍거나 고른다.
 * 저장할 때 서버에 보낸다 — 닫으면(X) 고친 것을 버린다.
 */
export default function FieldReportScreen() {
  const params = useLocalSearchParams<{ reportId: string; frId?: string; fieldId?: string; visitId?: string }>();
  const reportId = params.reportId ?? '';
  const frId = params.frId;
  const adding = !frId;
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const report = useReportStore((s) => s.detailCache[reportId]);
  useEffect(() => {
    if (reportId && !useReportStore.getState().detailCache[reportId]?.fieldReports) void useReportStore.getState().loadDetail(reportId);
  }, [reportId]);
  const { rows } = useReportRows(report?.fieldReports);
  const row = frId ? rows.find((r) => r.fr.id === frId) : undefined;
  const fieldId = row?.fr.fieldId ?? params.fieldId ?? '';
  const field = useFieldStore((s) => s.fields.find((f) => f.id === fieldId));
  const attachments = useFieldStore((s) => (fieldId ? s.directAttachments[fieldId] : undefined));
  const order = row ? row.order : rows.length + 1;
  const kind = fieldActionStatus(field);

  // 현장(방문 기록·메모)을 받는다.
  useEffect(() => {
    if (fieldId && !useFieldStore.getState().directAttachments[fieldId]) void useFieldStore.getState().loadDetail(fieldId);
  }, [fieldId]);
  const tripId = report?.tripId ?? null;
  useEffect(() => {
    // 방문 캐시는 다른 화면이 일부만 채워 두었을 수 있다 — 이 외근의 방문을 늘 다시 받는다.
    if (tripId) void useTripStore.getState().loadDetail(tripId);
  }, [tripId]);

  // 사진·메모를 보여 줄 방문. 9-8 은 이 외근에서 이 현장에 들른 방문, 없으면(다른 외근에서 넣은 현장) 가장 최근 방문.
  const visits = useVisitStore((s) => s.visits);
  const { photoVisits, headVisit, inTrip } = useMemo(() => {
    const ofField = visits.filter((v) => v.fieldId === fieldId).sort((a, b) => a.visitedAt.localeCompare(b.visitedAt));
    const byParam = params.visitId ? ofField.find((v) => v.id === params.visitId) : undefined;
    if (byParam) return { photoVisits: [byParam], headVisit: byParam, inTrip: !adding && byParam.tripId === tripId };
    const tripOnes = !adding && tripId ? ofField.filter((v) => v.tripId === tripId) : [];
    if (tripOnes.length > 0) return { photoVisits: tripOnes, headVisit: tripOnes[tripOnes.length - 1], inTrip: true };
    const last = ofField[ofField.length - 1] as Visit | undefined;
    return { photoVisits: last ? [last] : [], headVisit: last, inTrip: false };
  }, [visits, fieldId, params.visitId, tripId, adding]);
  const photosByVisit = useVisitStore((s) => s.photosByVisit);
  const visitKey = photoVisits.map((v) => `${v.tripId}:${v.id}`).join(',');
  useEffect(() => {
    if (!visitKey) return;
    for (const pair of visitKey.split(',')) {
      const [t, v] = pair.split(':');
      if (!useVisitStore.getState().photosByVisit[v]) void useVisitStore.getState().loadPhotos(t, v);
    }
  }, [visitKey]);
  const visitPhotos = useMemo<VisitPhoto[]>(
    () =>
      photoVisits
        .flatMap((v) => photosByVisit[v.id] ?? [])
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [photoVisits, photosByVisit],
  );
  const memo = headVisit ? memoForVisit(attachments, headVisit.visitedAt)?.text?.trim() : undefined;

  // 칸 — 9-8 은 현장 보고가 도착했을 때 한 번 채운다.
  const [slots, setSlots] = useState<Slots>(EMPTY);
  const initial = useRef<Slots | null>(adding ? EMPTY : null);
  useEffect(() => {
    if (initial.current || !row) return;
    const s: Slots = {
      before: { url: row.fr.beforePhotoUrl ?? null, caption: row.fr.beforePhotoCaption ?? '' },
      pending: { url: row.fr.pendingPhotoUrl ?? null, caption: row.fr.pendingPhotoCaption ?? '' },
      after: { url: row.fr.afterPhotoUrl ?? null, caption: row.fr.afterPhotoCaption ?? '' },
    };
    initial.current = s;
    setSlots(s);
  }, [row]);

  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const setSlot = (k: Slot, patch: Partial<SlotState>) => setSlots((cur) => ({ ...cur, [k]: { ...cur[k], ...patch } }));
  const filled = (s: SlotState) => !!(s.url || s.file);
  const slotOfPhoto = (url: string): Slot | undefined => SLOTS.find((s) => !slots[s.key].file && slots[s.key].url === url)?.key;
  const timeOf = (url: string | null) => {
    const p = url ? visitPhotos.find((x) => x.fileUrl === url) : undefined;
    return p ? fmtTime(p.createdAt) : null;
  };

  // 방문 사진을 누르면 빈 칸에 넣는다. 빈 칸이 둘 이상이면 어느 칸인지 고른다 —
  // 첫 빈 칸에만 넣으면 '조치 후'만 있는 현장(전·중을 못 찍음)을 만들 수 없었다(2026-10-27, Figma 9-8 예시도 중이 빈 칸).
  const thumbRefs = useRef<Record<string, View | null>>({});
  const onPhotoPress = (p: VisitPhoto) => {
    const used = slotOfPhoto(p.fileUrl);
    if (used) {
      setSlot(used, { url: null, file: undefined });
      return;
    }
    const empties = SLOTS.filter((s) => !filled(slots[s.key]));
    if (empties.length === 0) {
      void notice('빈 칸이 없어요', '칸의 사진을 뺀 뒤 다시 넣어 주세요.');
      return;
    }
    const put = (k: Slot) => setSlot(k, { url: p.fileUrl, file: undefined });
    if (empties.length === 1) {
      put(empties[0].key);
      return;
    }
    showPopoverMenu(
      thumbRefs.current[p.attachmentId] ?? null,
      empties.map((s) => ({ label: `${s.label}에 넣기`, onPress: () => put(s.key) })),
    );
  };

  const slotRefs = useRef<Partial<Record<Slot, View | null>>>({});
  const onSlotPress = (k: Slot) => {
    if (filled(slots[k])) {
      // 항목 하나짜리라 아래 시트(옛 액션 시트) 대신 누른 칸에 붙는 메뉴로 — 손가락 옆에서 바로 고른다.
      showPopoverMenu(slotRefs.current[k] ?? null, [
        { label: '사진 빼기', icon: 'trash', tone: 'danger', onPress: () => setSlot(k, { url: null, file: undefined }) },
      ]);
      return;
    }
    promptPhotoSource((src) => {
      void pickPhoto(src).then((file) => {
        if (file && mounted.current) setSlot(k, { url: null, file });
      });
    });
  };

  const done = () => {
    busy.current = false;
    if (mounted.current) safeBack(router);
  };
  const fail = async (title: string, msg: string) => {
    busy.current = false;
    if (!mounted.current) return;
    setSaving(false);
    await notice(title, msg);
  };

  const uploadFiles = async (targetId: string): Promise<string | null> => {
    for (const s of SLOTS) {
      const st = slots[s.key];
      if (!st.file) continue;
      const r = await useReportStore.getState().uploadFieldReportPhoto(reportId, targetId, {
        slot: s.key,
        file: st.file,
        caption: st.caption.trim() || undefined,
      });
      if (!r.ok) return r.error;
    }
    return null;
  };

  const save = async () => {
    if (busy.current || !fieldId) return;
    busy.current = true;
    setSaving(true);
    const body: Partial<FieldReportInput> = {};
    for (const s of SLOTS) {
      const st = slots[s.key];
      body[SLOT_CAPTION[s.key]] = st.caption.trim() || null;
      if (st.file) continue;
      // 바뀐 칸만 보낸다. null = 사진 빼기(2026-09-30 실측: PATCH null 로 지워짐).
      if (adding ? !!st.url : st.url !== (initial.current?.[s.key].url ?? null)) body[SLOT_URL[s.key]] = st.url;
    }
    if (adding) {
      const r = await useReportStore.getState().addFieldReport(reportId, { fieldId, ...body });
      if (!r.ok) {
        await fail('보고서에 넣지 못했어요', r.error);
        return;
      }
      const err = await uploadFiles(r.fieldReportId);
      if (err) {
        // 현장 보고는 이미 들어갔다 — 알린 뒤 닫고 9-6 에서 다시 채우게 한다.
        await notice('사진 일부를 올리지 못했어요', '현장은 보고서에 넣었어요. 현장 행을 눌러 사진을 다시 넣어 주세요.');
        done();
        return;
      }
      done();
      return;
    }
    const r = await useReportStore.getState().updateFieldReport(reportId, frId!, body);
    if (!r.ok) {
      await fail('저장하지 못했어요', r.error);
      return;
    }
    const err = await uploadFiles(frId!);
    if (err) {
      await fail('사진을 올리지 못했어요', err);
      return;
    }
    done();
  };

  const removeFromReport = async () => {
    if (busy.current || !frId) return;
    const ok = await confirm({
      title: `${withObjectJosa(fieldTitle(field))} 보고서에서 뺄까요?`,
      message: '이 현장의 전·중·후 사진과 설명이 보고서에서 빠져요. 외근의 방문 기록은 그대로 남아요.',
      confirmLabel: '빼기',
      destructive: true,
    });
    if (!ok) return;
    busy.current = true;
    setSaving(true);
    const r = await useReportStore.getState().removeFieldReport(reportId, frId);
    if (!r.ok) {
      await fail('보고서에서 빼지 못했어요', r.error);
      return;
    }
    done();
  };

  const missing = !adding && report?.fieldReports && !row;
  const photosTitle = inTrip ? '이번 방문 사진' : headVisit ? `${fmtMonthDay(headVisit.visitedAt)} 방문 사진` : '방문 사진';
  const headLine = headVisit
    ? inTrip
      ? `${fmtMonthDay(headVisit.visitedAt)} ${fmtTime(headVisit.visitedAt)} 체크인 · `
      : `${fmtMonthDay(headVisit.visitedAt)} 방문 · `
    : '';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ReportModalHeader title={adding ? '현장 보고 추가' : '현장 보고'} onClose={() => !busy.current && safeBack(router)} />
      {missing ? (
        <View style={styles.missing}>
          <Text v2="bodyM.regular" tone="tertiary">
            이 현장 보고를 찾을 수 없어요.
          </Text>
        </View>
      ) : (
        <KeyboardAvoid style={styles.flex}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
            <View style={styles.head}>
              <OrderBadge n={order} kind={kind} />
              <View style={styles.flex}>
                <Text v2="button" numberOfLines={1}>
                  {fieldTitle(field)}
                </Text>
                <Text v2="caption.regular" tone="tertiary" numberOfLines={1}>
                  {headLine}
                  <Text v2="caption.semibold" tone={STATUS_TONE[kind]}>
                    {STATUS_LABEL[kind]}
                  </Text>
                </Text>
              </View>
            </View>

            <View style={styles.slots}>
              {SLOTS.map((s) => {
                const st = slots[s.key];
                const uri = st.file?.uri ?? toAbsoluteFileUrl(st.url);
                const time = st.file ? null : timeOf(st.url);
                return (
                  <View key={s.key} style={styles.slotCol}>
                    <Text v2="caption.bold" tone="body" style={styles.slotLabel}>
                      {s.label}
                    </Text>
                    <SlotPhoto
                      ref={(r) => {
                        slotRefs.current[s.key] = r;
                      }}
                      uri={uri}
                      time={time}
                      label={s.label}
                      onPress={() => onSlotPress(s.key)}
                    />
                    <TextInput
                      value={st.caption}
                      onChangeText={(v) => setSlot(s.key, { caption: v })}
                      placeholder="설명"
                      placeholderTextColor={c2.text.tertiary}
                      maxLength={CAPTION_MAX}
                      accessibilityLabel={`${s.label} 설명`}
                      style={styles.caption}
                    />
                  </View>
                );
              })}
            </View>

            {visitPhotos.length > 0 ? (
              <View style={styles.section}>
                <View style={styles.sectionHead}>
                  <Text v2="bodyM.bold">
                    {`${photosTitle} `}
                    <Text v2="bodyM.semibold" tone="tertiary">
                      {String(visitPhotos.length)}
                    </Text>
                  </Text>
                  <Text v2="caption.regular" tone="tertiary">
                    눌러서 빈 칸에 넣기
                  </Text>
                </View>
                <View style={styles.thumbs}>
                  {visitPhotos.map((p) => {
                    const used = slotOfPhoto(p.fileUrl);
                    const short = used ? SLOTS.find((x) => x.key === used)?.short : undefined;
                    return (
                      <Touchable
                        key={p.attachmentId}
                        ref={(r) => {
                          thumbRefs.current[p.attachmentId] = r;
                        }}
                        onPress={() => onPhotoPress(p)}
                        accessibilityRole="button"
                        accessibilityLabel={`${fmtTime(p.createdAt)} 사진${short ? `, ${short} 칸에 넣음` : ''}`}
                        style={[styles.thumbBtn, used && styles.thumbUsed]}
                      >
                        <View style={styles.thumb}>
                          <Image source={{ uri: toAbsoluteFileUrl(p.fileUrl) ?? undefined }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                          <View style={styles.timeBadge}>
                            <Text v2="tiny" tone="inverse">
                              {fmtTime(p.createdAt)}
                            </Text>
                          </View>
                        </View>
                        {short ? (
                          <View style={styles.usedBadge}>
                            <Text v2="micro.bold" tone="inverse">
                              {short}
                            </Text>
                          </View>
                        ) : null}
                      </Touchable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {memo ? (
              <View style={styles.section}>
                <Text v2="bodyM.bold" style={styles.memoLabel}>
                  방문 메모
                </Text>
                <View style={styles.memo}>
                  <Text v2="bodyS.regular" tone="body">
                    {memo}
                  </Text>
                </View>
              </View>
            ) : null}
          </ScrollView>
          <BottomActionBar
            style={styles.footer}
            secondary={
              adding ? undefined : (
                <Button2 variant="danger" onPress={() => void removeFromReport()} disabled={saving} style={styles.removeBtn}>
                  보고서에서 빼기
                </Button2>
              )
            }
          >
            <Button2 onPress={() => void save()} loading={saving} disabled={!fieldId} fullWidth>
              {adding ? '보고서에 넣기' : '저장'}
            </Button2>
          </BottomActionBar>
        </KeyboardAvoid>
      )}
    </View>
  );
}

/** 전·중·후 칸(110 정사각). 비었으면 점선 + '사진 넣기'. */
const SlotPhoto = forwardRef<View, { uri: string | null | undefined; time: string | null; label: string; onPress: () => void }>(function SlotPhoto(
  { uri, time, label, onPress },
  ref,
) {
  const [size, setSize] = useState(0);
  return (
    <Touchable
      ref={ref}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={uri ? `${label} 사진, 눌러서 빼기` : `${label} 사진 넣기`}
      onLayout={(e) => setSize(Math.round(e.nativeEvent.layout.width))}
      style={[styles.slot, uri ? styles.slotFilled : styles.slotEmpty]}
    >
      {uri ? (
        <>
          <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          {time ? (
            <View style={styles.timeBadge}>
              <Text v2="tiny" tone="inverse">
                {time}
              </Text>
            </View>
          ) : null}
        </>
      ) : (
        <>
          <DashedBox size={size} radius={radius2.md} color={c2.border.brandMuted} />
          <Icon name="plus" size={20} color={c2.text.brand} />
          <Text v2="caption.bold" tone="brand">
            사진 넣기
          </Text>
        </>
      )}
    </Touchable>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c2.bg.canvas },
  flex: { flex: 1 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: space[20], paddingTop: space[8], paddingBottom: space[24] },
  head: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[12],
    paddingHorizontal: space[14],
    paddingVertical: space[10],
    borderRadius: radius2.xl,
    backgroundColor: c2.bg.subtle,
  },
  slots: { flexDirection: 'row', gap: space[10], marginTop: space[20] },
  slotCol: { flex: 1 },
  slotLabel: { marginBottom: space[6] },
  slot: {
    aspectRatio: 1,
    borderRadius: radius2.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
  },
  slotFilled: { backgroundColor: c2.bg.placeholder },
  slotEmpty: { backgroundColor: c2.bg.brandSubtle },
  timeBadge: {
    position: 'absolute',
    left: 5,
    bottom: 5,
    paddingHorizontal: 5,
    borderRadius: 5,
    backgroundColor: c2.bg.photoBadge,
  },
  caption: {
    ...type2['caption.regular'],
    color: c2.text.primary,
    height: 40,
    marginTop: space[6],
    paddingHorizontal: space[10],
    paddingVertical: 0,
    borderRadius: radius2.sm,
    borderWidth: 1,
    borderColor: c2.border.default,
    backgroundColor: c2.bg.canvas,
  },
  section: { marginTop: space[20] },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: space[10], marginTop: space[14] },
  thumbBtn: { width: 64, height: 64 },
  thumb: { width: 64, height: 64, borderRadius: radius2.md, overflow: 'hidden', backgroundColor: c2.bg.placeholder },
  // Figma 9-8: 칸에 넣은 사진은 오른쪽 위 단계 배지와 함께 흐리게(0.55).
  thumbUsed: { opacity: 0.55 },
  usedBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 21,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c2.bg.brand,
  },
  memoLabel: { marginBottom: space[6] },
  memo: { paddingHorizontal: space[14], paddingVertical: space[12], borderRadius: radius2.lg, backgroundColor: c2.bg.subtle },
  footer: { paddingTop: space[12], borderTopColor: c2.border.default },
  // Figma 9-8 하단: [보고서에서 빼기] 134.9 · [저장] 215.1.
  removeBtn: { width: 135, paddingHorizontal: space[8] },
});
