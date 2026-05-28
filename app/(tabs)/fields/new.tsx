import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';

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
        // provider.manualCoordinateFallback === true 면 빈 결과 시 수동 입력 진입점 노출
        // (검색 자체는 성공했지만 결과가 0건일 때)
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
    const lat = Number(manualLatStr);
    const lng = Number(manualLngStr);
    if (!manualRoad.trim() && !manualJibun.trim()) {
      Alert.alert('주소 입력 필요', '도로명 주소 또는 지번 주소 중 하나는 입력해주세요.');
      return;
    }
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
      const msg = result.duplicateCount > 0
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
        <Text style={styles.title}>
          {step === 1 ? '1단계. 주소 검색' : '2단계. 상세 입력'}
        </Text>

        {step === 1 ? (
          <>
            <Text style={styles.label}>주소 또는 건물명</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              style={styles.input}
              placeholder="예: 해운대 우동, 동성로"
              autoFocus
              autoCapitalize="none"
              returnKeyType="search"
            />

            {searching ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.primary} size="small" />
                <Text style={styles.loadingText}>검색 중...</Text>
              </View>
            ) : null}

            {searchError ? (
              <Text style={styles.errorText}>{searchError}</Text>
            ) : null}

            {providerUnavailable ? (
              <View style={styles.warnBox}>
                <Text style={styles.warnTitle}>주소 검색 일시 장애</Text>
                <Text style={styles.warnBody}>
                  카카오 주소 서비스가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도하거나 좌표를 직접 입력하세요.
                </Text>
              </View>
            ) : null}

            {showEmptyHint ? (
              <Text style={styles.hint}>{emptyMessage ?? '검색 결과가 없습니다'}</Text>
            ) : null}

            <View style={{ marginTop: spacing.md }}>
              {results.map((r, idx) => {
                const key = `${r.roadAddress}|${r.jibunAddress}|${idx}`;
                const sub = [r.sido, r.sigungu].filter(Boolean).join(' ');
                return (
                  <Pressable
                    key={key}
                    onPress={() => handleSelectItem(r)}
                    style={({ pressed }) => [styles.addrItem, pressed && styles.pressed]}
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
                <Text style={styles.label}>도로명 주소</Text>
                <TextInput
                  value={manualRoad}
                  onChangeText={setManualRoad}
                  style={styles.input}
                  placeholder="예: 부산광역시 해운대구 해운대해변로 264"
                />
                <Text style={styles.label}>지번 주소</Text>
                <TextInput
                  value={manualJibun}
                  onChangeText={setManualJibun}
                  style={styles.input}
                  placeholder="예: 부산광역시 해운대구 우동 1411"
                />
                <View style={styles.coordRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>위도 (lat)</Text>
                    <TextInput
                      value={manualLatStr}
                      onChangeText={setManualLatStr}
                      style={styles.input}
                      keyboardType="numeric"
                      placeholder="33~43"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>경도 (lng)</Text>
                    <TextInput
                      value={manualLngStr}
                      onChangeText={setManualLngStr}
                      style={styles.input}
                      keyboardType="numeric"
                      placeholder="124~132"
                    />
                  </View>
                </View>
                <Pressable
                  onPress={handleManualSubmit}
                  style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
                >
                  <Text style={styles.btnText}>이 좌표로 진행</Text>
                </Pressable>
              </View>
            ) : null}

            {/* 검색 결과 0건 시 수동 입력 진입점 — provider 가 manualCoordinateFallback 옵션을 두었을 때 의미 있음 */}
            {showEmptyHint && !manualMode ? (
              <Pressable
                onPress={() => setManualMode(true)}
                style={({ pressed }) => [styles.manualLink, pressed && styles.pressed]}
              >
                <Text style={styles.manualLinkText}>좌표 직접 입력으로 진행 →</Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <>
            <Pressable onPress={() => setStep(1)}>
              <Text style={styles.backLink}>← 주소 다시 선택</Text>
            </Pressable>

            <View style={styles.selectedBox}>
              <Text style={styles.selectedLabel}>선택한 주소</Text>
              <Text style={styles.selectedAddr}>{selected?.display}</Text>
              {selected ? (
                <Text style={styles.selectedCoord}>
                  {selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}
                </Text>
              ) : null}
            </View>

            <Text style={styles.label}>프로젝트 (선택)</Text>
            <ProjectPicker value={projectId} onChange={setProjectId} />

            <Text style={styles.label}>분류 (선택, 쉼표로 구분)</Text>
            <TextInput
              value={categoriesStr}
              onChangeText={setCategoriesStr}
              style={styles.input}
              placeholder="예: 가로수, 보수, 긴급"
            />

            <Text style={styles.label}>상세 주소 (동/호수 등)</Text>
            <TextInput
              value={detail}
              onChangeText={setDetail}
              style={styles.input}
              placeholder="예: 101동 1203호"
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
                    style={[
                      styles.statusChip,
                      active && { backgroundColor: c + '22', borderColor: c },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusChipText,
                        active && { color: c, fontWeight: '700' },
                      ]}
                    >
                      {FIELD_STATUS_LABEL[s]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={handleCreate}
              disabled={submitting}
              style={({ pressed }) => [styles.btn, (pressed || submitting) && styles.pressed]}
            >
              <Text style={styles.btnText}>{submitting ? '등록 중...' : '현장 등록'}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.xl },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '600',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.base,
    color: colors.text,
  },
  hint: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.sm },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  loadingText: { fontSize: fontSize.xs, color: colors.textMuted },
  errorText: { fontSize: fontSize.xs, color: colors.danger ?? '#d23', marginTop: spacing.sm },
  warnBox: {
    backgroundColor: '#fff7e6',
    borderColor: '#f0ad4e',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  warnTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  warnBody: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 4 },
  addrItem: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  pressed: { opacity: 0.7 },
  addrText: { fontSize: fontSize.base, color: colors.text, fontWeight: '600' },
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
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  manualLink: {
    marginTop: spacing.md,
    alignSelf: 'flex-start',
  },
  manualLinkText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
  },
  coordRow: { flexDirection: 'row', gap: spacing.sm },
  backLink: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  selectedBox: {
    backgroundColor: colors.primary + '10',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  selectedLabel: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '600' },
  selectedAddr: { fontSize: fontSize.base, color: colors.text, marginTop: 2 },
  selectedCoord: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 4 },
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
  btn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  btnText: { color: '#fff', fontSize: fontSize.base, fontWeight: '700' },
});
