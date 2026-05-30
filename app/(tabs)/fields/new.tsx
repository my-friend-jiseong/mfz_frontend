import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { useRouter } from 'expo-router';
import { useFieldStore } from '@/stores/fieldStore';
import { useAuthStore } from '@/stores/authStore';
import { fields as fieldsApi, errorCode, localizeError } from '@/api';
import type { AddressSearchItem } from '@/api';
import type { Field, FieldStatus } from '@/types/entities';
import { FIELD_STATUS_VALUES, FIELD_STATUS_LABEL } from '@/types/entities';
import {
  itemToSelected,
  SEARCH_DEBOUNCE_MS,
  MIN_KEYWORD_LEN,
  type SelectedAddress,
} from '@/utils/addressSearch';
import { ProjectPicker } from '@/components/ProjectPicker';
import { ManualCoordinateForm } from '@/components/fields/ManualCoordinateForm';
import { FieldPinMap } from '@/components/fields/FieldPinMap';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/LoadingState';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { opacity } from '@/theme/motion';
import { FilterChip } from '@/components/ui/FilterChip';
import { SafeScreen } from '@/components/SafeScreen';

// 중복 주소 미리보기 — 본인 fields 중 같은 roadAddress 매칭, alert message 에 fmt.
// 백엔드 응답 details 는 duplicateCount 만 주므로 (backend-backlog 별도 항목 아님 — 로컬로 충분),
// 본인 fields 는 이미 store 에 hydrate 되어 있어 즉시 매칭 가능. 타 사용자 중복은 단일 actor 정책상 의미 적음.
function buildDuplicatePreview(
  roadAddress: string | undefined,
  myFields: readonly Field[],
  duplicateCount: number,
): { count: number; lines: string[] } {
  if (!roadAddress) return { count: duplicateCount, lines: [] };
  const norm = roadAddress.trim().toLowerCase();
  const matches = myFields.filter(
    (f) => f.address.trim().toLowerCase() === norm,
  );
  const lines = matches.slice(0, 5).map((f) => {
    const detail = f.addressDetail ? ` "${f.addressDetail}"` : '';
    return `· ${FIELD_STATUS_LABEL[f.status]}${detail}`;
  });
  if (matches.length > 5) lines.push(`· 외 ${matches.length - 5}건…`);
  // 백엔드가 알린 카운트가 더 크면 (타 사용자 등록 포함 가능) 그 값을 우선.
  return { count: Math.max(duplicateCount, matches.length), lines };
}

export default function NewField() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const createField = useFieldStore((s) => s.create);
  // 중복 매칭용 — 본인 fields 만.
  // selector 안에서 .filter() 호출하면 매 render 마다 새 array reference → Zustand 가
  // store changed 로 판정 → 무한 re-render → React error #185 (Maximum update depth).
  // raw 배열 구독 + useMemo 로 도출.
  const userId = user?.id;
  const allFields = useFieldStore((s) => s.fields);
  const myFields = useMemo(
    () => (userId ? allFields.filter((f) => f.userId === userId) : []),
    [allFields, userId],
  );

  const [step, setStep] = useState<1 | 2>(1);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AddressSearchItem[]>([]);
  const [emptyMessage, setEmptyMessage] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [providerUnavailable, setProviderUnavailable] = useState(false);
  const [searching, setSearching] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  // 카카오 장애 시 retry 트리거 — query 가 그대로면 effect 가 다시 안 돌므로 토큰 증가로 재실행.
  const [retryToken, setRetryToken] = useState(0);

  const [selected, setSelected] = useState<SelectedAddress | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [categoriesStr, setCategoriesStr] = useState('');
  const [detail, setDetail] = useState('');
  const [status, setStatus] = useState<FieldStatus>('pending');
  const [submitting, setSubmitting] = useState(false);

  // 디바운스 검색 — 키워드 변경 시 SEARCH_DEBOUNCE_MS 후 호출.
  // 호출 도중 입력이 또 바뀌면 기존 결과는 폐기 (latest-wins).
  const reqIdRef = useRef(0);
  useEffect(() => {
    const k = query.trim();
    if (k.length < MIN_KEYWORD_LEN) {
      setResults([]);
      setEmptyMessage(null);
      setSearchError(null);
      setProviderUnavailable(false);
      setSearching(false);
      return;
    }
    const myReqId = ++reqIdRef.current;
    setSearching(true);
    setSearchError(null);
    const handle = setTimeout(async () => {
      try {
        const res = await fieldsApi.addressSearch(k);
        if (myReqId !== reqIdRef.current) return;
        setResults(res.items);
        setEmptyMessage(res.emptyMessage ?? null);
        setProviderUnavailable(false);
        setSearchError(null);
      } catch (e) {
        if (myReqId !== reqIdRef.current) return;
        if (errorCode(e) === 'kakao_provider_unavailable') {
          setProviderUnavailable(true);
          setResults([]);
          setEmptyMessage(null);
          setSearchError(null);
        } else {
          setSearchError(localizeError(e));
          setResults([]);
        }
      } finally {
        if (myReqId === reqIdRef.current) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query, retryToken]);

  const handleSelectItem = (item: AddressSearchItem) => {
    setSelected(itemToSelected(item));
    setStep(2);
  };


  const handleCreate = async () => {
    if (!user || !selected) return;
    const categories = categoriesStr
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    const baseBody = {
      name: selected.display,
      status,
      roadAddress: selected.roadAddress,
      detailAddress: detail,
      lat: selected.lat,
      lng: selected.lng,
      ...(projectId ? { projectId } : {}),
      ...(categories.length > 0 ? { categories } : {}),
      ...(selected.sido ? { sido: selected.sido } : {}),
      ...(selected.sigungu ? { sigungu: selected.sigungu } : {}),
    };

    setSubmitting(true);
    const result = await createField(baseBody);
    setSubmitting(false);

    if (result.ok) {
      router.replace(`/(tabs)/fields/${result.field.id}` as never);
      return;
    }

    if ('needsConfirm' in result) {
      // Phase 7 duplicate_address_warning_required — confirm 후 forceCreateWithDuplicate 로 재호출
      const proceed = (yes: boolean) => {
        if (!yes) return;
        void (async () => {
          setSubmitting(true);
          const forced = await createField({ ...baseBody, forceCreateWithDuplicate: true });
          setSubmitting(false);
          if (forced.ok) {
            router.replace(`/(tabs)/fields/${forced.field.id}` as never);
          } else if (!('needsConfirm' in forced)) {
            Alert.alert('등록 실패', forced.error);
          }
        })();
      };
      const preview = buildDuplicatePreview(
        selected?.roadAddress,
        myFields,
        result.duplicateCount,
      );
      const head =
        preview.count > 0
          ? `같은 주소의 기존 현장이 ${preview.count}건 있습니다.`
          : result.message;
      const body = preview.lines.length > 0 ? `\n\n${preview.lines.join('\n')}` : '';
      const msg = `${head}${body}\n\n계속 진행할까요?`;
      if (Platform.OS === 'web') {
        if (confirm(msg)) proceed(true);
      } else {
        Alert.alert('중복 주소 확인', msg, [
          { text: '취소', style: 'cancel' },
          { text: '그래도 등록', onPress: () => proceed(true) },
        ]);
      }
      return;
    }

    Alert.alert('등록 실패', result.error);
  };

  const showManualEntry = providerUnavailable || manualMode;
  const trimmedQuery = query.trim();
  const showEmptyHint =
    !searching &&
    !providerUnavailable &&
    !searchError &&
    trimmedQuery.length >= MIN_KEYWORD_LEN &&
    results.length === 0;

  return (
    <SafeScreen>
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.stepRow}>
          <View style={[styles.stepDot, styles.stepDotActive]}>
            <Text variant="caption" weight="bold" color="onPrimary">
              1
            </Text>
          </View>
          <View style={[styles.stepLine, step === 2 && styles.stepLineActive]} />
          <View style={[styles.stepDot, step === 2 && styles.stepDotActive]}>
            <Text
              variant="caption"
              weight="bold"
              color={step === 2 ? 'onPrimary' : 'textMuted'}
            >
              2
            </Text>
          </View>
        </View>
        <Text variant="h3" style={styles.title}>
          {step === 1 ? '주소 검색' : '상세 입력'}
        </Text>

        {step === 1 ? (
          <>
            <Input
              label="주소 또는 건물명"
              value={query}
              onChangeText={setQuery}
              placeholder="예: 해운대 우동, 동성로"
              autoFocus
              autoCapitalize="none"
              returnKeyType="search"
            />

            {searching ? (
              <View style={styles.loadingRow}>
                <LoadingState inline label="검색 중" />
              </View>
            ) : null}

            {searchError ? (
              <Text variant="caption" color="danger" style={styles.errorText}>
                {searchError}
              </Text>
            ) : null}

            {providerUnavailable ? (
              <Card padding="md" style={styles.warnBox}>
                <Text variant="bodySm" weight="bold">
                  주소 검색 일시 장애
                </Text>
                <Text variant="caption" color="textMuted" style={styles.warnBody}>
                  카카오 주소 서비스가 일시적으로 응답하지 않습니다. 다시 시도하거나 좌표를 직접 입력하세요.
                </Text>
                <Button
                  onPress={() => {
                    setProviderUnavailable(false);
                    setRetryToken((t) => t + 1);
                  }}
                  variant="secondary"
                  size="sm"
                  leftIcon="refresh"
                  style={styles.retryBtn}
                >
                  다시 시도
                </Button>
              </Card>
            ) : null}

            {showEmptyHint ? (
              <Text variant="caption" color="textMuted" style={styles.hint}>
                {emptyMessage ?? '검색 결과가 없습니다'}
              </Text>
            ) : null}

            <View style={styles.resultList}>
              {results.map((r, idx) => {
                const key = `${r.roadAddress}|${r.jibunAddress}|${idx}`;
                const sub = [r.sido, r.sigungu].filter(Boolean).join(' ');
                return (
                  <Pressable
                    key={key}
                    onPress={() => handleSelectItem(r)}
                    style={({ pressed }) => [
                      styles.addrItem,
                      pressed && { opacity: opacity.pressed },
                    ]}
                  >
                    <Text variant="body" weight="semibold">
                      {r.roadAddress || r.jibunAddress}
                      {r.buildingName ? ` (${r.buildingName})` : ''}
                    </Text>
                    {r.roadAddress && r.jibunAddress && r.roadAddress !== r.jibunAddress ? (
                      <Text variant="caption" color="textMuted" style={styles.addrJibun}>
                        지번: {r.jibunAddress}
                      </Text>
                    ) : null}
                    <Text variant="caption" color="textMuted" style={styles.addrCoord}>
                      {sub ? `${sub} · ` : ''}
                      {r.lat.toFixed(4)}, {r.lng.toFixed(4)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* 수동 좌표 입력 fallback — provider unavailable 또는 사용자 명시 진입 */}
            {showManualEntry ? (
              <ManualCoordinateForm
                onResolve={(addr) => {
                  setSelected(addr);
                  setStep(2);
                  setManualMode(false);
                }}
              />
            ) : null}

            {showEmptyHint && !manualMode ? (
              <Button
                onPress={() => setManualMode(true)}
                variant="ghost"
                size="sm"
                rightIcon="arrow-forward"
                style={styles.manualLink}
              >
                좌표 직접 입력
              </Button>
            ) : null}
          </>
        ) : (
          <>
            <Button
              onPress={() => setStep(1)}
              variant="ghost"
              size="sm"
              leftIcon="arrow-back"
              style={styles.backBtn}
            >
              주소 다시 선택
            </Button>

            <Card padding="md" style={styles.selectedBox}>
              <Text variant="caption" weight="bold" color="primary">
                선택한 주소
              </Text>
              <Text variant="body" weight="semibold" style={styles.selectedAddr}>
                {selected?.display}
              </Text>
              {selected ? (
                <Text variant="caption" color="textMuted" style={styles.selectedCoord}>
                  {selected.lat.toFixed(6)}, {selected.lng.toFixed(6)}
                </Text>
              ) : null}
            </Card>

            {selected ? (
              <>
                <Text variant="caption" color="textMuted" style={styles.pinHint}>
                  지도를 탭하거나 핀을 드래그해 정확한 위치로 조정할 수 있어요
                </Text>
                <FieldPinMap
                  lat={selected.lat}
                  lng={selected.lng}
                  onDragEnd={(la, ln) =>
                    setSelected((prev) =>
                      prev ? { ...prev, lat: la, lng: ln } : prev,
                    )
                  }
                />
              </>
            ) : null}

            <Text variant="bodySm" weight="semibold" color="textMuted" style={styles.label}>
              프로젝트 (선택)
            </Text>
            <ProjectPicker value={projectId} onChange={setProjectId} />

            <Input
              label="분류 (선택, 쉼표로 구분)"
              value={categoriesStr}
              onChangeText={setCategoriesStr}
              placeholder="예: 가로수, 보수, 긴급"
              containerStyle={styles.fieldGap}
            />

            <Input
              label="상세 주소 (동/호수 등)"
              value={detail}
              onChangeText={setDetail}
              placeholder="예: 101동 1203호"
              containerStyle={styles.fieldGap}
            />

            <Text variant="bodySm" weight="semibold" color="textMuted" style={styles.label}>
              상태
            </Text>
            <View style={styles.statusRow}>
              {FIELD_STATUS_VALUES.map((s) => (
                <FilterChip
                  key={s}
                  label={FIELD_STATUS_LABEL[s]}
                  active={status === s}
                  activeColor={colors.fieldStatus[s]}
                  onPress={() => setStatus(s)}
                />
              ))}
            </View>

            <Button
              onPress={handleCreate}
              loading={submitting}
              size="lg"
              fullWidth
              leftIcon="checkmark"
              style={styles.submit}
            >
              현장 등록
            </Button>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl * 2 },
  // 단계 표시
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: { backgroundColor: colors.primary },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 1,
  },
  stepLineActive: { backgroundColor: colors.primary },
  title: { marginBottom: spacing.lg },
  label: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  fieldGap: { marginTop: spacing.md },
  hint: { marginTop: spacing.sm },
  loadingRow: { marginTop: spacing.sm },
  errorText: { marginTop: spacing.sm },
  warnBox: {
    backgroundColor: colors.warningMuted,
    borderWidth: 1,
    borderColor: colors.warning,
    marginTop: spacing.sm,
  },
  warnBody: { marginTop: 4 },
  retryBtn: { marginTop: spacing.sm, alignSelf: 'flex-start' },
  resultList: { marginTop: spacing.md },
  addrItem: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  addrJibun: { marginTop: 2 },
  addrCoord: { marginTop: 2 },
  manualLink: { marginTop: spacing.md, alignSelf: 'flex-start' },
  backBtn: { alignSelf: 'flex-start', marginBottom: spacing.md },
  selectedBox: {
    backgroundColor: colors.primaryMuted,
    marginBottom: spacing.md,
  },
  selectedAddr: { marginTop: 2 },
  selectedCoord: { marginTop: 4 },
  pinHint: { marginTop: spacing.xs, marginBottom: spacing.xs },
  statusRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  submit: { marginTop: spacing.xl },
});
