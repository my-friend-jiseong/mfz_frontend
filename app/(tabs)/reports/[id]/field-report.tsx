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
import { Text } from '@/components/ui/Text';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useReportStore } from '@/stores/reportStore';
import { useFieldStore } from '@/stores/fieldStore';
import { useVisitStore } from '@/stores/visitStore';
import { toAbsoluteFileUrl } from '@/api';
import {
  pickPhoto,
  promptPhotoSource,
  remotePhotoToUploadFile,
  type UploadFile,
} from '@/utils/media';
import { safeBack } from '@/utils/backNavigation';
import { EmptyState } from '@/components/EmptyState';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { opacity } from '@/theme/motion';
import { SafeScreen } from '@/components/SafeScreen';

// ERD v2: 보고서 본문 = 현장별 전·중·후 사진+캡션(field_reports). 추가/수정 화면.
// 마법사 모드(2026-06-04 결정): 보고서 생성 직후 ?wizard=1 로 진입해 스캐폴드된
// 현장 보고를 차례로 채움 — 저장하면 다음 현장으로, 마지막이면 상세로.

type Phase = 'before' | 'pending' | 'after';
const PHASES: { key: Phase; label: string }[] = [
  { key: 'before', label: '조치 전' },
  { key: 'pending', label: '조치 중' },
  { key: 'after', label: '조치 후' },
];
// slot(Phase) ↔ FieldReport URL 필드 단일 매핑 — 중첩 삼항(default fallthrough) 대신.
const PHASE_URL_KEY: Record<Phase, 'beforePhotoUrl' | 'pendingPhotoUrl' | 'afterPhotoUrl'> = {
  before: 'beforePhotoUrl',
  pending: 'pendingPhotoUrl',
  after: 'afterPhotoUrl',
};

// 상대 fileUrl 절대화 — 공용 toAbsoluteFileUrl 로 통일 (별칭 유지).
const resolveUrl = toAbsoluteFileUrl;

export default function FieldReportEditorScreen() {
  const { id, frId } = useLocalSearchParams<{ id: string; frId?: string }>();
  // 마법사 단계 전환은 같은 라우트에서 frId 만 바뀜 — key 로 강제 remount 해
  // 슬롯·제목·prefill ref 가 이전 현장 것으로 남는 회로 차단.
  return <FieldReportEditor key={`${id ?? ''}:${frId ?? 'new'}`} />;
}

function FieldReportEditor() {
  const { id, frId, wizard } = useLocalSearchParams<{
    id: string;
    frId?: string;
    wizard?: string;
  }>();
  const reportId = id ?? '';
  const isEdit = !!frId;
  const isWizard = wizard === '1';
  const router = useRouter();

  const detailCache = useReportStore((s) => s.detailCache);
  const addFieldReport = useReportStore((s) => s.addFieldReport);
  const updateFieldReport = useReportStore((s) => s.updateFieldReport);
  const uploadPhoto = useReportStore((s) => s.uploadFieldReportPhoto);
  const allFields = useFieldStore((s) => s.fields);
  const refreshFields = useFieldStore((s) => s.refresh);
  // 이 보고서가 연결된 trip 의 visits — 그 fields 가 picker 에서 우선 노출.
  const reportTripId = useReportStore(
    (s) => s.detailCache[reportId]?.tripId ?? null,
  );
  // selector 안에서 .filter() 호출하면 매 호출마다 새 array reference →
  // useSyncExternalStoreWithSelector 가 무한 re-render → React error #185. raw 구독 + useMemo.
  const allVisits = useVisitStore((s) => s.visits);
  const tripVisits = useMemo(
    () => (reportTripId ? allVisits.filter((v) => v.tripId === reportTripId) : []),
    [allVisits, reportTripId],
  );

  useEffect(() => {
    if (allFields.length === 0) void refreshFields();
  }, [allFields.length, refreshFields]);

  const existing = useMemo(
    () => detailCache[reportId]?.fieldReports?.find((fr) => fr.id === frId),
    [detailCache, reportId, frId],
  );

  // 마법사 단계 정보 — detailCache 의 fieldReports 순서가 단계 순서.
  // frId 가 목록에 없으면(캐시 미스 등) null → 일반 수정 화면으로 동작.
  const wizardSeq = useMemo(() => {
    if (!isWizard) return null;
    const frs = detailCache[reportId]?.fieldReports ?? [];
    const idx = frs.findIndex((fr) => fr.id === frId);
    if (idx < 0) return null;
    return {
      step: idx + 1,
      total: frs.length,
      nextFrId: idx + 1 < frs.length ? frs[idx + 1].id : null,
    };
  }, [isWizard, detailCache, reportId, frId]);

  // 마법사 이탈 → 상세 — 마지막 단계 완료와 '나중에 작성하기' 공용 단일 지점.
  // 종료 동작을 바꿀 때(완료 토스트 등) 여기 한 곳만 수정.
  const exitWizardToDetail = () =>
    router.replace(`/(tabs)/reports/${reportId}` as never);

  // 다음 단계로 (마지막이면 상세로) — '저장 후 다음'과 '건너뛰기' 공용.
  // push 가 아닌 replace — 마법사 단계들이 back 스택에 쌓여 뒤로가기가 이전 현장으로
  // 되돌아가는(이미 저장된 단계 재진입) 혼선 차단.
  const goWizardNext = () => {
    if (wizardSeq?.nextFrId) {
      router.replace(
        `/(tabs)/reports/${reportId}/field-report?frId=${wizardSeq.nextFrId}&wizard=1` as never,
      );
    } else {
      exitWizardToDetail();
    }
  };

  const [fieldId, setFieldId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [slots, setSlots] = useState<
    Record<Phase, { url: string | null; caption: string }>
  >({
    before: { url: null, caption: '' },
    pending: { url: null, caption: '' },
    after: { url: null, caption: '' },
  });
  const [uploading, setUploading] = useState<Phase | null>(null);
  // 신규("현장 보고 추가") 모드에서 첫 사진 업로드 직전 lazy-create 한 field report id.
  // 슬롯 업로드는 field report 가 먼저 존재해야 함 → frId 없으면 여기에 생성 id 보관.
  // ref 가 동기 진실(렌더 의존 없음). promise ref 는 동시 픽 시 중복 생성(=중복 field report) 락.
  const createdFrIdRef = useRef<string | null>(null);
  const ensureFrPromiseRef = useRef<Promise<string | null> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const prefilled = useRef(false);

  // picker 후보 — 이 trip 의 visit fields 우선, 나머지 그 다음. 검색 시 모두 한 줄로 흐르되 우선군은 위쪽.
  const pickerGroups = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    const tripFieldIds = new Set(tripVisits.map((v) => v.fieldId));
    const matches = (f: typeof allFields[number]) => {
      if (!q) return true;
      return (
        f.address.toLowerCase().includes(q) ||
        (f.addressDetail ?? '').toLowerCase().includes(q)
      );
    };
    const trip = allFields.filter((f) => tripFieldIds.has(f.id) && matches(f));
    const others = allFields.filter((f) => !tripFieldIds.has(f.id) && matches(f));
    return { trip, others };
  }, [allFields, tripVisits, pickerQuery]);

  // 수정 모드 prefill — 1회.
  useEffect(() => {
    if (!isEdit || prefilled.current || !existing) return;
    prefilled.current = true;
    setFieldId(existing.fieldId);
    setTitle(existing.title ?? '');
    setSlots({
      before: {
        url: existing.beforePhotoUrl ?? null,
        caption: existing.beforePhotoCaption ?? '',
      },
      pending: {
        url: existing.pendingPhotoUrl ?? null,
        caption: existing.pendingPhotoCaption ?? '',
      },
      after: {
        url: existing.afterPhotoUrl ?? null,
        caption: existing.afterPhotoCaption ?? '',
      },
    });
  }, [isEdit, existing]);

  // 새 보고 모드 + fieldId 선택됨 → 그 field 의 phase 사진을 슬롯에 자동 prefill.
  // 결정 §4 (2026-05-31): backend-backlog §9 응답에 phase 가 포함되면 자동 동작.
  // §9 머지 전엔 attachment.phase 가 모두 undefined → 슬롯은 빈 상태 유지 (회로 정상).
  // 마법사 모드도 대상 — 빈 스캐폴드를 채우는 흐름이라 의미상 '새 보고 작성'과 동일.
  // 슬롯이 이미 찬 경우 prev.url ?? 로 보존되므로 기존 사진을 덮어쓰지 않음.
  const fieldAttachments = useFieldStore(
    (s) => (fieldId ? s.directAttachments[fieldId] : undefined),
  );
  const loadFieldDetail = useFieldStore((s) => s.loadDetail);
  // 현장 첨부 로드 — §4 phase prefill 재료이자 '현장 사진에서 불러오기' 갤러리 재료.
  // 마법사뿐 아니라 신규·수정 모드 모두에서 fieldId 가 정해지면 로드(캐시 있으면 skip).
  useEffect(() => {
    if (!fieldId) return;
    if (useFieldStore.getState().directAttachments[fieldId]) return;
    void loadFieldDetail(fieldId);
  }, [fieldId, loadFieldDetail]);
  // 이 현장에 이미 등록된 사진(현장 직접 첨부) — 슬롯으로 수동 불러올 후보.
  // §9(phase 자동 prefill) 머지 전까지의 임시 대안: 사용자가 직접 골라 슬롯에 넣는다.
  const fieldPhotos = useMemo(
    () => (fieldAttachments ?? []).filter((a) => a.type === 'photo' && a.fileUrl),
    [fieldAttachments],
  );
  // '현장 사진에서 불러오기' 갤러리 — 어느 슬롯(phase)에 넣을지 보관. null 이면 닫힘.
  const [galleryPhase, setGalleryPhase] = useState<Phase | null>(null);
  // Set 으로 fieldId 별 1회 가드 (F8) — 단일 ref 였을 때 A→B→A 전환에서 A 의 prefill 이
  // 재실행되어 사용자가 clear 한 슬롯이 부활하던 회로 차단.
  const phasePrefilledFieldsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (isEdit && !isWizard) return;
    if (!fieldId || !fieldAttachments) return;
    if (phasePrefilledFieldsRef.current.has(fieldId)) return;
    const byPhase: { before?: string; pending?: string; after?: string } = {};
    for (const a of fieldAttachments) {
      if (a.type !== 'photo' || !a.fileUrl) continue;
      // attachment.phase: §9 머지 후 들어옴. before/after 그대로, 'during' → 'pending' 매핑.
      if (!a.phase) continue;
      const slotKey: Phase = a.phase === 'during' ? 'pending' : a.phase;
      if (!byPhase[slotKey]) byPhase[slotKey] = a.fileUrl;
    }
    if (Object.keys(byPhase).length === 0) return; // §9 미해소 — 회로 정상
    phasePrefilledFieldsRef.current.add(fieldId);
    setSlots((prev) => ({
      before: { ...prev.before, url: prev.before.url ?? byPhase.before ?? null },
      pending: { ...prev.pending, url: prev.pending.url ?? byPhase.pending ?? null },
      after: { ...prev.after, url: prev.after.url ?? byPhase.after ?? null },
    }));
  }, [isEdit, isWizard, fieldId, fieldAttachments]);

  const selectedField = useMemo(
    () => allFields.find((f) => f.id === fieldId),
    [allFields, fieldId],
  );

  // 본문 h2 와 Stack 헤더 타이틀 공용 — 마법사 단계가 헤더에도 보이게.
  const headingText = wizardSeq
    ? `현장 보고 작성 (${wizardSeq.step}/${wizardSeq.total})`
    : isEdit
      ? '현장 보고 수정'
      : '현장 보고 추가';

  // field report 보장 — frId(수정/마법사) 있으면 그대로, 없으면 1회만 lazy-create.
  // promise 락으로 동시 픽이 같은 약속을 await → 중복 field report 생성 차단.
  const ensureFieldReport = async (): Promise<string | null> => {
    if (frId) return frId;
    if (createdFrIdRef.current) return createdFrIdRef.current;
    if (!fieldId) return null;
    if (!ensureFrPromiseRef.current) {
      ensureFrPromiseRef.current = (async () => {
        const created = await addFieldReport(reportId, {
          fieldId,
          title: title.trim() || undefined,
        });
        if (!created.ok) {
          Alert.alert('사진 업로드 실패', created.error);
          ensureFrPromiseRef.current = null; // 실패 시 재시도 허용
          return null;
        }
        createdFrIdRef.current = created.fieldReportId;
        return created.fieldReportId;
      })();
    }
    return ensureFrPromiseRef.current;
  };

  // 주어진 파일을 한 슬롯(phase)에 업로드 — 카메라/갤러리 픽과 '현장 사진 불러오기' 공용 경로.
  const uploadToPhase = async (phase: Phase, file: UploadFile) => {
    setUploading(phase);
    try {
      // 슬롯 업로드는 field report 가 먼저 존재해야 함 — 신규 모드면 첫 사진에 lazy-create.
      // 동시 픽이 각자 create 해 중복 field report 가 생기지 않게 promise 락으로 직렬화.
      const targetFrId = await ensureFieldReport();
      if (!targetFrId) return; // 생성 실패(에러는 ensureFieldReport 가 alert)
      // 슬롯에 직접 multipart 업로드(서버 압축) → 응답 비의존, loadDetail 로 슬롯 URL 동기화.
      const r = await uploadPhoto(reportId, targetFrId, { slot: phase, file });
      if (!r.ok) {
        Alert.alert('사진 업로드 실패', r.error);
        return;
      }
      // 서버가 압축·저장한 실제 URL 을 권위 있는 detailCache 에서 읽어 슬롯 반영.
      const fr = useReportStore
        .getState()
        .detailCache[reportId]?.fieldReports?.find((x) => x.id === targetFrId);
      const url = fr ? fr[PHASE_URL_KEY[phase]] : null;
      setSlots((prev) => ({
        ...prev,
        [phase]: { ...prev[phase], url: url ?? prev[phase].url },
      }));
    } catch {
      Alert.alert('사진 업로드 실패', '잠시 후 다시 시도해주세요.');
    } finally {
      setUploading(null);
    }
  };

  const pickPhase = (phase: Phase) => {
    if (!fieldId) {
      Alert.alert('현장 먼저 선택', '사진을 올릴 현장을 먼저 선택해주세요.');
      return;
    }
    promptPhotoSource(async (src) => {
      const file = await pickPhoto(src);
      if (!file) return;
      await uploadToPhase(phase, file);
    });
  };

  // 현장에 이미 등록된 원격 사진을 슬롯으로 불러오기 — §9 phase 자동 prefill 의 임시 대안.
  // native: 원격 URL 을 캐시로 다운로드해 로컬 파일로 재업로드, web: URL 그대로 blob 변환.
  const pickFromField = async (phase: Phase, fileUrl: string) => {
    setGalleryPhase(null);
    const abs = resolveUrl(fileUrl);
    if (!abs) return;
    setUploading(phase);
    const file = await remotePhotoToUploadFile(abs);
    if (!file) {
      setUploading(null);
      Alert.alert('사진 불러오기 실패', '현장 사진을 가져오지 못했습니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    // uploadToPhase 가 자체적으로 setUploading 을 관리하므로 여기서 해제하지 않는다.
    await uploadToPhase(phase, file);
  };

  const setCaption = (phase: Phase, caption: string) =>
    setSlots((prev) => ({ ...prev, [phase]: { ...prev[phase], caption } }));

  const clearPhoto = (phase: Phase) =>
    setSlots((prev) => ({ ...prev, [phase]: { ...prev[phase], url: null } }));

  const handleSave = async () => {
    setError(null);
    if (!fieldId) {
      setError('현장을 선택해주세요');
      return;
    }
    // 사진 없는 캡션 차단 — 상세 카드가 '사진 없음 + 캡션' 으로 어색하게 남는 회로.
    const orphan = PHASES.find(
      (p) => !slots[p.key].url && slots[p.key].caption.trim(),
    );
    if (orphan) {
      setError(
        `'${orphan.label}' 단계에 사진 없이 캡션만 입력돼 있습니다. 사진을 추가하거나 캡션을 비워주세요.`,
      );
      return;
    }
    // 사진 URL 은 슬롯 엔드포인트가 서버에 직접 갱신·소유 → 저장 시 재전송하지 않는다
    // (슬롯 mirror 가 stale 하면 권위 URL 을 덮어쓸 위험). 저장은 title·캡션만 영속.
    const body = {
      fieldId,
      title: title.trim() || undefined,
      beforePhotoCaption: slots.before.caption.trim() || undefined,
      pendingPhotoCaption: slots.pending.caption.trim() || undefined,
      afterPhotoCaption: slots.after.caption.trim() || undefined,
    };
    setSubmitting(true);
    // frId(수정/마법사) 또는 신규모드에서 사진 업로드로 lazy-create 된 id 가 있으면 갱신,
    // 둘 다 없으면(사진 0장 신규) 생성.
    const effectiveFrId = frId ?? createdFrIdRef.current;
    const r = effectiveFrId
      ? await updateFieldReport(reportId, effectiveFrId, body)
      : await addFieldReport(reportId, body);
    setSubmitting(false);
    if (r.ok) {
      // 마법사: 다음 현장으로 이어가기, 일반: 진입했던 화면(상세)으로 복귀.
      if (wizardSeq) {
        // 마지막 단계 저장 완료에만 통지 — 건너뛰기/나중에 작성은 미완이라 제외.
        // web 은 webAlertPatch 가 window.alert 로 라우팅.
        if (!wizardSeq.nextFrId) {
          Alert.alert('보고서 작성 완료', '작성한 현장 보고가 모두 저장됐습니다.');
        }
        goWizardNext();
      } else {
        safeBack(router);
      }
    } else {
      setError(r.error);
    }
  };

  if (isEdit && !existing) {
    return (
      <SafeScreen>
        <EmptyState
          icon="document-text-outline"
          title="현장 보고를 찾을 수 없습니다"
          description="보고서 상세에서 다시 진입해주세요"
          action={
            <Button
              onPress={() =>
                router.replace(`/(tabs)/reports/${reportId}` as never)
              }
              variant="secondary"
              leftIcon="arrow-back"
            >
              보고서 상세로
            </Button>
          }
        />
      </SafeScreen>
    );
  }

  return (
    <SafeScreen>
      {/* Stack 헤더 타이틀을 마법사 단계와 동기화 — _layout 의 정적 '현장 보고' 를 덮음. */}
      <Stack.Screen options={{ title: headingText }} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text variant="h2" weight="heavy" style={styles.heading}>
            {headingText}
          </Text>
          {wizardSeq ? (
            <Text variant="bodySm" color="textMuted" style={styles.wizardHint}>
              방문한 현장마다 전·중·후 사진을 채워주세요. 지금 건너뛰어도 보고서
              상세에서 언제든 채울 수 있어요.
            </Text>
          ) : null}

          <Text variant="bodySm" weight="bold" color="textMuted" style={styles.label}>
            현장 *
          </Text>
          {isEdit ? (
            <Card padding="md" style={styles.readonly}>
              <Text variant="body">
                {selectedField?.address ?? '알 수 없는 현장'}
              </Text>
            </Card>
          ) : (
            <Pressable
              onPress={() => setFieldPickerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={
                selectedField ? `현장: ${selectedField.address}` : '현장 선택'
              }
              style={({ pressed }) => [
                styles.fieldPickBtn,
                pressed && { opacity: opacity.pressed },
              ]}
            >
              <Ionicons
                name={selectedField ? 'location' : 'add-circle-outline'}
                size={18}
                color={selectedField ? colors.primary : colors.textMuted}
              />
              <Text
                variant="body"
                weight={selectedField ? 'semibold' : 'bold'}
                color={selectedField ? 'text' : 'textMuted'}
                style={styles.fieldPickText}
              >
                {selectedField ? selectedField.address : '현장 선택'}
              </Text>
            </Pressable>
          )}

          <Input
            label="제목 (선택)"
            value={title}
            onChangeText={setTitle}
            placeholder="예: 1번 가로수 가지치기"
            maxLength={100}
            containerStyle={styles.titleField}
          />

          {PHASES.map((p) => {
            const slot = slots[p.key];
            const img = resolveUrl(slot.url);
            return (
              <Card key={p.key} padding="md" style={styles.phaseBox}>
                <Text variant="bodySm" weight="bold">
                  {p.label}
                </Text>
                {img ? (
                  <Image
                    source={{ uri: img }}
                    style={styles.phasePhoto}
                    resizeMode="cover"
                    accessibilityLabel={`${p.label} 사진`}
                  />
                ) : (
                  <View style={[styles.phasePhoto, styles.phasePhotoEmpty]}>
                    <Text variant="bodySm" color="textMuted">
                      {uploading === p.key ? '업로드 중...' : '사진 없음'}
                    </Text>
                  </View>
                )}
                <View style={styles.phaseActions}>
                  <Button
                    onPress={() => pickPhase(p.key)}
                    disabled={uploading !== null}
                    variant="secondary"
                    size="sm"
                    leftIcon="camera"
                    style={styles.phaseBtnFlex}
                  >
                    {slot.url ? '사진 변경' : '사진'}
                  </Button>
                  {slot.url ? (
                    <Button
                      onPress={() => clearPhoto(p.key)}
                      variant="ghost"
                      size="sm"
                      leftIcon="trash"
                    >
                      제거
                    </Button>
                  ) : null}
                </View>
                {/* 현장에 이미 등록된 사진이 있으면 슬롯으로 불러오기 — §9 임시 대안. */}
                {fieldPhotos.length > 0 ? (
                  <Button
                    onPress={() => setGalleryPhase(p.key)}
                    disabled={uploading !== null}
                    variant="ghost"
                    size="sm"
                    leftIcon="images"
                    fullWidth
                  >
                    현장 사진에서 불러오기
                  </Button>
                ) : null}
                <Input
                  value={slot.caption}
                  onChangeText={(v) => setCaption(p.key, v)}
                  placeholder={`${p.label} 캡션 (선택)`}
                  maxLength={200}
                  containerStyle={styles.captionField}
                />
              </Card>
            );
          })}

          {error ? (
            <Text variant="bodySm" color="danger" style={styles.error}>
              {error}
            </Text>
          ) : null}

          <Button
            onPress={handleSave}
            disabled={uploading !== null}
            loading={submitting}
            size="lg"
            fullWidth
            leftIcon="save"
            style={styles.submit}
          >
            {wizardSeq
              ? wizardSeq.nextFrId
                ? '저장 후 다음 현장'
                : '저장 후 완료'
              : '저장'}
          </Button>
          {wizardSeq ? (
            <>
              <Button
                onPress={goWizardNext}
                disabled={uploading !== null || submitting}
                variant="ghost"
                size="sm"
                fullWidth
              >
                {wizardSeq.nextFrId ? '이 현장 건너뛰기' : '건너뛰고 완료'}
              </Button>
              {wizardSeq.nextFrId ? (
                <Button
                  onPress={exitWizardToDetail}
                  disabled={submitting}
                  variant="ghost"
                  size="sm"
                  fullWidth
                >
                  나중에 작성하기
                </Button>
              ) : null}
            </>
          ) : (
            <Button onPress={() => safeBack(router)} variant="ghost" size="sm" fullWidth>
              취소
            </Button>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={fieldPickerOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setFieldPickerOpen(false)}
      >
        <Pressable
          style={styles.pickerBackdrop}
          onPress={() => setFieldPickerOpen(false)}
        >
          <Pressable style={styles.pickerCard} onPress={() => undefined}>
            <Text variant="h3">현장 선택</Text>
            <Input
              value={pickerQuery}
              onChangeText={setPickerQuery}
              placeholder="주소·상세주소 검색"
              autoCapitalize="none"
              clearButtonMode="while-editing"
              containerStyle={styles.pickerSearch}
            />
            <ScrollView
              style={styles.pickerList}
              contentContainerStyle={styles.pickerListContent}
            >
              {allFields.length === 0 ? (
                <Text variant="bodySm" color="textMuted" style={styles.pickerEmpty}>
                  등록된 현장이 없습니다.
                </Text>
              ) : pickerGroups.trip.length === 0 && pickerGroups.others.length === 0 ? (
                <Text variant="bodySm" color="textMuted" style={styles.pickerEmpty}>
                  검색 결과가 없습니다.
                </Text>
              ) : (
                <>
                  {pickerGroups.trip.length > 0 ? (
                    <Text
                      variant="caption"
                      weight="bold"
                      color="textMuted"
                      style={styles.pickerGroupLabel}
                    >
                      이 외근에 방문한 현장
                    </Text>
                  ) : null}
                  {pickerGroups.trip.map((f) => (
                    <Pressable
                      key={f.id}
                      onPress={() => {
                        setFieldId(f.id);
                        setFieldPickerOpen(false);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: f.id === fieldId }}
                      accessibilityLabel={
                        f.addressDetail
                          ? `${f.address}, ${f.addressDetail}`
                          : f.address
                      }
                      style={({ pressed }) => [
                        styles.pickerItem,
                        f.id === fieldId && styles.pickerItemActive,
                        pressed && { opacity: opacity.pressed },
                      ]}
                    >
                      <Text
                        variant="bodySm"
                        weight={f.id === fieldId ? 'bold' : 'semibold'}
                        color={f.id === fieldId ? 'primary' : 'text'}
                      >
                        {f.address}
                      </Text>
                      {f.addressDetail ? (
                        <Text variant="caption" color="textMuted" style={styles.pickerItemMeta}>
                          {f.addressDetail}
                        </Text>
                      ) : null}
                    </Pressable>
                  ))}
                  {pickerGroups.others.length > 0 ? (
                    <Text
                      variant="caption"
                      weight="bold"
                      color="textMuted"
                      style={styles.pickerGroupLabel}
                    >
                      다른 현장
                    </Text>
                  ) : null}
                  {pickerGroups.others.map((f) => (
                    <Pressable
                      key={f.id}
                      onPress={() => {
                        setFieldId(f.id);
                        setFieldPickerOpen(false);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: f.id === fieldId }}
                      accessibilityLabel={
                        f.addressDetail
                          ? `${f.address}, ${f.addressDetail}`
                          : f.address
                      }
                      style={({ pressed }) => [
                        styles.pickerItem,
                        f.id === fieldId && styles.pickerItemActive,
                        pressed && { opacity: opacity.pressed },
                      ]}
                    >
                      <Text
                        variant="bodySm"
                        weight={f.id === fieldId ? 'bold' : 'semibold'}
                        color={f.id === fieldId ? 'primary' : 'text'}
                      >
                        {f.address}
                      </Text>
                      {f.addressDetail ? (
                        <Text variant="caption" color="textMuted" style={styles.pickerItemMeta}>
                          {f.addressDetail}
                        </Text>
                      ) : null}
                    </Pressable>
                  ))}
                </>
              )}
            </ScrollView>
            <Button
              onPress={() => setFieldPickerOpen(false)}
              variant="ghost"
              size="sm"
              fullWidth
            >
              닫기
            </Button>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 현장 사진 갤러리 — 이 현장에 등록된 사진을 골라 선택한 슬롯에 넣는다. */}
      <Modal
        visible={galleryPhase !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setGalleryPhase(null)}
      >
        <Pressable
          style={styles.pickerBackdrop}
          onPress={() => setGalleryPhase(null)}
        >
          <Pressable style={styles.pickerCard} onPress={() => undefined}>
            <Text variant="h3">현장 사진에서 선택</Text>
            <Text variant="bodySm" color="textMuted">
              {`'${PHASES.find((p) => p.key === galleryPhase)?.label ?? ''}' 슬롯에 넣을 사진을 선택하세요.`}
            </Text>
            <ScrollView
              style={styles.pickerList}
              contentContainerStyle={styles.galleryGrid}
            >
              {fieldPhotos.map((ph) => {
                const uri = resolveUrl(ph.fileUrl ?? null);
                return (
                  <Pressable
                    key={ph.id}
                    onPress={() =>
                      galleryPhase && ph.fileUrl
                        ? void pickFromField(galleryPhase, ph.fileUrl)
                        : undefined
                    }
                    accessibilityRole="imagebutton"
                    accessibilityLabel="현장 사진 선택"
                    style={({ pressed }) => [
                      styles.galleryItem,
                      pressed && { opacity: opacity.pressed },
                    ]}
                  >
                    <Image
                      source={{ uri: uri ?? undefined }}
                      style={styles.galleryThumb}
                      resizeMode="cover"
                    />
                  </Pressable>
                );
              })}
            </ScrollView>
            <Button
              onPress={() => setGalleryPhase(null)}
              variant="ghost"
              size="sm"
              fullWidth
            >
              닫기
            </Button>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl },
  heading: { marginBottom: spacing.md },
  wizardHint: { marginTop: -spacing.xs, marginBottom: spacing.sm },
  label: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  readonly: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 0,
  },
  fieldPickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  fieldPickText: { flex: 1 },
  titleField: { marginTop: spacing.md },
  phaseBox: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  phasePhoto: {
    width: '100%',
    height: 160,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  phasePhotoEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  phaseActions: { flexDirection: 'row', gap: spacing.sm },
  phaseBtnFlex: { flex: 1 },
  captionField: { marginTop: spacing.sm },
  error: { marginTop: spacing.md },
  submit: { marginTop: spacing.xl },
  // picker modal
  pickerBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  pickerCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
  },
  pickerList: { flexGrow: 0 },
  pickerListContent: { gap: spacing.xs, paddingVertical: spacing.xs },
  pickerEmpty: { paddingVertical: spacing.md },
  pickerSearch: { marginTop: spacing.sm },
  pickerGroupLabel: {
    marginTop: spacing.xs,
    marginBottom: 2,
    paddingHorizontal: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pickerItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pickerItemActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  pickerItemMeta: { marginTop: 2 },
  // 현장 사진 갤러리 그리드 — 3열 썸네일.
  galleryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  galleryItem: {
    width: '31.5%',
    aspectRatio: 1,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  galleryThumb: { width: '100%', height: '100%' },
});
