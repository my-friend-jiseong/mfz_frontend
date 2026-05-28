import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFieldStore } from '@/stores/fieldStore';
import { useAuthStore } from '@/stores/authStore';
import { fields as fieldsApi, errorCode, localizeError } from '@/api';
import type { AddressSearchItem } from '@/api';
import type { FieldStatus } from '@/types/entities';
import { FIELD_STATUS_VALUES, FIELD_STATUS_LABEL } from '@/types/entities';
import {
  itemToSelected,
  isInKorea,
  KR_LAT,
  KR_LNG,
  SEARCH_DEBOUNCE_MS,
  MIN_KEYWORD_LEN,
  type SelectedAddress,
} from '@/utils/addressSearch';
import { ProjectPicker } from '@/components/ProjectPicker';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/LoadingState';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize, fontWeight, lineHeight } from '@/theme/spacing';
import { opacity } from '@/theme/motion';

export default function NewField() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const createField = useFieldStore((s) => s.create);

  const [step, setStep] = useState<1 | 2>(1);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AddressSearchItem[]>([]);
  const [emptyMessage, setEmptyMessage] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [providerUnavailable, setProviderUnavailable] = useState(false);
  const [searching, setSearching] = useState(false);
  const [manualMode, setManualMode] = useState(false);

  // 수동 좌표 입력 폼 (provider unavailable / manual fallback 일 때만 노출)
  const [manualRoad, setManualRoad] = useState('');
  const [manualJibun, setManualJibun] = useState('');
  const [manualLatStr, setManualLatStr] = useState('');
  const [manualLngStr, setManualLngStr] = useState('');

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
  }, [query]);

  const handleSelectItem = (item: AddressSearchItem) => {
    setSelected(itemToSelected(item));
    setStep(2);
  };

  const handleManualSubmit = () => {
    if (!manualRoad.trim() && !manualJibun.trim()) {
      Alert.alert('주소 입력 필요', '도로명 주소 또는 지번 주소 중 하나는 입력해주세요.');
      return;
    }
    // Number('') === 0 함정 차단 — 빈 입력은 finite 통과하므로 raw string 단계에서 가드.
    if (!manualLatStr.trim() || !manualLngStr.trim()) {
      Alert.alert('좌표 입력 필요', '위도·경도를 모두 입력해주세요.');
      return;
    }
    const lat = Number(manualLatStr);
    const lng = Number(manualLngStr);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      Alert.alert('좌표 형식 오류', '위도·경도를 숫자로 입력해주세요.');
      return;
    }
    if (!isInKorea(lat, lng)) {
      Alert.alert(
        '대한민국 영역 외 좌표',
        `위도는 ${KR_LAT.min}~${KR_LAT.max}, 경도는 ${KR_LNG.min}~${KR_LNG.max} 범위여야 합니다.`,
      );
      return;
    }
    setSelected({
      roadAddress: manualRoad.trim() || manualJibun.trim(),
      jibunAddress: manualJibun.trim() || manualRoad.trim(),
      buildingName: null,
      lat,
      lng,
      display: manualRoad.trim() || manualJibun.trim(),
    });
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
      const msg =
        result.duplicateCount > 0
          ? `같은 주소의 기존 현장이 ${result.duplicateCount}건 있습니다.\n계속 진행할까요?`
          : `${result.message}\n계속 진행할까요?`;
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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.stepRow}>
          <View style={[styles.stepDot, styles.stepDotActive]}>
            <Text style={styles.stepDotText}>1</Text>
          </View>
          <View style={[styles.stepLine, step === 2 && styles.stepLineActive]} />
          <View style={[styles.stepDot, step === 2 && styles.stepDotActive]}>
            <Text style={[styles.stepDotText, step !== 2 && styles.stepDotTextMuted]}>2</Text>
          </View>
        </View>
        <Text style={styles.title}>
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

            {searchError ? <Text style={styles.errorText}>{searchError}</Text> : null}

            {providerUnavailable ? (
              <Card padding="md" style={styles.warnBox}>
                <Text style={styles.warnTitle}>주소 검색 일시 장애</Text>
                <Text style={styles.warnBody}>
                  카카오 주소 서비스가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도하거나 좌표를 직접 입력하세요.
                </Text>
              </Card>
            ) : null}

            {showEmptyHint ? (
              <Text style={styles.hint}>{emptyMessage ?? '검색 결과가 없습니다'}</Text>
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
                    <Text style={styles.addrText}>
                      {r.roadAddress || r.jibunAddress}
                      {r.buildingName ? ` (${r.buildingName})` : ''}
                    </Text>
                    {r.roadAddress && r.jibunAddress && r.roadAddress !== r.jibunAddress ? (
                      <Text style={styles.addrJibun}>지번: {r.jibunAddress}</Text>
                    ) : null}
                    <Text style={styles.addrCoord}>
                      {sub ? `${sub} · ` : ''}
                      {r.lat.toFixed(4)}, {r.lng.toFixed(4)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* 수동 좌표 입력 fallback — provider unavailable 또는 사용자 명시 진입 */}
            {showManualEntry ? (
              <View style={styles.manualBox}>
                <Text style={styles.manualTitle}>좌표 직접 입력</Text>
                <Input
                  label="도로명 주소"
                  value={manualRoad}
                  onChangeText={setManualRoad}
                  placeholder="예: 부산광역시 해운대구 해운대해변로 264"
                  containerStyle={styles.manualField}
                />
                <Input
                  label="지번 주소"
                  value={manualJibun}
                  onChangeText={setManualJibun}
                  placeholder="예: 부산광역시 해운대구 우동 1411"
                  containerStyle={styles.manualField}
                />
                <View style={styles.coordRow}>
                  <Input
                    label="위도 (lat)"
                    value={manualLatStr}
                    onChangeText={setManualLatStr}
                    keyboardType="numeric"
                    placeholder="33~43"
                    containerStyle={styles.coordHalf}
                  />
                  <Input
                    label="경도 (lng)"
                    value={manualLngStr}
                    onChangeText={setManualLngStr}
                    keyboardType="numeric"
                    placeholder="124~132"
                    containerStyle={styles.coordHalf}
                  />
                </View>
                <Button
                  onPress={handleManualSubmit}
                  fullWidth
                  leftIcon="location"
                  style={styles.manualSubmit}
                >
                  이 좌표로 진행
                </Button>
              </View>
            ) : null}

            {showEmptyHint && !manualMode ? (
              <Button
                onPress={() => setManualMode(true)}
                variant="ghost"
                size="sm"
                rightIcon="arrow-forward"
                style={styles.manualLink}
              >
                좌표 직접 입력으로 진행
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
              <Text style={styles.selectedLabel}>선택한 주소</Text>
              <Text style={styles.selectedAddr}>{selected?.display}</Text>
              {selected ? (
                <Text style={styles.selectedCoord}>
                  {selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}
                </Text>
              ) : null}
            </Card>

            <Text style={styles.label}>프로젝트 (선택)</Text>
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

            <Text style={styles.label}>상태</Text>
            <View style={styles.statusRow}>
              {FIELD_STATUS_VALUES.map((s) => {
                const active = status === s;
                const c = colors.fieldStatus[s];
                return (
                  <Pressable
                    key={s}
                    onPress={() => setStatus(s)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => [
                      styles.statusChip,
                      active && { backgroundColor: c + '22', borderColor: c },
                      pressed && { opacity: opacity.pressed },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusChipText,
                        active && { color: c, fontWeight: fontWeight.bold },
                      ]}
                    >
                      {FIELD_STATUS_LABEL[s]}
                    </Text>
                  </Pressable>
                );
              })}
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
  stepDotText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.onPrimary,
  },
  stepDotTextMuted: { color: colors.textMuted },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 1,
  },
  stepLineActive: { backgroundColor: colors.primary },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.lg,
    lineHeight: lineHeight.lg,
  },
  label: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: fontWeight.semibold,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  fieldGap: { marginTop: spacing.md },
  hint: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.sm },
  loadingRow: { marginTop: spacing.sm },
  errorText: {
    fontSize: fontSize.xs,
    color: colors.danger,
    marginTop: spacing.sm,
  },
  warnBox: {
    backgroundColor: colors.warningMuted,
    borderWidth: 1,
    borderColor: colors.warning,
    marginTop: spacing.sm,
  },
  warnTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  warnBody: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 4,
    lineHeight: lineHeight.xs,
  },
  resultList: { marginTop: spacing.md },
  addrItem: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  addrText: {
    fontSize: fontSize.base,
    color: colors.text,
    fontWeight: fontWeight.semibold,
  },
  addrJibun: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  addrCoord: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  manualBox: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  manualTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  manualField: { marginTop: spacing.sm },
  manualSubmit: { marginTop: spacing.md },
  manualLink: { marginTop: spacing.md, alignSelf: 'flex-start' },
  coordRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  coordHalf: { flex: 1 },
  backBtn: { alignSelf: 'flex-start', marginBottom: spacing.md },
  selectedBox: {
    backgroundColor: colors.primaryMuted,
    marginBottom: spacing.md,
  },
  selectedLabel: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: fontWeight.bold,
  },
  selectedAddr: {
    fontSize: fontSize.base,
    color: colors.text,
    marginTop: 2,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.base,
  },
  selectedCoord: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 4,
  },
  statusRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  statusChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  statusChipText: { fontSize: fontSize.sm, color: colors.textMuted },
  submit: { marginTop: spacing.xl },
});
