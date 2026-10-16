import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapPreviewCard } from '@/components/MapPreviewCard';
import { CheckinPhotos } from '@/components/checkin/CheckinPhotos';
import { NearbyFieldSheet } from '@/components/checkin/NearbyFieldSheet';
import { ProjectSheet } from '@/components/fields/ProjectSheet';
import { CategorySheet } from '@/components/fields/CategorySheet';
import { useKakaoPlaceSearch } from '@/components/fields/useKakaoPlaceSearch';
import { openFullMap } from '@/components/shell/fullMap';
import { STATUS_PIN_COLOR } from '@/components/shell/pinColors';
import { goToTabRoot } from '@/components/shell/tabNav';
import type { KakaoMapMarker, MapPinKind } from '@/components/KakaoMapWebView';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { Button2 } from '@/components/ui/Button2';
import { CheckinPill } from '@/components/ui/CheckinPill';
import { confirm, notice } from '@/components/ui/ConfirmDialog';
import { EditableTitle } from '@/components/ui/EditableTitle';
import { KeyboardAvoid } from '@/components/ui/KeyboardAvoid';
import { MemoField } from '@/components/ui/MemoField';
import { StatusOptionGroup } from '@/components/ui/StatusOption';
import { Tag } from '@/components/ui/Tag';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { Touchable } from '@/components/ui/Touchable';
import { Icon } from '@/components/icons';
import { useFieldStore } from '@/stores/fieldStore';
import { useFieldDraftStore, type FieldDraft } from '@/stores/fieldDraftStore';
import { useVisitStore } from '@/stores/visitStore';
import { useTripStore } from '@/stores/tripStore';
import { useDestinationStore } from '@/stores/destinationStore';
import { useProjectStore } from '@/stores/projectStore';
import { isKnownOffline, useCheckinQueueStore } from '@/stores/checkinQueueStore';
import type { Field, FieldStatus } from '@/types/entities';
import { fieldActionStatus } from '@/utils/fieldStatus';
import { fieldTitle } from '@/utils/fieldFacets';
import { districtOf, pickedPlaceName, stripRegion } from '@/utils/addressFormat';
import { findNearbyFields, formatDistanceM, type NearbyField } from '@/utils/nearestField';
import { peekUserLocation, requestUserLocation, type UserLocation } from '@/utils/geolocation';
import { memoForVisit, photosToList, saveVisitRecord, type CheckinPhoto } from '@/utils/visitRecord';
import { createFieldFromPlace } from '@/utils/placeToField';
import { reconcileCategories, waitForCategoryCascade } from '@/utils/categoryCascade';
import { fmtMonthDay, fmtTime } from '@/utils/datetime';
import { tripTitle } from '@/utils/tripFormat';
import { safeBack } from '@/utils/backNavigation';
import { c2, radius2, space } from '@/theme/v2';

/**
 * GPS 오차가 이보다 크면(m) 8-5 'GPS 신호 약함' 경고 줄과 주황 오차 원을 보인다.
 * 50m: 100m 자동 연결 판정의 절반 — 이보다 크면 가까운 현장을 잘못 붙이거나 새 현장 위치가 눈에 띄게 어긋난다.
 * Figma 8-5 예시는 ±48m(경고), iOS kCLLocationAccuracyHundredMeters·Android Balanced 가 ~100m 라 실내·도심 협곡에서 넘는다.
 */
export const WEAK_GPS_ACCURACY_M = 50;
// Figma 8: 영역 사이 22, 제목(22) 아래 내용까지 10. 2차 Spacing 변수에 22 가 없어 프레임 값 그대로.
const SECTION_GAP = 22;

type Mode = 'destination' | 'resolving' | 'nearby' | 'new' | 'edit';

/**
 * 체크인(8 · 8-3 새 현장 · 8-4 근처 현장 · 8-5 GPS 약함)과 방문 기록 수정(3-7)을 한 화면으로.
 * X 로 닫는 모달(루트 (modals) 스택, 탭 바를 가림). 방문은 [저장]을 눌러야 만든다 — 닫으면 8-13 확인 후 버린다.
 * 위 알약의 시각은 이 화면을 연 시각(v138). 조치 상태 기본값은 그 현장의 마지막 조치 상태.
 */
export default function CheckinScreen() {
  const params = useLocalSearchParams<{ fieldId?: string; mode?: string; visitId?: string; tripId?: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [openedAt] = useState(() => new Date().toISOString());

  const isEdit = !!params.visitId;
  const [mode, setMode] = useState<Mode>(isEdit ? 'edit' : params.mode === 'here' ? 'resolving' : 'destination');
  const [pos, setPos] = useState<UserLocation | null>(null);
  const [nearby, setNearby] = useState<NearbyField<Field>[]>([]);
  const [linkedId, setLinkedId] = useState<string | null>(params.fieldId ?? null);
  const [draftKey] = useState(() => `checkin-${Date.now().toString(36)}`);
  const draft = useFieldDraftStore((s) => s.drafts[draftKey]);
  const { reverse, element: placeBridge } = useKakaoPlaceSearch();

  const activeTripId = useTripStore((s) => s.activeTripId);
  const trips = useTripStore((s) => s.trips);
  const fields = useFieldStore((s) => s.fields);
  const allVisits = useVisitStore((s) => s.visits);
  const destinations = useDestinationStore((s) => s.destinations);

  // === 수정 모드(3-7) 대상 ===
  const visitId = params.visitId ?? '';
  const editTripId = params.tripId ?? '';
  const visit = useVisitStore((s) => (visitId ? s.visits.find((v) => v.id === visitId) : undefined));
  const visitPhotos = useVisitStore((s) => (visitId ? s.photosByVisit[visitId] : undefined));

  const fieldId = mode === 'edit' ? (visit?.fieldId ?? null) : mode === 'new' || mode === 'resolving' ? null : linkedId;
  const field = useMemo(() => (fieldId ? fields.find((f) => f.id === fieldId) : undefined), [fields, fieldId]);
  const attachments = useFieldStore((s) => (fieldId ? s.directAttachments[fieldId] : undefined));

  // 화면에 그릴 값.
  const [status, setStatus] = useState<FieldStatus | null>(null);
  const statusTouched = useRef(false);
  const [photos, setPhotos] = useState<CheckinPhoto[]>([]);
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [nearbyOpen, setNearbyOpen] = useState(false);
  // 수정 모드: 사진·메모 로드가 끝났는지(실패 포함). 실패해도 폼은 연다 — 빈 칸으로라도 고칠 수 있게.
  const [photosLoaded, setPhotosLoaded] = useState(!isEdit);
  const [memoLoaded, setMemoLoaded] = useState(!isEdit);
  // 현장 상세를 한 번 받아 봤는가 — 그래도 없으면 '현장을 찾을 수 없어요'.
  const [detailTried, setDetailTried] = useState(false);
  // 닫기 막기(8-13)·저장 중 표시.
  const allowLeave = useRef(false);
  const savingRef = useRef(false);
  const dirtyRef = useRef(false);

  // === 진입 — 현장·방문을 받는다 ===
  useEffect(() => {
    void useProjectStore.getState().refresh();
    if (isEdit) {
      if (!useVisitStore.getState().getById(visitId) && editTripId) void useTripStore.getState().loadDetail(editTripId);
      if (editTripId) void useVisitStore.getState().loadPhotos(editTripId, visitId).finally(() => setPhotosLoaded(true));
      else setPhotosLoaded(true);
      return;
    }
    if (params.mode !== 'here') {
      // 체크인 카드의 내 위치 점 — 권한을 묻지 않고 읽는다(목적지 체크인은 위치 없이도 된다).
      void peekUserLocation().then((p) => p && setPos(p));
      return;
    }
    // 지금 위치 기록 — 현장 목록을 받기 전이면 가까운 현장을 못 찾는다. 먼저 받는다.
    let alive = true;
    void (async () => {
      const fs = useFieldStore.getState();
      const listing = fs.listStatus === 'ready' ? Promise.resolve() : fs.hydrate();
      const [p] = await Promise.all([requestUserLocation({ high: true }), listing]);
      if (!alive) return;
      if (!p) {
        await notice('지금 위치를 알 수 없어요', '위치 권한을 켜고 다시 해 주세요.');
        if (alive) {
          allowLeave.current = true;
          safeBack(router);
        }
        return;
      }
      setPos(p);
      const near = findNearbyFields(p, useFieldStore.getState().fields);
      setNearby(near);
      if (near.length > 0) {
        setLinkedId(near[0].field.id);
        setMode('nearby');
      } else startNewField(p);
    })();
    return () => {
      alive = false;
    };
    // 진입 때 한 번.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!fieldId) return;
    void useFieldStore
      .getState()
      .loadDetail(fieldId)
      .finally(() => {
        setMemoLoaded(true);
        setDetailTried(true);
      });
  }, [fieldId]);
  useEffect(() => {
    if (isEdit && visit && !trips.some((t) => t.id === visit.tripId)) void useTripStore.getState().loadDetail(visit.tripId);
  }, [isEdit, visit, trips]);
  // 화면이 닫히면 새 현장 입력값을 지운다.
  useEffect(() => () => useFieldDraftStore.getState().remove(draftKey), [draftKey]);

  const startNewField = (p: UserLocation) => {
    const base: FieldDraft = {
      name: '',
      detail: '',
      categories: [],
      categoriesAt: Date.now(),
      projectId: null,
      projectName: null,
      road: '',
      jibun: '',
      lat: p.lat,
      lng: p.lng,
      moved: false,
    };
    useFieldDraftStore.getState().put(draftKey, base);
    statusTouched.current = false;
    setStatus('pending');
    setMode('new');
    void reverse(p.lat, p.lng).then((a) => {
      const cur = useFieldDraftStore.getState().drafts[draftKey];
      if (!a || !cur || cur.moved) return;
      useFieldDraftStore.getState().patch(draftKey, { road: a.roadAddress, jibun: a.jibunAddress, sido: a.sido, sigungu: a.sigungu });
    });
  };

  // === 조치 상태 기본값 = 그 현장의 마지막 조치 상태(인수인계). 새 현장은 조치 전. ===
  const baseStatus: FieldStatus | null = mode === 'new' ? 'pending' : field ? fieldActionStatus(field) : null;
  const initialStatusRef = useRef<FieldStatus | null>(null);
  useEffect(() => {
    if (statusTouched.current || !baseStatus) return;
    initialStatusRef.current = baseStatus;
    setStatus(baseStatus);
  }, [baseStatus]);

  // === 수정 모드: 기존 사진·메모를 채운다(사진·메모가 도착한 뒤 한 번) ===
  const initialMemo = useMemo(() => (isEdit && visit ? memoForVisit(attachments, visit.visitedAt) : null), [isEdit, visit, attachments]);
  const filled = useRef(!isEdit);
  useEffect(() => {
    if (filled.current || !visit || !photosLoaded || !memoLoaded) return;
    filled.current = true;
    setPhotos(photosToList(visitPhotos));
    setMemo(initialMemo?.text ?? '');
  }, [visit, visitPhotos, initialMemo, photosLoaded, memoLoaded]);

  // === 닫기(X·안드로이드 뒤로·웹 뒤로) — 8-13. 체크인은 늘 묻고, 수정은 바꾼 것이 있을 때만. ===
  dirtyRef.current = isEdit
    ? (status !== null && status !== initialStatusRef.current) ||
      memo.trim() !== (initialMemo?.text ?? '').trim() ||
      photos.some((p) => p.file)
    : mode !== 'resolving';
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (allowLeave.current) return;
        if (savingRef.current) {
          e.preventDefault();
          return;
        }
        if (!dirtyRef.current) return;
        e.preventDefault();
        void confirm(
          isEdit
            ? { title: '수정을 그만둘까요?', message: '바꾼 내용은 저장되지 않아요.', cancelLabel: '계속 수정', confirmLabel: '그만두기', destructive: true }
            : { title: '체크인을 그만둘까요?', message: '이번 방문 기록과 사진은 저장되지 않아요.', cancelLabel: '계속 기록', confirmLabel: '그만두기', destructive: true },
        ).then((ok) => {
          if (!ok) return;
          allowLeave.current = true;
          navigation.dispatch(e.data.action);
        });
      }),
    [navigation, isEdit],
  );
  const close = () => safeBack(router, isEdit && editTripId ? `/(tabs)/trips/${editTripId}` : undefined);

  // === 표시 값 ===
  const time = fmtTime(openedAt);
  const tripDests = useMemo(
    () => (activeTripId ? destinations.filter((d) => d.tripId === activeTripId).sort((a, b) => a.order - b.order) : []),
    [destinations, activeTripId],
  );
  const destIndex = fieldId ? tripDests.findIndex((d) => d.fieldId === fieldId) : -1;
  const pillLabel =
    mode === 'edit'
      ? visit
        ? `기록 수정 · ${fmtMonthDay(visit.visitedAt)} ${fmtTime(visit.visitedAt)} 체크인`
        : '기록 수정'
      : mode === 'new'
        ? `체크인 · 새 현장 · ${time}`
        : mode === 'nearby'
          ? `체크인 · 근처 현장 · ${time}`
          : destIndex >= 0
            ? `체크인 · ${destIndex + 1}/${tripDests.length} · ${time}`
            : `체크인 · ${time}`;
  // 다음에 갈 목적지가 남았으면 '저장하고 다음 현장으로'(Figma 8), 아니면 '저장'.
  const hasNextDest = tripDests.some((d) => d.status === 'pending' && d.fieldId !== fieldId);
  const saveLabel = mode === 'new' ? '새 현장으로 저장' : mode === 'destination' && hasNextDest ? '저장하고 다음 현장으로' : '저장';

  const visitOrdinal = field
    ? allVisits.filter((v) => v.fieldId === field.id && v.tripId !== activeTripId).length + 1
    : 0;
  const editTrip = isEdit && visit ? trips.find((t) => t.id === visit.tripId) : undefined;
  const subtitle = field
    ? [districtOf(field.address), isEdit ? (editTrip ? tripTitle(editTrip) : null) : `방문 ${visitOrdinal}번째`]
        .filter(Boolean)
        .join(' · ')
    : '';

  const weakGps = mode === 'new' && !!draft && !draft.moved && pos?.accuracy != null && pos.accuracy > WEAK_GPS_ACCURACY_M;
  const accuracyCircle =
    mode === 'new' && draft && !draft.moved && pos?.accuracy != null
      ? { lat: pos.lat, lng: pos.lng, radius: pos.accuracy, tone: weakGps ? ('warning' as const) : ('brand' as const) }
      : null;
  const draftPlace = draft ? (draft.jibun || draft.road ? pickedPlaceName(draft.jibun, draft.road) : '지금 위치') : '';

  const pin = useMemo<{ id: string; lat: number; lng: number; kind: MapPinKind; label: string } | null>(() => {
    if (mode === 'new' && draft) return { id: 'new', lat: draft.lat, lng: draft.lng, kind: 'new', label: draftPlace };
    if (field) return { id: field.id, lat: field.latitude, lng: field.longitude, kind: fieldActionStatus(field), label: fieldTitle(field) };
    return null;
  }, [mode, draft, field, draftPlace]);
  const markers = useMemo<KakaoMapMarker[]>(
    () => (pin ? [{ id: pin.id, lat: pin.lat, lng: pin.lng, label: pin.label, color: STATUS_PIN_COLOR[pin.kind], pin: pin.kind, selected: true }] : []),
    [pin],
  );
  // 수정 모드는 지금 위치가 체크인 위치가 아니라 그리지 않는다.
  const myDot = mode === 'edit' || !pos ? null : { lat: pos.lat, lng: pos.lng };

  const openMap = () => {
    if (!pin) return;
    const title =
      mode === 'new'
        ? `${draftPlace} · ${weakGps && pos?.accuracy != null ? `오차 ±${Math.round(pos.accuracy)}m` : '새 현장'}`
        : [pin.label, field ? districtOf(field.address) : null].filter(Boolean).join(' · ');
    openFullMap({
      title,
      pins: [{ id: pin.id, lat: pin.lat, lng: pin.lng, kind: pin.kind, selected: true, label: pin.label }],
      myLocation: myDot,
      accuracyCircle,
      nearbyFields: true,
    });
  };

  // === 저장 ===
  // 새 현장을 만든 뒤 체크인이 실패하면, 다시 누를 때 현장을 또 만들지 않는다.
  const createdFieldRef = useRef<Field | null>(null);
  const fail = async (title: string, message?: string) => {
    savingRef.current = false;
    setSaving(false);
    await notice(title, message);
  };
  // 체크인을 마치고 7 외근 진행(7-8)으로. 떠나는 화면은 바꾸지 않는다(같은 틱 setState + 이동 금지).
  const finishCheckin = (saved: boolean) => {
    allowLeave.current = true;
    if (saved) toast('체크인을 저장했어요');
    safeBack(router);
    requestAnimationFrame(() => goToTabRoot('trips'));
  };

  const saveCheckin = async () => {
    const tripId = activeTripId;
    if (!tripId) {
      await fail('진행 중인 외근이 없어요', '외근을 시작한 뒤에 체크인해 주세요.');
      return;
    }
    let target: Field | null = mode === 'new' ? createdFieldRef.current : (field ?? null);
    let initialStatus = initialStatusRef.current;
    if (mode === 'new' && !target) {
      if (!draft) return;
      if (await isKnownOffline()) {
        await fail('인터넷에 연결되어 있지 않아요', '새 현장은 연결된 뒤에 저장할 수 있어요.');
        return;
      }
      await waitForCategoryCascade();
      const r = await createFieldFromPlace(
        {
          name: draft.name,
          roadAddress: draft.road,
          jibunAddress: draft.jibun,
          sido: draft.sido,
          sigungu: draft.sigungu,
          lat: draft.lat,
          lng: draft.lng,
          status: status ?? 'pending',
          projectId: draft.projectId,
          categories: reconcileCategories(draft.categories, draft.categoriesAt),
          detailAddress: draft.detail,
        },
        reverse,
      );
      if (!r.ok) {
        await fail('새 현장을 저장하지 못했어요', r.error);
        return;
      }
      target = r.field;
      createdFieldRef.current = r.field;
    }
    // 새 현장은 고른 조치 상태로 만들었다 — 다시 보내지 않는다.
    if (mode === 'new') initialStatus = status;
    if (!target) return;
    const label = fieldTitle(target);
    const record = { status, initialStatus, memo, photos };

    // 서버에 닿지 못하면 기기에 남기고 7 로(7-2). 함께 고른 사진·메모·조치 상태도 싣는다.
    const queue = () => {
      useCheckinQueueStore.getState().enqueue({ tripId, fieldId: target.id, label, record });
      finishCheckin(false);
    };
    if (await isKnownOffline()) {
      queue();
      return;
    }
    const r = await useVisitStore.getState().checkIn(tripId, target.id);
    if (!r.ok) {
      if (r.network) {
        queue();
        return;
      }
      await fail('체크인하지 못했어요', r.error);
      return;
    }
    const ds = useDestinationStore.getState();
    const dest = ds.findByTripField(tripId, target.id);
    if (dest && dest.status === 'pending') ds.markArrived(dest.id);
    const res = await saveVisitRecord({
      visitId: r.visit.id,
      fieldId: target.id,
      status,
      initialStatus,
      photos,
      memo,
      initialMemo: null,
    });
    // 방문은 이미 만들어졌다 — 일부만 실패했으면 알리고 진행한다. 외근 상세의 기록 수정에서 다시 넣을 수 있다.
    if (res.errors.length > 0) {
      await notice('일부 기록을 저장하지 못했어요', `${res.errors.join('\n')}\n\n외근 상세의 기록 수정에서 다시 넣어 주세요.`);
    }
    finishCheckin(true);
  };

  const saveEdit = async () => {
    if (!visit) return;
    const res = await saveVisitRecord({
      visitId: visit.id,
      fieldId: visit.fieldId,
      status,
      initialStatus: initialStatusRef.current,
      photos,
      memo,
      initialMemo,
    });
    if (res.errors.length > 0) {
      // 올린 사진은 다시 올리지 않게 목록을 바꿔 두고 화면에 남는다.
      setPhotos(res.photos);
      await fail('저장하지 못한 항목이 있어요', res.errors.join('\n'));
      return;
    }
    allowLeave.current = true;
    toast('방문 기록을 수정했어요');
    close();
  };

  const save = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    if (isEdit) await saveEdit();
    else await saveCheckin();
  };

  // === 현장 정보(이름·프로젝트) — 저장된 현장은 바로 서버에 저장한다(5 현장 상세와 같음) ===
  const saveName = async (next: string) => {
    if (!field) return;
    const r = await useFieldStore.getState().update(field.id, { name: next });
    if (!r.ok) {
      await notice('현장명을 바꾸지 못했어요', r.error);
      throw new Error(r.error);
    }
  };
  const patchDraft = useCallback((p: Partial<FieldDraft>) => useFieldDraftStore.getState().patch(draftKey, p), [draftKey]);

  const chooseNearby = (id: string) => {
    setNearbyOpen(false);
    if (id === linkedId) return;
    statusTouched.current = false;
    setLinkedId(id);
  };
  const toNewField = () => {
    setNearbyOpen(false);
    if (pos) startNewField(pos);
  };

  const linked = mode === 'nearby' ? nearby.find((n) => n.field.id === linkedId) : undefined;
  const ready = mode === 'new' ? !!draft : mode === 'edit' ? !!visit && !!field && filled.current : !!field;
  const missing = !ready && mode !== 'resolving' && mode !== 'new' && detailTried && !field;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Touchable onPress={close} accessibilityRole="button" accessibilityLabel="닫기" style={styles.close}>
          <Icon name="close" size={22} color={c2.text.primary} />
        </Touchable>
        <CheckinPill label={pillLabel} kind={isEdit ? 'edit' : 'checkin'} style={styles.pill} />
      </View>
      {!ready ? (
        <View style={styles.center}>
          <Text v2="bodyS.regular" tone="tertiary">
            {missing ? '현장을 찾을 수 없어요' : mode === 'resolving' ? '지금 위치를 확인하고 있어요' : '불러오고 있어요'}
          </Text>
        </View>
      ) : (
        <KeyboardAvoid style={styles.flex}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {linked ? (
              <View style={styles.linkRow}>
                <Text v2="bodyS.regular" tone="info" style={styles.flex}>
                  {`${formatDistanceM(linked.distanceM)} 거리의 ${fieldTitle(linked.field)}에 연결했어요`}
                </Text>
                <Touchable onPress={() => setNearbyOpen(true)} accessibilityRole="button" style={styles.linkAction}>
                  <Text v2="bodyM.bold" tone="link">
                    다른 현장
                  </Text>
                </Touchable>
              </View>
            ) : null}

            {mode === 'new' && draft ? (
              <NewFieldBlock
                draft={draft}
                weakAccuracy={weakGps && pos?.accuracy != null ? pos.accuracy : null}
                onPatch={patchDraft}
                onProject={() => setProjectOpen(true)}
                onCategory={() => setCategoryOpen(true)}
                onCorrect={() => router.push({ pathname: '/field-edit', params: { draft: draftKey } } as never)}
              />
            ) : field ? (
              <>
                <View style={styles.metaRow}>
                  <Touchable
                    onPress={() => setProjectOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel={`프로젝트: ${field.projectName ?? '없음'}, 바꾸기`}
                    style={styles.project}
                  >
                    <Icon name="folder" size={15} color={c2.text.secondary} />
                    <Text v2="caption.bold" numberOfLines={1} style={styles.projectName}>
                      {field.projectName ?? '프로젝트 없음'}
                    </Text>
                    <Icon name="chevron-down" size={14} color={c2.text.secondary} />
                  </Touchable>
                  <View style={styles.tags}>
                    {(field.categories ?? []).map((c) => (
                      <Tag key={c} label={c} />
                    ))}
                  </View>
                </View>
                <EditableTitle
                  value={field.name?.trim() === field.address ? '' : (field.name ?? '')}
                  onSubmit={saveName}
                  label="현장명"
                  appearance="pencil"
                  allowEmpty
                  placeholder={stripRegion(field.address) || field.address}
                  placeholderTone="primary"
                />
                <Text v2="bodyS.regular" tone="tertiary" style={styles.subtitle}>
                  {subtitle}
                </Text>
              </>
            ) : null}

            <MapPreviewCard
              height={120}
              markers={markers}
              myLocation={myDot}
              circle={accuracyCircle}
              onExpand={openMap}
              accessibilityLabel={mode === 'new' ? '새 현장 위치 크게 보기' : '체크인한 현장 위치 크게 보기'}
              style={styles.map}
            />

            <Text v2="bodyM.bold" style={styles.sectionTitle}>
              조치 상태
            </Text>
            <StatusOptionGroup
              value={status}
              onChange={(s) => {
                statusTouched.current = true;
                setStatus(s);
              }}
            />

            <View style={styles.section}>
              <CheckinPhotos photos={photos} onChange={setPhotos} disabled={saving} />
            </View>

            <Text v2="bodyM.bold" style={styles.sectionTitle}>
              메모
            </Text>
            <MemoField value={memo} onChangeText={setMemo} maxLength={2000} multiline editable={!saving} accessibilityLabel="메모" />
          </ScrollView>
          <BottomActionBar style={styles.footer}>
            <Button2 onPress={() => void save()} loading={saving} disabled={!ready} fullWidth>
              {saveLabel}
            </Button2>
          </BottomActionBar>
        </KeyboardAvoid>
      )}
      {placeBridge}
      {field ? (
        <ProjectSheet open={projectOpen} onClose={() => setProjectOpen(false)} field={field} placeName={fieldTitle(field)} />
      ) : draft ? (
        <ProjectSheet
          open={projectOpen}
          onClose={() => setProjectOpen(false)}
          select={{ value: draft.projectId, onSelect: (projectId, projectName) => patchDraft({ projectId, projectName }) }}
          placeName={draft.name.trim() || draftPlace}
        />
      ) : null}
      {draft ? (
        <CategorySheet
          open={categoryOpen}
          placeName={draft.name.trim() || draftPlace}
          initial={draft.categories}
          since={draft.categoriesAt}
          onClose={(next) => {
            setCategoryOpen(false);
            patchDraft({ categories: next, categoriesAt: Date.now() });
          }}
        />
      ) : null}
      {mode === 'nearby' ? (
        <NearbyFieldSheet
          open={nearbyOpen}
          onClose={() => setNearbyOpen(false)}
          nearby={nearby}
          selectedId={linkedId}
          onSelect={chooseNearby}
          onNewField={toNewField}
        />
      ) : null}
    </View>
  );
}

/** 8-3 새 현장: 프로젝트·분류 · 현장명(권장) · 주소 [위치 보정] (+ 8-5 GPS 약함 줄). */
function NewFieldBlock({
  draft,
  weakAccuracy,
  onPatch,
  onProject,
  onCategory,
  onCorrect,
}: {
  draft: FieldDraft;
  weakAccuracy: number | null;
  onPatch: (p: Partial<FieldDraft>) => void;
  onProject: () => void;
  onCategory: () => void;
  onCorrect: () => void;
}) {
  const address = draft.jibun || draft.road ? `${draft.jibun || draft.road} 부근` : '주소를 확인하고 있어요';
  return (
    <>
      <View style={styles.metaRow}>
        <Touchable
          onPress={onProject}
          accessibilityRole="button"
          accessibilityLabel={draft.projectName ? `프로젝트: ${draft.projectName}, 바꾸기` : '프로젝트 선택'}
          style={[styles.project, !draft.projectName && styles.dashed]}
        >
          <Icon name="folder" size={15} color={c2.text.secondary} />
          <Text v2="caption.bold" tone={draft.projectName ? 'primary' : 'secondary'} numberOfLines={1} style={styles.projectName}>
            {draft.projectName ?? '프로젝트 선택'}
          </Text>
          <Icon name="chevron-down" size={14} color={c2.text.secondary} />
        </Touchable>
        <View style={styles.tags}>
          <Touchable onPress={onCategory} accessibilityRole="button" accessibilityLabel="분류 고르기" style={styles.categoryBtn}>
            <Icon name="plus" size={12} color={c2.text.secondary} />
            <Text v2="small.semibold" tone="secondary">
              분류
            </Text>
          </Touchable>
          {draft.categories.map((c) => (
            <Tag key={c} label={c} />
          ))}
        </View>
      </View>

      <View style={styles.labelRow}>
        <Text v2="caption.bold" tone="body">
          현장명
        </Text>
        <View style={styles.recommend}>
          <Text v2="micro.bold" tone="brand">
            권장
          </Text>
        </View>
      </View>
      <MemoField
        value={draft.name}
        onChangeText={(name) => onPatch({ name })}
        maxLength={100}
        placeholder="예: 하단역 3번 출구 보안등"
        accessibilityLabel="현장명"
      />
      <Text v2="caption.regular" tone="tertiary" style={styles.helper}>
        목록과 보고서에 이 이름으로 나와요. 비우면 주소로 저장돼요.
      </Text>

      <View style={styles.addressHead}>
        <Text v2="caption.bold" tone="body" style={styles.flex}>
          주소
        </Text>
        <Touchable onPress={onCorrect} accessibilityRole="button" style={styles.correct}>
          <Text v2="bodyS.bold" tone="link">
            위치 보정
          </Text>
        </Touchable>
      </View>
      <View style={styles.address}>
        <Text v2="bodyM.semibold" numberOfLines={2}>
          {address}
        </Text>
        {weakAccuracy != null ? (
          <View style={styles.weak}>
            <Icon name="warning" size={15} color={c2.text.warning} />
            <Text v2="caption.semibold" tone="warning">
              {`GPS 신호 약함 · 오차 ±${Math.round(weakAccuracy)}m`}
            </Text>
          </View>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c2.bg.canvas },
  flex: { flex: 1 },
  // Figma 8: 상태 표시줄 아래 4 띄운 44 줄(X·알약 가운데 맞춤), 본문은 그 아래부터.
  header: { height: 44, marginTop: space[4], flexDirection: 'row', alignItems: 'center', gap: space[8], paddingLeft: space[8], paddingRight: space[16] },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  // CheckinPill 은 alignSelf: flex-start — 머리 줄 안에서는 X 와 가운데를 맞춘다.
  pill: { flexShrink: 1, alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: space[20], paddingTop: space[12], paddingBottom: space[24] },
  linkRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[8],
    paddingLeft: space[16],
    paddingRight: space[12],
    paddingVertical: space[8],
    borderRadius: radius2.lg,
    backgroundColor: c2.bg.brandSubtle,
    marginBottom: space[2],
  },
  linkAction: { height: 44, justifyContent: 'center', paddingLeft: space[12], paddingRight: space[4] },
  metaRow: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: space[6], marginBottom: space[2] },
  project: {
    height: 30,
    maxWidth: 180,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[4],
    paddingLeft: space[10],
    paddingRight: space[8],
    // 높이 30 의 반(알약). Figma 694:4136.
    borderRadius: 15,
    borderWidth: 1,
    borderColor: c2.border.default,
  },
  dashed: { borderStyle: 'dashed', borderColor: c2.border.strong },
  projectName: { flexShrink: 1, marginLeft: space[2] },
  tags: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[6] },
  categoryBtn: {
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[4],
    paddingLeft: space[8],
    paddingRight: space[10],
    borderRadius: radius2.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: c2.border.strong,
  },
  subtitle: { marginTop: space[2] },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: space[6], marginTop: space[12], marginBottom: space[8] },
  recommend: { height: 18, paddingHorizontal: space[6], borderRadius: 9, backgroundColor: c2.bg.brandSubtle, justifyContent: 'center' },
  helper: { marginTop: space[6] },
  addressHead: { flexDirection: 'row', alignItems: 'center', marginTop: space[6] },
  correct: { height: 44, justifyContent: 'center', paddingLeft: space[8] },
  address: {
    minHeight: 44,
    justifyContent: 'center',
    gap: space[2],
    paddingHorizontal: space[14],
    paddingVertical: space[10],
    borderRadius: radius2.lg,
    backgroundColor: c2.bg.subtle,
  },
  weak: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  map: { marginTop: SECTION_GAP },
  sectionTitle: { marginTop: SECTION_GAP, marginBottom: space[10] },
  section: { marginTop: SECTION_GAP },
  footer: { paddingTop: space[12], borderTopColor: c2.border.default },
});
