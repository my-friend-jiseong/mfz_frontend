import { useEffect, useMemo, useRef, useState } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFieldStore } from '@/stores/fieldStore';
import { safeBack } from '@/utils/backNavigation';
import { FIELD_STATUS_VALUES, FIELD_STATUS_LABEL, type FieldStatus } from '@/types/entities';
import { fields as fieldsApi, errorCode, localizeError } from '@/api';
import type { AddressSearchItem, UpdateFieldBody } from '@/api';
import {
  itemToSelected,
  isInKorea,
  KR_LAT,
  KR_LNG,
  SEARCH_DEBOUNCE_MS,
  MIN_KEYWORD_LEN,
  type SelectedAddress,
} from '@/utils/addressSearch';
import { EmptyState } from '@/components/EmptyState';
import { ProjectPicker } from '@/components/ProjectPicker';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';

const DETAIL_MAX = 100;

interface FieldErrors {
  detailAddress?: string;
  status?: string;
  address?: string;
  categories?: string;
}

export default function EditField() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const fieldId = id ?? '';
  const router = useRouter();

  const field = useFieldStore((s) => s.getById(fieldId));
  const update = useFieldStore((s) => s.update);
  const remove = useFieldStore((s) => s.remove);

  // Hooks must be called unconditionally — early return 후로 옮기지 않고 옵셔널 처리.
  const initial = useMemo(
    () => ({
      addressDetail: field?.addressDetail ?? '',
      status: field?.status ?? ('pending' as FieldStatus),
      categories: (field?.categories ?? []).join(', '),
      projectId: field?.projectId ?? null,
    }),
    [field?.addressDetail, field?.status, field?.categories, field?.projectId],
  );
  const initialRef = useRef(initial);

  const [addressDetail, setAddressDetail] = useState(initial.addressDetail);
  const [status, setStatus] = useState<FieldStatus>(initial.status);
  const [categoriesStr, setCategoriesStr] = useState(initial.categories);
  const [projectId, setProjectId] = useState<string | null>(initial.projectId);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 주소 수정 — 기본은 readonly, "수정" 버튼 누르면 카카오 Geocoder 검색 UI 노출.
  // newAddress 가 null 이 아니면 사용자가 새 주소를 선택한 상태 (저장 시 PATCH 에 포함).
  const [editingAddress, setEditingAddress] = useState(false);
  const [newAddress, setNewAddress] = useState<SelectedAddress | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AddressSearchItem[]>([]);
  const [emptyMessage, setEmptyMessage] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [providerUnavailable, setProviderUnavailable] = useState(false);
  const [searching, setSearching] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualRoad, setManualRoad] = useState('');
  const [manualJibun, setManualJibun] = useState('');
  const [manualLatStr, setManualLatStr] = useState('');
  const [manualLngStr, setManualLngStr] = useState('');

  // 디바운스 검색 — fields/new.tsx 와 동일한 패턴 (latest-wins).
  const reqIdRef = useRef(0);
  useEffect(() => {
    if (!editingAddress) return;
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
  }, [query, editingAddress]);

  const handleStartAddressEdit = () => {
    setEditingAddress(true);
    setQuery('');
    setResults([]);
  };

  const handleCancelAddressEdit = () => {
    setEditingAddress(false);
    setNewAddress(null);
    setQuery('');
    setResults([]);
    setManualMode(false);
    setProviderUnavailable(false);
    setSearchError(null);
    if (fieldErrors.address) clearFieldErr('address');
  };

  const handleSelectItem = (item: AddressSearchItem) => {
    setNewAddress(itemToSelected(item));
    setEditingAddress(false);
    if (fieldErrors.address) clearFieldErr('address');
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
    setNewAddress({
      roadAddress: manualRoad.trim() || manualJibun.trim(),
      jibunAddress: manualJibun.trim() || manualRoad.trim(),
      buildingName: null,
      lat,
      lng,
      display: manualRoad.trim() || manualJibun.trim(),
    });
    setEditingAddress(false);
    setManualMode(false);
  };

  const handleRevertAddress = () => {
    setNewAddress(null);
  };

  if (!field) {
    return (
      <View style={styles.container}>
        <EmptyState title="현장을 찾을 수 없습니다" />
      </View>
    );
  }

  const detailTrim = addressDetail.trim();
  const categoriesTrim = categoriesStr.trim();
  const hasChanges =
    detailTrim !== initialRef.current.addressDetail.trim() ||
    status !== initialRef.current.status ||
    categoriesTrim !== initialRef.current.categories.trim() ||
    projectId !== initialRef.current.projectId ||
    newAddress !== null;

  const clearFieldErr = (k: keyof FieldErrors) =>
    setFieldErrors((p) => ({ ...p, [k]: undefined }));

  const handleSave = async () => {
    setGlobalError(null);
    const errs: FieldErrors = {};
    if (detailTrim.length > DETAIL_MAX)
      errs.detailAddress = `상세 주소는 ${DETAIL_MAX}자 이하여야 합니다`;
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);

    // 변경된 항목만 호출 — 빈 PATCH 방지.
    const detailChanged = detailTrim !== initialRef.current.addressDetail.trim();
    const statusChanged = status !== initialRef.current.status;
    const categoriesChanged = categoriesTrim !== initialRef.current.categories.trim();
    const projectIdChanged = projectId !== initialRef.current.projectId;
    const addressChanged = newAddress !== null;

    if (detailChanged || categoriesChanged || projectIdChanged || addressChanged) {
      const body: UpdateFieldBody = {};
      if (detailChanged) body.detailAddress = detailTrim;
      if (categoriesChanged) {
        body.categories = categoriesTrim
          ? categoriesTrim.split(',').map((c) => c.trim()).filter(Boolean)
          : [];
      }
      if (projectIdChanged) body.projectId = projectId; // null → 해제
      if (addressChanged && newAddress) {
        body.roadAddress = newAddress.roadAddress;
        body.lat = newAddress.lat;
        body.lng = newAddress.lng;
        if (newAddress.sido) body.sido = newAddress.sido;
        if (newAddress.sigungu) body.sigungu = newAddress.sigungu;
      }
      const updateRes = await update(fieldId, body);
      if (!updateRes.ok) {
        setSubmitting(false);
        if (/일시적인 오류|일시적|서버/.test(updateRes.error)) {
          setGlobalError(updateRes.error);
        } else if (addressChanged) {
          setFieldErrors({ address: updateRes.error });
        } else {
          setFieldErrors({ detailAddress: updateRes.error });
        }
        return;
      }
    }

    if (statusChanged) {
      const statusRes = await useFieldStore.getState().patchStatus(fieldId, status);
      if (!statusRes.ok) {
        setSubmitting(false);
        if (/일시적인 오류|일시적|서버/.test(statusRes.error)) {
          setGlobalError(statusRes.error);
        } else {
          setFieldErrors({ status: statusRes.error });
        }
        return;
      }
    }

    setSubmitting(false);
    safeBack(router);
  };

  const performDelete = async () => {
    const r = await remove(fieldId);
    if (r.ok) {
      router.replace('/(tabs)/fields' as never);
      return;
    }
    if ('needsConfirm' in r) {
      // 단일 Actor 정책 — 강제 삭제 미지원, 안내만.
      Alert.alert(
        '삭제할 수 없습니다',
        r.message + '\n\n방문 기록이 남아 있는 현장은 삭제할 수 없습니다.',
      );
    } else if (/일시적인 오류|일시적|서버/.test(r.error)) {
      Alert.alert(
        '서버 오류',
        '현재 서버에서 삭제를 처리하지 못하고 있습니다.\n잠시 후 다시 시도해주세요.',
      );
    } else {
      Alert.alert('삭제 실패', r.error);
    }
  };

  const handleDelete = () => {
    if (Platform.OS === 'web') {
      if (confirm('이 현장을 삭제할까요? 연관된 방문·첨부는 유지됩니다.')) {
        void performDelete();
      }
    } else {
      Alert.alert('현장 삭제', '이 현장을 삭제할까요?', [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: () => void performDelete() },
      ]);
    }
  };

  const handleCancel = () => {
    if (!hasChanges) {
      safeBack(router);
      return;
    }
    Alert.alert('수정 취소', '저장하지 않은 변경 사항이 있습니다. 계속 취소할까요?', [
      { text: '계속 작성', style: 'cancel' },
      { text: '버리고 나가기', style: 'destructive', onPress: () => safeBack(router) },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.labelRow}>
          <Text style={styles.label}>주소</Text>
          {!editingAddress && !newAddress ? (
            <Pressable
              onPress={handleStartAddressEdit}
              disabled={submitting}
              style={({ pressed }) => [
                styles.addrEditBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.addrEditBtnText}>수정</Text>
            </Pressable>
          ) : null}
          {newAddress ? (
            <Pressable
              onPress={handleRevertAddress}
              disabled={submitting}
              style={({ pressed }) => [
                styles.addrEditBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.addrEditBtnText}>되돌리기</Text>
            </Pressable>
          ) : null}
        </View>
        <View
          style={[
            styles.readonly,
            newAddress && styles.readonlyChanged,
          ]}
        >
          <Text style={styles.readonlyText}>
            {newAddress ? newAddress.display : field.address}
          </Text>
          {newAddress ? (
            <Text style={styles.changedHint}>
              변경 예정 — 저장 시 적용 (좌표 {newAddress.lat.toFixed(4)}, {newAddress.lng.toFixed(4)})
            </Text>
          ) : null}
        </View>

        {editingAddress ? (
          <View style={styles.addrSearchBox}>
            <View style={styles.searchHead}>
              <Text style={styles.label}>새 주소 검색</Text>
              <Pressable onPress={handleCancelAddressEdit} disabled={submitting}>
                <Text style={styles.cancelLink}>취소</Text>
              </Pressable>
            </View>
            <TextInput
              value={query}
              onChangeText={setQuery}
              style={styles.input}
              placeholder="예: 해운대 우동, 동성로"
              autoCapitalize="none"
              returnKeyType="search"
              autoFocus
            />
            {searching ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.primary} size="small" />
                <Text style={styles.loadingText}>검색 중...</Text>
              </View>
            ) : null}
            {searchError ? <Text style={styles.fieldError}>{searchError}</Text> : null}
            {providerUnavailable ? (
              <View style={styles.warnBox}>
                <Text style={styles.warnTitle}>주소 검색 일시 장애</Text>
                <Text style={styles.warnBody}>
                  카카오 주소 서비스가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도하거나 좌표를 직접 입력하세요.
                </Text>
              </View>
            ) : null}
            {!searching &&
            !providerUnavailable &&
            !searchError &&
            query.trim().length >= MIN_KEYWORD_LEN &&
            results.length === 0 ? (
              <Text style={styles.hint}>{emptyMessage ?? '검색 결과가 없습니다'}</Text>
            ) : null}
            <View style={{ marginTop: spacing.sm }}>
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
                    {r.roadAddress &&
                    r.jibunAddress &&
                    r.roadAddress !== r.jibunAddress ? (
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
            {(providerUnavailable || manualMode) ? (
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
                  <Text style={styles.btnText}>이 좌표로 적용</Text>
                </Pressable>
              </View>
            ) : null}
            {!manualMode &&
            !providerUnavailable &&
            !searching &&
            query.trim().length >= MIN_KEYWORD_LEN &&
            results.length === 0 ? (
              <Pressable
                onPress={() => setManualMode(true)}
                style={({ pressed }) => [styles.manualLink, pressed && styles.pressed]}
              >
                <Text style={styles.manualLinkText}>좌표 직접 입력으로 진행 →</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {fieldErrors.address ? (
          <Text style={styles.fieldError}>{fieldErrors.address}</Text>
        ) : null}

        <Text style={styles.label}>프로젝트 (선택)</Text>
        <ProjectPicker
          value={projectId}
          onChange={setProjectId}
          initialLabel={field.projectName}
          disabled={submitting}
        />

        <Text style={styles.label}>분류 (쉼표로 구분)</Text>
        <TextInput
          value={categoriesStr}
          onChangeText={(v) => {
            setCategoriesStr(v);
            if (fieldErrors.categories) clearFieldErr('categories');
          }}
          editable={!submitting}
          style={[styles.input, fieldErrors.categories && styles.inputError]}
          placeholder="예: 가로수, 보수, 긴급"
        />
        {fieldErrors.categories ? (
          <Text style={styles.fieldError}>{fieldErrors.categories}</Text>
        ) : null}

        <View style={styles.labelRow}>
          <Text style={styles.label}>상세 주소</Text>
          <Text style={styles.counter}>
            {addressDetail.length} / {DETAIL_MAX}
          </Text>
        </View>
        <TextInput
          value={addressDetail}
          onChangeText={(v) => {
            setAddressDetail(v);
            if (fieldErrors.detailAddress) clearFieldErr('detailAddress');
          }}
          editable={!submitting}
          maxLength={DETAIL_MAX}
          style={[styles.input, fieldErrors.detailAddress && styles.inputError]}
          placeholder="예: 101동 1203호"
        />
        {fieldErrors.detailAddress ? (
          <Text style={styles.fieldError}>{fieldErrors.detailAddress}</Text>
        ) : null}

        <Text style={styles.label}>상태</Text>
        <View style={styles.statusRow}>
          {FIELD_STATUS_VALUES.map((s) => {
            const active = status === s;
            const c = colors.fieldStatus[s];
            return (
              <Pressable
                key={s}
                onPress={() => {
                  setStatus(s);
                  if (fieldErrors.status) clearFieldErr('status');
                }}
                disabled={submitting}
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
        {fieldErrors.status ? (
          <Text style={styles.fieldError}>{fieldErrors.status}</Text>
        ) : null}

        {globalError ? <Text style={styles.error}>{globalError}</Text> : null}

        <Pressable
          onPress={handleSave}
          disabled={submitting || !hasChanges}
          style={({ pressed }) => [
            styles.btn,
            (!hasChanges || submitting) && styles.btnDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Text
            style={[
              styles.btnText,
              (!hasChanges || submitting) && styles.btnTextDisabled,
            ]}
          >
            {submitting ? '저장 중...' : hasChanges ? '저장' : '변경 사항 없음'}
          </Text>
        </Pressable>

        <Pressable onPress={handleCancel} style={styles.cancel}>
          <Text style={styles.cancelText}>취소</Text>
        </Pressable>

        <Pressable
          onPress={handleDelete}
          style={({ pressed }) => [styles.dangerBtn, pressed && styles.pressed]}
        >
          <Text style={styles.dangerText}>현장 삭제</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.xl },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  label: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '600',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  counter: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '600',
  },
  readonly: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  readonlyText: { fontSize: fontSize.base, color: colors.text },
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
  inputError: { borderColor: colors.danger },
  fieldError: {
    color: colors.danger,
    fontSize: fontSize.xs,
    marginTop: 4,
    marginLeft: 4,
  },
  error: { color: colors.danger, fontSize: fontSize.sm, marginTop: spacing.md },
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
  btnDisabled: { backgroundColor: colors.border },
  btnText: { color: '#fff', fontSize: fontSize.base, fontWeight: '700' },
  btnTextDisabled: { color: colors.textMuted },
  cancel: { alignItems: 'center', paddingVertical: spacing.md },
  cancelText: { color: colors.textMuted, fontSize: fontSize.sm },
  dangerBtn: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  dangerText: { color: colors.danger, fontSize: fontSize.sm, fontWeight: '700' },
  pressed: { opacity: 0.85 },
  // 주소 수정 토글·검색 관련
  addrEditBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  addrEditBtnText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '700',
  },
  readonlyChanged: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '08',
  },
  changedHint: {
    fontSize: fontSize.xs,
    color: colors.primary,
    marginTop: spacing.xs,
    fontWeight: '600',
  },
  addrSearchBox: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cancelLink: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '600',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  loadingText: { fontSize: fontSize.xs, color: colors.textMuted },
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
  hint: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.sm },
  addrItem: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  addrText: { fontSize: fontSize.base, color: colors.text, fontWeight: '600' },
  addrJibun: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  addrCoord: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  manualBox: {
    marginTop: spacing.md,
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
});
