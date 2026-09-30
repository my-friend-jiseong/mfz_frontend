import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { FieldLabel } from '@/components/ui/FieldLabel';
import { NavHeader, OverflowButton } from '@/components/ui/NavHeader';
import { showActionSheet, type ActionSheetOption } from '@/components/ui/ActionSheet';
import { confirm } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { EmptyState } from '@/components/EmptyState';
import { SafeScreen } from '@/components/SafeScreen';
import { useReportStore } from '@/stores/reportStore';
import { useFieldStore } from '@/stores/fieldStore';
import { useVisitStore } from '@/stores/visitStore';
import { useTripStore } from '@/stores/tripStore';
import { toAbsoluteFileUrl } from '@/api';
import { pickPhoto, remotePhotoToUploadFile, type UploadFile } from '@/utils/media';
import { safeBack } from '@/utils/backNavigation';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';
import { opacity } from '@/theme/motion';

// 현장 보고 편집기 — 세 모드가 한 화면을 쓴다 (명세 v2 §6).
//   마법사  (?frId&wizard=1) 현장 보고 작성 (n/N) — 저장 후 다음 현장 / 저장 후 완료
//   수정    (?frId)          보고서 수정 — 현장을 바꿔 가며 사진·설명 편집, 저장·취소
//   추가    (frId 없음)       현장 보고 추가 — 현장을 골라 빈 양식으로, 추가하고 돌아가기
// 단계(조치 전·중·후)는 탭으로 하나씩 본다. 사진은 슬롯 엔드포인트가 즉시 올리고, 저장은
// 제목·설명과 '사진 제거'(null)만 보낸다.

type Phase = 'before' | 'pending' | 'after';
const PHASES: { key: Phase; label: string }[] = [
  { key: 'before', label: '조치 전' },
  { key: 'pending', label: '조치 중' },
  { key: 'after', label: '조치 후' },
];
const PHASE_URL_KEY: Record<Phase, 'beforePhotoUrl' | 'pendingPhotoUrl' | 'afterPhotoUrl'> = {
  before: 'beforePhotoUrl',
  pending: 'pendingPhotoUrl',
  after: 'afterPhotoUrl',
};
const PHASE_CAPTION_KEY: Record<Phase, 'beforePhotoCaption' | 'pendingPhotoCaption' | 'afterPhotoCaption'> = {
  before: 'beforePhotoCaption',
  pending: 'pendingPhotoCaption',
  after: 'afterPhotoCaption',
};

export default function FieldReportEditorScreen() {
  const { id, frId } = useLocalSearchParams<{ id: string; frId?: string }>();
  // 마법사 단계·수정 현장 전환은 같은 라우트에서 frId 만 바뀜 — key 로 강제 remount 해
  // 슬롯·제목·prefill ref 가 이전 현장 것으로 남는 회로 차단.
  return <FieldReportEditor key={`${id ?? ''}:${frId ?? 'new'}`} />;
}

function FieldReportEditor() {
  const { id, frId, wizard, fieldId: fieldIdParam } = useLocalSearchParams<{
    id: string;
    frId?: string;
    wizard?: string;
    fieldId?: string;
  }>();
  const reportId = id ?? '';
  const router = useRouter();

  const report = useReportStore((s) => s.detailCache[reportId]);
  const detailStatus = useReportStore((s) => s.detailStatus[reportId]);
  const loadDetail = useReportStore((s) => s.loadDetail);
  const addFieldReport = useReportStore((s) => s.addFieldReport);
  const updateFieldReport = useReportStore((s) => s.updateFieldReport);
  const removeFieldReport = useReportStore((s) => s.removeFieldReport);
  const uploadPhoto = useReportStore((s) => s.uploadFieldReportPhoto);
  const getField = useFieldStore((s) => s.getById);
  const loadFieldDetail = useFieldStore((s) => s.loadDetail);
  const allVisits = useVisitStore((s) => s.visits);
  const photosByVisit = useVisitStore((s) => s.photosByVisit);
  const loadVisitPhotos = useVisitStore((s) => s.loadPhotos);
  const activeTripId = useTripStore((s) => s.activeTripId);

  // 새로고침으로 바로 들어오면 캐시가 비어 있다.
  useEffect(() => {
    if (reportId && !useReportStore.getState().detailCache[reportId]?.fieldReports) void loadDetail(reportId);
  }, [reportId, loadDetail]);

  const fieldReports = useMemo(() => report?.fieldReports ?? [], [report?.fieldReports]);
  const existing = useMemo(() => fieldReports.find((fr) => fr.id === frId), [fieldReports, frId]);

  const mode: 'wizard' | 'edit' | 'add' = !frId ? 'add' : wizard === '1' ? 'wizard' : 'edit';
  const step = useMemo(() => {
    const idx = fieldReports.findIndex((fr) => fr.id === frId);
    if (idx < 0) return null;
    return { n: idx + 1, total: fieldReports.length, nextFrId: fieldReports[idx + 1]?.id ?? null };
  }, [fieldReports, frId]);

  const [fieldId, setFieldId] = useState<string | null>(fieldIdParam ?? null);
  const [title, setTitle] = useState('');
  const [phase, setPhase] = useState<Phase>('before');
  const [slots, setSlots] = useState<Record<Phase, { url: string | null; caption: string }>>({
    before: { url: null, caption: '' },
    pending: { url: null, caption: '' },
    after: { url: null, caption: '' },
  });
  // 사용자가 '사진 제거' 한 단계 — 저장 때 null 로 보낸다.
  const [cleared, setCleared] = useState<ReadonlySet<Phase>>(new Set());
  const [uploading, setUploading] = useState<Phase | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  // 추가 모드에서 첫 사진 업로드 직전 lazy-create 한 현장 보고 id. promise ref 는 동시 픽 락.
  const createdFrIdRef = useRef<string | null>(null);
  const ensureFrPromiseRef = useRef<Promise<string | null> | null>(null);
  const prefilled = useRef(false);

  // 수정·마법사 prefill — 1회.
  useEffect(() => {
    if (!frId || prefilled.current || !existing) return;
    prefilled.current = true;
    setFieldId(existing.fieldId);
    setTitle(existing.title ?? '');
    setSlots({
      before: { url: existing.beforePhotoUrl ?? null, caption: existing.beforePhotoCaption ?? '' },
      pending: { url: existing.pendingPhotoUrl ?? null, caption: existing.pendingPhotoCaption ?? '' },
      after: { url: existing.afterPhotoUrl ?? null, caption: existing.afterPhotoCaption ?? '' },
    });
  }, [frId, existing]);

  // '현장 사진에서 불러오기' 재료 — 현장 직접 사진 + 이 보고서 외근에서 이 현장을 방문한 사진.
  const fieldAttachments = useFieldStore((s) => (fieldId ? s.directAttachments[fieldId] : undefined));
  useEffect(() => {
    if (fieldId && !useFieldStore.getState().directAttachments[fieldId]) void loadFieldDetail(fieldId);
  }, [fieldId, loadFieldDetail]);
  const tripVisitsOfField = useMemo(
    () => allVisits.filter((v) => v.tripId === report?.tripId && v.fieldId === fieldId),
    [allVisits, report?.tripId, fieldId],
  );
  useEffect(() => {
    for (const v of tripVisitsOfField) {
      if (!useVisitStore.getState().photosByVisit[v.id]) void loadVisitPhotos(v.tripId, v.id);
    }
  }, [tripVisitsOfField, loadVisitPhotos]);
  const galleryPhotos = useMemo(() => {
    const out: { id: string; fileUrl: string }[] = [];
    for (const v of tripVisitsOfField) {
      for (const ph of photosByVisit[v.id] ?? []) out.push({ id: ph.attachmentId, fileUrl: ph.fileUrl });
    }
    for (const a of fieldAttachments ?? []) {
      if (a.type === 'photo' && a.fileUrl) out.push({ id: a.id, fileUrl: a.fileUrl });
    }
    return out;
  }, [tripVisitsOfField, photosByVisit, fieldAttachments]);

  const selectedField = fieldId ? getField(fieldId) : undefined;

  // ----- 사진 -----
  const ensureFieldReport = async (): Promise<string | null> => {
    if (frId) return frId;
    if (createdFrIdRef.current) return createdFrIdRef.current;
    if (!fieldId) return null;
    if (!ensureFrPromiseRef.current) {
      ensureFrPromiseRef.current = (async () => {
        const created = await addFieldReport(reportId, { fieldId, title: title.trim() || undefined });
        if (!created.ok) {
          Alert.alert('사진 업로드 실패', created.error);
          ensureFrPromiseRef.current = null;
          return null;
        }
        createdFrIdRef.current = created.fieldReportId;
        return created.fieldReportId;
      })();
    }
    return ensureFrPromiseRef.current;
  };

  const uploadToPhase = async (p: Phase, file: UploadFile) => {
    setUploading(p);
    try {
      const target = await ensureFieldReport();
      if (!target) return;
      const r = await uploadPhoto(reportId, target, { slot: p, file });
      if (!r.ok) {
        Alert.alert('사진 업로드 실패', r.error);
        return;
      }
      // 서버가 압축·저장한 실제 URL 을 권위 있는 detailCache 에서 읽어 슬롯 반영.
      const fr = useReportStore.getState().detailCache[reportId]?.fieldReports?.find((x) => x.id === target);
      const url = fr ? fr[PHASE_URL_KEY[p]] : null;
      setSlots((prev) => ({ ...prev, [p]: { ...prev[p], url: url ?? prev[p].url } }));
      setCleared((prev) => {
        const next = new Set(prev);
        next.delete(p);
        return next;
      });
    } catch {
      Alert.alert('사진 업로드 실패', '잠시 후 다시 시도해주세요.');
    } finally {
      setUploading(null);
    }
  };

  const pickFrom = async (source: 'camera' | 'library') => {
    const file = await pickPhoto(source);
    if (file) await uploadToPhase(phase, file);
  };

  const pickFromGallery = async (fileUrl: string) => {
    setGalleryOpen(false);
    const abs = toAbsoluteFileUrl(fileUrl);
    if (!abs) return;
    setUploading(phase);
    const file = await remotePhotoToUploadFile(abs);
    if (!file) {
      setUploading(null);
      Alert.alert('사진 불러오기 실패', '현장 사진을 가져오지 못했습니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    await uploadToPhase(phase, file);
  };

  // 사진 시트 (명세 §2.3 '사진') — 촬영 / 앨범에서 선택 / 현장 사진에서 불러오기 / 사진 제거.
  const openPhotoSheet = () => {
    if (!fieldId) {
      Alert.alert('현장 먼저 선택', '사진을 올릴 현장을 먼저 선택해주세요.');
      return;
    }
    const options: ActionSheetOption[] = [
      { label: '촬영', icon: 'camera', onPress: () => void pickFrom('camera') },
      { label: '앨범에서 선택', icon: 'images-outline', onPress: () => void pickFrom('library') },
    ];
    if (galleryPhotos.length > 0) {
      options.push({ label: '현장 사진에서 불러오기', icon: 'folder-open-outline', onPress: () => setGalleryOpen(true) });
    }
    if (slots[phase].url) {
      options.push({
        label: '사진 제거',
        icon: 'trash-outline',
        tone: 'danger',
        onPress: () => {
          setSlots((prev) => ({ ...prev, [phase]: { ...prev[phase], url: null } }));
          setCleared((prev) => new Set(prev).add(phase));
        },
      });
    }
    showActionSheet(options);
  };

  // ----- 저장 -----
  const bodyOf = () => {
    const body: Record<string, string | null | undefined> = {
      fieldId: fieldId ?? undefined,
      title: title.trim() || null,
    };
    for (const p of PHASES) {
      body[PHASE_CAPTION_KEY[p.key]] = slots[p.key].caption.trim() || null;
      if (cleared.has(p.key)) body[PHASE_URL_KEY[p.key]] = null;
    }
    return body as unknown as { fieldId: string } & Record<string, string | null>;
  };

  // 저장만 한다(이동 없음). 성공 여부 반환. 추가 모드에서 사진 없이 저장하면 여기서 만든다.
  const persist = async (): Promise<boolean> => {
    setError(null);
    if (!fieldId) {
      setError('현장을 선택해주세요');
      return false;
    }
    setSubmitting(true);
    const target = frId ?? createdFrIdRef.current;
    const r = target
      ? await updateFieldReport(reportId, target, bodyOf())
      : await addFieldReport(reportId, bodyOf());
    setSubmitting(false);
    if (!r.ok) {
      setError(r.error);
      return false;
    }
    return true;
  };

  const goDetail = () => router.replace(`/(tabs)/reports/${reportId}` as never);
  const goStep = (nextFrId: string | null) => {
    if (nextFrId) router.replace(`/(tabs)/reports/${reportId}/field-report?frId=${nextFrId}&wizard=1` as never);
    else goDetail();
  };

  const handlePrimary = async () => {
    if (uploading) return;
    if (!(await persist())) return;
    if (mode === 'wizard') {
      if (!step?.nextFrId) toast('보고서를 저장했어요');
      goStep(step?.nextFrId ?? null);
    } else if (mode === 'add') {
      toast('현장 보고를 추가했어요');
      safeBack(router, `/(tabs)/reports/${reportId}`);
    } else {
      toast('보고서를 저장했어요');
      safeBack(router, `/(tabs)/reports/${reportId}`);
    }
  };

  // FE-RPT-12 — 나중에 다시 작성: 지금까지 입력한 것(이 현장 포함)을 저장하고 진행 중 외근으로.
  // 진행 중 외근이 없으면 보고서 상세로. 실패하면 토스트 대신 오류 안내. `←` 도 같은 동작.
  const handleLater = async () => {
    if (uploading || submitting) return;
    if (!(await persist())) {
      Alert.alert('저장하지 못했습니다', '잠시 후 다시 시도해주세요.');
      return;
    }
    toast('작성 중인 내용을 저장했어요');
    if (activeTripId) router.replace('/(tabs)/trips/active' as never);
    else goDetail();
  };

  // FE-RPT-11 — 이 현장은 나중에 채우기: 저장하지 않고 다음 단계로. 현장은 미작성으로 남는다.
  const handleFillLater = () => goStep(step?.nextFrId ?? null);

  const handleDeleteFr = async () => {
    if (!frId) return;
    const ok = await confirm({
      title: '이 현장 보고를 삭제할까요?',
      message: '보고서에서 이 현장이 빠집니다.',
      confirmLabel: '삭제',
      destructive: true,
    });
    if (!ok) return;
    // 지우기 전에 다음 단계를 잡아 둔다 — 지우면 목록에서 이 단계가 빠진다.
    const next = mode === 'wizard' ? step?.nextFrId ?? null : null;
    const r = await removeFieldReport(reportId, frId);
    if (!r.ok) {
      Alert.alert('현장 보고 삭제 실패', r.error);
      return;
    }
    toast('현장 보고를 삭제했어요');
    // 마법사는 남은 현장으로 이어 간다(삭제가 곧 마법사 종료가 되지 않게).
    goStep(next);
  };

  // 저장하지 않은 제목·설명·사진 제거가 있는가. 사진 교체는 슬롯 업로드로 이미 서버에 반영돼 있다.
  const dirty =
    !!existing &&
    ((existing.title ?? '') !== title ||
      cleared.size > 0 ||
      PHASES.some((p) => (existing[PHASE_CAPTION_KEY[p.key]] ?? '') !== slots[p.key].caption));

  // 떠나기 전 확인 — 입력이 사라진다는 것을 알리고 고르게 한다(리뷰: 말없이 버려졌다).
  const confirmLeave = async () =>
    !dirty ||
    (await confirm({
      title: '저장하지 않은 내용이 있습니다',
      message: '설명·제목 변경이 사라집니다. 사진 교체는 이미 반영됐습니다.',
      confirmLabel: '버리고 이동',
      destructive: true,
    }));

  const leaveEdit = async () => {
    if (await confirmLeave()) safeBack(router, `/(tabs)/reports/${reportId}`);
  };

  // 보고서 수정 — 보고서의 현장 목록에서 고르면 그 현장으로 전환(FE-RPT-08).
  const openFieldSwitch = () =>
    showActionSheet(
      fieldReports.map((fr) => ({
        label: getField(fr.fieldId)?.address ?? '알 수 없는 현장',
        selected: fr.id === frId,
        onPress: async () => {
          if (fr.id === frId || !(await confirmLeave())) return;
          router.replace(`/(tabs)/reports/${reportId}/field-report?frId=${fr.id}` as never);
        },
      })),
      '현장 선택',
    );

  // 현장 보고 추가 — 이 보고서에 아직 없는 현장, 외근에서 방문한 현장 우선.
  const openFieldPick = () => {
    const inReport = new Set(fieldReports.map((fr) => fr.fieldId));
    const visited = Array.from(
      new Set(allVisits.filter((v) => v.tripId === report?.tripId).map((v) => v.fieldId)),
    ).filter((fid) => fid && !inReport.has(fid));
    const candidates = visited.length > 0
      ? visited
      : useFieldStore.getState().fields.map((f) => f.id).filter((fid) => !inReport.has(fid)).slice(0, 50);
    if (candidates.length === 0) {
      Alert.alert('추가할 현장이 없습니다', '이 보고서에 모든 현장이 이미 들어 있습니다.');
      return;
    }
    showActionSheet(
      candidates.map((fid) => ({
        label: getField(fid)?.address ?? '알 수 없는 현장',
        selected: fid === fieldId,
        onPress: () => setFieldId(fid),
      })),
      visited.length > 0 ? '이 외근에서 방문한 현장' : '현장 선택',
    );
  };

  if (frId && !existing) {
    return (
      <SafeScreen>
        <NavHeader title="현장 보고" onBack={goDetail} />
        {report?.fieldReports ? (
          <EmptyState
            icon="document-text-outline"
            title="현장 보고를 찾을 수 없습니다"
            description="보고서 상세에서 다시 진입해주세요"
          />
        ) : detailStatus === 'loading' ? (
          <EmptyState icon="hourglass-outline" title="불러오는 중…" />
        ) : (
          // 로드 실패(오프라인 등) — 무한 대기 대신 다시 시도를 준다.
          <EmptyState
            icon="cloud-offline-outline"
            title="보고서를 불러오지 못했습니다"
            action={
              <Button onPress={() => void loadDetail(reportId)} variant="secondary" leftIcon="refresh">
                다시 시도
              </Button>
            }
          />
        )}
      </SafeScreen>
    );
  }

  const heading =
    mode === 'wizard' && step
      ? `현장 보고 작성 (${step.n}/${step.total})`
      : mode === 'edit'
        ? '보고서 수정'
        : '현장 보고 추가';
  const hint =
    mode === 'wizard'
      ? step?.nextFrId
        ? '방문한 현장마다 전·중·후 사진을 채워주세요. 비워 두어도 나중에 채울 수 있어요'
        : '마지막 현장입니다. 저장하면 보고서 상세로 돌아갑니다'
      : mode === 'edit'
        ? '현장별 사진과 내용을 수정할 수 있어요'
        : '보고서에 없는 현장을 골라 현장 보고를 추가합니다. 전·중·후는 비워 두어도 됩니다.';
  const primaryLabel =
    mode === 'wizard' ? (step?.nextFrId ? '저장 후 다음 현장' : '저장 후 완료') : mode === 'edit' ? '저장' : '추가하고 돌아가기';

  const slot = slots[phase];
  const phaseLabel = PHASES.find((p) => p.key === phase)!.label;
  const img = toAbsoluteFileUrl(slot.url);

  const headerRight =
    mode === 'wizard' ? (
      <>
        <Pressable
          onPress={() => void handleLater()}
          accessibilityRole="button"
          style={({ pressed }) => [styles.laterBtn, pressed && { opacity: opacity.pressed }]}
          hitSlop={6}
        >
          <Text variant="caption" weight="semibold" color="textMuted" style={styles.laterText}>
            나중에 다시 작성
          </Text>
        </Pressable>
        <OverflowButton
          label="현장 보고 작성 더보기"
          onPress={() =>
            showActionSheet([
              { label: '이 현장은 나중에 채우기', icon: 'play-skip-forward', onPress: handleFillLater },
              { label: '이 현장 보고 삭제', icon: 'trash-outline', tone: 'danger', onPress: () => void handleDeleteFr() },
            ])
          }
        />
      </>
    ) : undefined;

  return (
    <SafeScreen>
      <NavHeader
        title=""
        onBack={() => void (mode === 'wizard' ? handleLater() : leaveEdit())}
        right={headerRight}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text variant="h2" weight="heavy">
            {heading}
          </Text>
          <Text variant="bodySm" color="textMuted" style={styles.hint}>
            {hint}
          </Text>

          <FieldLabel style={styles.gap}>{mode === 'edit' ? '현장 (탭하여 변경)' : '현장 *'}</FieldLabel>
          {mode === 'wizard' ? (
            <Card padding="md" style={styles.readonly}>
              <Text variant="body">{selectedField?.address ?? '알 수 없는 현장'}</Text>
            </Card>
          ) : (
            <Pressable
              onPress={mode === 'edit' ? openFieldSwitch : openFieldPick}
              accessibilityRole="button"
              accessibilityLabel={selectedField ? `현장: ${selectedField.address}` : '현장 선택'}
              style={({ pressed }) => [styles.fieldPick, pressed && { opacity: opacity.pressed }]}
            >
              <Text
                variant="body"
                color={selectedField ? 'text' : 'textMuted'}
                style={styles.flex}
                numberOfLines={1}
              >
                {selectedField?.address ?? '현장을 선택하세요'}
              </Text>
              <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
            </Pressable>
          )}

          {mode !== 'edit' ? (
            <Input
              label="제목 (선택)"
              value={title}
              onChangeText={setTitle}
              maxLength={100}
              containerStyle={styles.gap}
            />
          ) : null}

          {/* 단계 탭 — 조치 전·중·후를 하나씩 본다. */}
          <View style={styles.tabs} accessibilityRole="tablist">
            {PHASES.map((p) => {
              const active = p.key === phase;
              return (
                <Pressable
                  key={p.key}
                  onPress={() => setPhase(p.key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  style={[styles.tab, active && styles.tabActive]}
                >
                  <Text variant="bodySm" weight={active ? 'semibold' : 'regular'} color={active ? 'text' : 'textMuted'}>
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Card padding="md" style={styles.phaseBox}>
            <Text variant="bodySm" weight="bold">
              {phaseLabel}
            </Text>
            <Pressable onPress={openPhotoSheet} disabled={uploading !== null} accessibilityLabel={`${phaseLabel} 사진`}>
              {img ? (
                <Image source={{ uri: img }} style={styles.photo} resizeMode="cover" />
              ) : (
                <View style={[styles.photo, styles.photoEmpty]}>
                  <Ionicons name="camera-outline" size={24} color={colors.textMuted} />
                  <Text variant="caption" color="textMuted">
                    {uploading === phase ? '업로드 중…' : '사진 없음'}
                  </Text>
                </View>
              )}
            </Pressable>
            <Button
              onPress={openPhotoSheet}
              disabled={uploading !== null}
              loading={uploading === phase}
              variant="secondary"
              leftIcon="camera"
              fullWidth
            >
              {slot.url ? '사진 변경' : '사진 추가'}
            </Button>
            <Input
              value={slot.caption}
              onChangeText={(v) => setSlots((prev) => ({ ...prev, [phase]: { ...prev[phase], caption: v } }))}
              placeholder={`${phaseLabel} 설명 (선택)`}
              maxLength={200}
              accessibilityLabel={`${phaseLabel} 설명`}
            />
          </Card>

          {error ? (
            <Text variant="bodySm" color="danger" style={styles.gap}>
              {error}
            </Text>
          ) : null}

          <Button
            onPress={() => void handlePrimary()}
            disabled={uploading !== null || (mode === 'add' && !fieldId)}
            loading={submitting}
            size="lg"
            fullWidth
            leftIcon="save"
            style={styles.submit}
          >
            {primaryLabel}
          </Button>
          {mode === 'edit' ? (
            <Button onPress={() => void leaveEdit()} variant="ghost" size="sm" fullWidth>
              취소
            </Button>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 현장 사진 갤러리 — 방문·현장 사진을 골라 지금 단계 슬롯에 넣는다. */}
      <Modal visible={galleryOpen} animationType="fade" transparent onRequestClose={() => setGalleryOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setGalleryOpen(false)}>
          <Pressable style={styles.galleryCard} onPress={() => undefined}>
            <Text variant="h3">현장 사진에서 선택</Text>
            <Text variant="bodySm" color="textMuted">
              {`'${phaseLabel}' 에 넣을 사진을 고르세요.`}
            </Text>
            <ScrollView contentContainerStyle={styles.grid}>
              {galleryPhotos.map((ph) => (
                <Pressable
                  key={ph.id}
                  onPress={() => void pickFromGallery(ph.fileUrl)}
                  accessibilityRole="imagebutton"
                  accessibilityLabel="현장 사진 선택"
                  style={({ pressed }) => [styles.gridItem, pressed && { opacity: opacity.pressed }]}
                >
                  <Image source={{ uri: toAbsoluteFileUrl(ph.fileUrl) ?? undefined }} style={styles.gridThumb} />
                </Pressable>
              ))}
            </ScrollView>
            <Button onPress={() => setGalleryOpen(false)} variant="ghost" size="sm" fullWidth>
              닫기
            </Button>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.xs, paddingBottom: spacing.xxl * 2 },
  hint: { marginTop: spacing.xs },
  gap: { marginTop: spacing.md },
  laterBtn: {
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'center',
  },
  laterText: { fontSize: fontSize.xs },
  readonly: { borderColor: colors.borderMuted },
  fieldPick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tabs: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs,
    marginTop: spacing.lg,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  tab: { flex: 1, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: colors.surface },
  phaseBox: { marginTop: spacing.sm, gap: spacing.sm },
  photo: {
    width: '100%',
    height: 160,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  photoEmpty: { alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  submit: { marginTop: spacing.xl },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  galleryCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  gridItem: {
    width: '31.5%',
    aspectRatio: 1,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  gridThumb: { width: '100%', height: '100%' },
});
