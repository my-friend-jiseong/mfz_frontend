import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFieldStore } from '@/stores/fieldStore';
import { useVisitStore } from '@/stores/visitStore';
import { safeBack } from '@/utils/backNavigation';
import {
  FIELD_STATUS_VALUES,
  FIELD_STATUS_LABEL,
  type FieldStatus,
} from '@/types/entities';
import { fields as fieldsApi, errorCode, localizeError } from '@/api';
import type { AddressSearchItem, UpdateFieldBody } from '@/api';
import {
  isInKorea,
  itemToSelected,
  mergeSearchItems,
  SEARCH_DEBOUNCE_MS,
  MIN_KEYWORD_LEN,
  type SelectedAddress,
} from '@/utils/addressSearch';
import { requestUserLocation } from '@/utils/geolocation';
import { ManualCoordinateForm } from '@/components/fields/ManualCoordinateForm';
import { FieldPinMap, type FieldPinMapHandle } from '@/components/fields/FieldPinMap';
import { useKakaoPlaceSearch } from '@/components/fields/useKakaoPlaceSearch';
import { EmptyState } from '@/components/EmptyState';
import { ProjectPicker } from '@/components/ProjectPicker';
import { CategoryMultiPicker } from '@/components/fields/CategoryMultiPicker';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/LoadingState';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { opacity } from '@/theme/motion';
import { FilterChip } from '@/components/ui/FilterChip';
import { SafeScreen } from '@/components/SafeScreen';

const DETAIL_MAX = 100;

// 카테고리 배열 동일성 키 — 순서 무관 비교(변경 감지·PATCH 판정용).
const catKey = (a: readonly string[]) => JSON.stringify([...a].sort()); //');

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
  const loadFieldDetail = useFieldStore((s) => s.loadDetail);
  const update = useFieldStore((s) => s.update);
  const remove = useFieldStore((s) => s.remove);
  // 방문 이력 카운트 — 삭제 사전 안내용. 단일 actor 정책상 visit 있으면 백엔드가 삭제 거부.
  // 진입 시 fieldStore.loadDetail → visitStore.syncFromRecentVisits 로 hydrate.
  const visitCount = useVisitStore(
    (s) => s.visits.filter((v) => v.fieldId === fieldId).length,
  );
  const fetchedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!fieldId) return;
    if (fetchedRef.current === fieldId) return;
    fetchedRef.current = fieldId;
    void loadFieldDetail(fieldId);
  }, [fieldId, loadFieldDetail]);

  // Hooks must be called unconditionally — early return 후로 옮기지 않고 옵셔널 처리.
  const initial = useMemo(
    () => ({
      addressDetail: field?.addressDetail ?? '',
      status: field?.status ?? ('pending' as FieldStatus),
      categories: field?.categories ?? [],
      projectId: field?.projectId ?? null,
    }),
    [field?.addressDetail, field?.status, field?.categories, field?.projectId],
  );
  const initialRef = useRef(initial);

  const [addressDetail, setAddressDetail] = useState(initial.addressDetail);
  const [status, setStatus] = useState<FieldStatus>(initial.status);
  const [categories, setCategories] = useState<string[]>(initial.categories);
  const [projectId, setProjectId] = useState<string | null>(initial.projectId);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const clearFieldErr = (k: keyof FieldErrors) =>
    setFieldErrors((p) => ({ ...p, [k]: undefined }));

  // 주소 수정 — new.tsx 와 동일한 단일 화면: 검색창 상시 노출 + 핀 지도 실시간 연동.
  // newAddress 가 null 이 아니면 변경 예정 (저장 시 PATCH 에 포함), 되돌리기로 원복.
  const [newAddress, setNewAddress] = useState<SelectedAddress | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AddressSearchItem[]>([]);
  const [emptyMessage, setEmptyMessage] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [providerUnavailable, setProviderUnavailable] = useState(false);
  const [searching, setSearching] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  // 현 위치로 이동 — 수정 화면은 기존 주소가 출발점이므로 자동 측위는 하지 않고 버튼만.
  const [locating, setLocating] = useState(false);
  const mapRef = useRef<FieldPinMapHandle>(null);

  // 장소(키워드) 검색 — new.tsx 와 동일하게 백엔드 주소검색(도로명)과 병행해 POI 도 잡는다.
  const { search: searchPlaces, element: placeSearchBridge } = useKakaoPlaceSearch();

  // 디바운스 검색 — fields/new.tsx 와 동일한 패턴 (latest-wins, 2단계 병합).
  const reqIdRef = useRef(0);
  useEffect(() => {
    const k = query.trim();
    if (k.length < MIN_KEYWORD_LEN) {
      // 진행 중이던 요청 무효화 — in-flight 응답이 결과 리스트를 되살리지 못하게 (선택 직후 setQuery('') 경로).
      reqIdRef.current++;
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
      // 1차: 주소(백엔드) 결과를 즉시 표시 — 장소 검색에 묶지 않는다.
      let addrItems: AddressSearchItem[] = [];
      let emptyMsg: string | null = null;
      let providerDown = false;
      let errMsg: string | null = null;
      try {
        const res = await fieldsApi.addressSearch(k);
        addrItems = res.items;
        emptyMsg = res.emptyMessage ?? null;
      } catch (e) {
        if (errorCode(e) === 'kakao_provider_unavailable') providerDown = true;
        else errMsg = localizeError(e);
      }
      if (myReqId !== reqIdRef.current) return;
      setResults(addrItems);
      setEmptyMessage(addrItems.length === 0 ? emptyMsg : null);
      setProviderUnavailable(providerDown && addrItems.length === 0);
      setSearchError(errMsg && addrItems.length === 0 ? errMsg : null);
      setSearching(false);

      // 2차: 장소(키워드) 결과 병합 (비차단).
      searchPlaces(k)
        .then((placeItems) => {
          if (myReqId !== reqIdRef.current || placeItems.length === 0) return;
          const merged = mergeSearchItems(addrItems, placeItems);
          setResults(merged);
          setEmptyMessage(null);
          setProviderUnavailable(false);
          setSearchError(null);
        })
        .catch(() => {});
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query, retryToken, searchPlaces]);

  // 기존 현장 주소를 SelectedAddress 로 — 핀 드래그/현 위치의 병합 베이스.
  const fieldAsSelected = (): SelectedAddress => ({
    roadAddress: field?.address ?? '',
    jibunAddress: '',
    buildingName: null,
    lat: field?.latitude ?? 0,
    lng: field?.longitude ?? 0,
    display: field?.address ?? '',
  });

  const handleSelectItem = (item: AddressSearchItem) => {
    Keyboard.dismiss();
    setNewAddress(itemToSelected(item));
    setQuery('');
    if (fieldErrors.address) clearFieldErr('address');
  };

  const handleRevertAddress = () => {
    setNewAddress(null);
    if (fieldErrors.address) clearFieldErr('address');
  };

  // 현 위치로 핀 이동 + 역지오코딩 (버튼 전용 — 자동 측위 없음).
  const startFromCurrentLocation = async () => {
    setLocating(true);
    // GPS cold fix·실내 무기한 대기 방지 — new.tsx 와 동일 타임아웃.
    const pos = await Promise.race([
      requestUserLocation({ high: true }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000)),
    ]);
    setLocating(false);
    if (!pos || !isInKorea(pos.lat, pos.lng)) {
      Alert.alert(
        '현 위치를 사용할 수 없어요',
        '위치 권한을 확인하거나, 주소로 검색해주세요.',
      );
      return;
    }
    Keyboard.dismiss();
    // 주소는 역지오코딩 도착 시 갱신 — 그때까지 placeholder. 빈 주소 저장은 handleSave 가드가 차단.
    setNewAddress({
      roadAddress: '',
      jibunAddress: '',
      buildingName: null,
      lat: pos.lat,
      lng: pos.lng,
      display: '현 위치 (주소 확인 중…)',
    });
    mapRef.current?.resolveAddress(pos.lat, pos.lng);
    if (fieldErrors.address) clearFieldErr('address');
  };

  if (!field) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="search-outline"
          title="현장을 찾을 수 없습니다"
          action={
            <Button
              onPress={() => router.replace('/(tabs)/fields' as never)}
              variant="secondary"
              leftIcon="arrow-back"
            >
              현장 목록으로
            </Button>
          }
        />
      </View>
    );
  }

  const detailTrim = addressDetail.trim();
  const categoriesChanged =
    catKey(categories) !== catKey(initialRef.current.categories);
  const hasChanges =
    detailTrim !== initialRef.current.addressDetail.trim() ||
    status !== initialRef.current.status ||
    categoriesChanged ||
    projectId !== initialRef.current.projectId ||
    newAddress !== null;

  const handleSave = async () => {
    setGlobalError(null);
    const errs: FieldErrors = {};
    if (detailTrim.length > DETAIL_MAX)
      errs.detailAddress = `상세 주소는 ${DETAIL_MAX}자 이하여야 합니다`;
    // 현 위치 플로우에서 역지오코딩이 아직 주소를 못 채운 경우 — 빈 주소 PATCH 차단.
    if (
      newAddress &&
      !newAddress.roadAddress.trim() &&
      !newAddress.jibunAddress.trim()
    ) {
      errs.address =
        '아직 주소를 확인하지 못했어요. 지도의 핀을 살짝 옮겨 주소를 다시 받아오거나, 주소를 검색해주세요.';
    }
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);

    // 변경된 항목만 호출 — 빈 PATCH 방지.
    const detailChanged = detailTrim !== initialRef.current.addressDetail.trim();
    const statusChanged = status !== initialRef.current.status;
    const projectIdChanged = projectId !== initialRef.current.projectId;
    const addressChanged = newAddress !== null;

    if (detailChanged || categoriesChanged || projectIdChanged || addressChanged) {
      const body: UpdateFieldBody = {};
      if (detailChanged) body.detailAddress = detailTrim;
      if (categoriesChanged) body.categories = categories;
      if (projectIdChanged) body.projectId = projectId;
      if (addressChanged && newAddress) {
        // 도로명 미부여 지점의 역지오코딩은 지번만 올 수 있음 — new.tsx 와 동일 fallback.
        body.roadAddress = newAddress.roadAddress || newAddress.jibunAddress;
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
    // 방문 이력 있으면 백엔드가 차단함을 미리 안내 — anti-pattern '정말 삭제할까요 → 사실은 삭제 못 함' 해소.
    // Alert.alert 는 webAlertPatch 가 web 에서 window.alert/confirm 으로 자동 라우팅.
    if (visitCount > 0) {
      Alert.alert(
        '삭제할 수 없습니다',
        `이 현장에는 방문 기록이 ${visitCount}건 있어 삭제할 수 없습니다.\n\n방문 기록을 정리하거나 현장 상태를 '조치 완료' 로 변경해주세요.`,
      );
      return;
    }
    Alert.alert(
      '현장 삭제',
      '이 현장을 삭제할까요? 메모·사진도 함께 정리됩니다.',
      [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: () => void performDelete() },
      ],
    );
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

  const noResults =
    !searching &&
    !providerUnavailable &&
    !searchError &&
    query.trim().length >= MIN_KEYWORD_LEN &&
    results.length === 0;

  // 핀 지도 기준 좌표 — 변경 예정이 있으면 그쪽, 없으면 기존 현장 좌표.
  const pinLat = newAddress ? newAddress.lat : field.latitude;
  const pinLng = newAddress ? newAddress.lng : field.longitude;

  return (
    <SafeScreen>
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {placeSearchBridge}
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* 검색·현위치·지도 단일 화면 — new.tsx 와 동일 패턴, 주소 재검색과 핀 이동이 실시간 연동 */}
        <Input
          label="주소 · 건물명 · 장소명 검색"
          value={query}
          onChangeText={setQuery}
          placeholder="예: 동아대학교, 해운대 우동, 동성로"
          autoCapitalize="none"
          returnKeyType="search"
          editable={!submitting}
        />

        {locating ? (
          <View style={styles.loadingRow}>
            <LoadingState inline label="현 위치 확인 중" />
          </View>
        ) : (
          <Button
            onPress={() => void startFromCurrentLocation()}
            disabled={submitting}
            variant="secondary"
            size="sm"
            leftIcon="locate"
            style={styles.locateBtn}
          >
            현 위치로 이동
          </Button>
        )}

        {searching ? (
          <View style={styles.loadingRow}>
            <LoadingState inline label="검색 중" />
          </View>
        ) : null}

        {searchError ? (
          <Text variant="caption" color="danger" style={styles.fieldError}>
            {searchError}
          </Text>
        ) : null}

        {providerUnavailable ? (
          <Card padding="md" style={styles.warnBox}>
            <Text variant="bodySm" weight="bold">주소 검색 일시 장애</Text>
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

        {noResults ? (
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
                {r.roadAddress &&
                r.jibunAddress &&
                r.roadAddress !== r.jibunAddress ? (
                  <Text variant="caption" color="textMuted" style={styles.addrJibun}>지번: {r.jibunAddress}</Text>
                ) : null}
                <Text variant="caption" color="textMuted" style={styles.addrCoord}>
                  {sub ? `${sub} · ` : ''}
                  {r.lat.toFixed(4)}, {r.lng.toFixed(4)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {providerUnavailable || manualMode ? (
          <ManualCoordinateForm
            onResolve={(addr) => {
              setNewAddress(addr);
              setManualMode(false);
              setQuery('');
              if (fieldErrors.address) clearFieldErr('address');
            }}
          />
        ) : null}
        {noResults && !manualMode ? (
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

        <View style={styles.labelRow}>
          <Text variant="bodySm" weight="semibold" color="textMuted" style={styles.label}>주소</Text>
          {newAddress ? (
            <Button
              onPress={handleRevertAddress}
              disabled={submitting}
              variant="ghost"
              size="sm"
              leftIcon="arrow-undo"
            >
              되돌리기
            </Button>
          ) : null}
        </View>
        <Card
          padding="md"
          style={[styles.readonly, newAddress ? styles.readonlyChanged : undefined]}
        >
          <Text variant="body">
            {newAddress ? newAddress.display : field.address}
          </Text>
          {newAddress ? (
            <Text variant="caption" weight="semibold" color="primary" style={styles.changedHint}>
              변경 예정 — 저장 시 적용 (좌표 {newAddress.lat.toFixed(4)},{' '}
              {newAddress.lng.toFixed(4)})
            </Text>
          ) : null}
        </Card>
        {fieldErrors.address ? (
          <Text variant="caption" color="danger" style={styles.fieldError}>{fieldErrors.address}</Text>
        ) : null}

        <Text variant="caption" color="textMuted" style={styles.pinHint}>
          지도를 탭하거나 핀을 드래그해 위치를 잡으면 주소도 자동으로 갱신돼요
        </Text>
        <FieldPinMap
          ref={mapRef}
          lat={pinLat}
          lng={pinLng}
          onDragEnd={(la, ln, addr) => {
            setNewAddress((prev) => {
              // 첫 이동이면 기존 현장 주소를 베이스로 — 역지오코딩 도착 전까지 표시 유지.
              const base = prev ?? fieldAsSelected();
              const next = { ...base, lat: la, lng: ln };
              if (addr) {
                next.roadAddress = addr.roadAddress;
                next.jibunAddress = addr.jibunAddress;
                next.buildingName = addr.buildingName;
                next.sido = addr.sido;
                next.sigungu = addr.sigungu;
                next.display = addr.display;
              }
              return next;
            });
            if (fieldErrors.address) clearFieldErr('address');
          }}
        />

        <Text variant="bodySm" weight="semibold" color="textMuted" style={styles.label}>프로젝트 (선택)</Text>
        <ProjectPicker
          value={projectId}
          onChange={setProjectId}
          initialLabel={field.projectName}
          disabled={submitting}
        />

        <Text variant="bodySm" weight="semibold" color="textMuted" style={styles.label}>분류 (선택)</Text>
        <CategoryMultiPicker
          value={categories}
          onChange={setCategories}
          disabled={submitting}
        />

        <View style={styles.labelRow}>
          <Text variant="bodySm" weight="semibold" color="textMuted" style={styles.label}>상세 주소</Text>
          <Text variant="caption" weight="semibold" color="textMuted">
            {addressDetail.length} / {DETAIL_MAX}
          </Text>
        </View>
        <Input
          value={addressDetail}
          onChangeText={(v) => {
            setAddressDetail(v);
            if (fieldErrors.detailAddress) clearFieldErr('detailAddress');
          }}
          editable={!submitting}
          maxLength={DETAIL_MAX}
          placeholder="예: 101동 1203호"
          error={fieldErrors.detailAddress}
        />

        <Text variant="bodySm" weight="semibold" color="textMuted" style={styles.label}>상태</Text>
        <View style={styles.statusRow}>
          {FIELD_STATUS_VALUES.map((s) => (
            <FilterChip
              key={s}
              label={FIELD_STATUS_LABEL[s]}
              active={status === s}
              activeColor={colors.fieldStatus[s]}
              disabled={submitting}
              onPress={() => {
                setStatus(s);
                if (fieldErrors.status) clearFieldErr('status');
              }}
            />
          ))}
        </View>
        {fieldErrors.status ? (
          <Text variant="caption" color="danger" style={styles.fieldError}>{fieldErrors.status}</Text>
        ) : null}

        {globalError ? <Text variant="bodySm" color="danger" style={styles.error}>{globalError}</Text> : null}

        <Button
          onPress={handleSave}
          disabled={!hasChanges}
          loading={submitting}
          size="lg"
          fullWidth
          leftIcon="save"
          style={styles.submit}
        >
          {hasChanges ? '저장' : '변경 사항 없음'}
        </Button>

        <Button onPress={handleCancel} variant="ghost" size="sm" fullWidth>
          취소
        </Button>

        {/* 위험 구역 — 파괴적 삭제는 저장 동선과 분리(구분선) + 낮은 비중(dangerGhost). trips edit 와 동일. */}
        <View style={styles.dangerZone}>
          <Button
            onPress={handleDelete}
            variant="dangerGhost"
            size="sm"
            fullWidth
            leftIcon="trash"
            style={styles.dangerBtn}
          >
            현장 삭제
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl * 2 },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  label: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  fieldGap: { marginTop: spacing.sm },
  readonly: {
    backgroundColor: colors.surfaceMuted,
  },
  readonlyChanged: {
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  changedHint: { marginTop: spacing.xs },
  fieldError: { marginTop: 4, marginLeft: 4 },
  error: { marginTop: spacing.md },
  statusRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  submit: { marginTop: spacing.xl },
  dangerZone: {
    marginTop: spacing.xxl,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
  },
  dangerBtn: { marginTop: spacing.xs },
  // 주소 검색·현위치·지도
  locateBtn: { marginTop: spacing.sm, alignSelf: 'flex-start' },
  loadingRow: {
    marginTop: spacing.sm,
  },
  warnBox: {
    backgroundColor: colors.warningMuted,
    borderWidth: 1,
    borderColor: colors.warning,
    marginTop: spacing.sm,
  },
  warnBody: { marginTop: 4 },
  retryBtn: { marginTop: spacing.sm, alignSelf: 'flex-start' },
  hint: { marginTop: spacing.sm },
  resultList: { marginTop: spacing.sm },
  addrItem: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  addrJibun: { marginTop: 2 },
  addrCoord: { marginTop: 2 },
  manualLink: { marginTop: spacing.md, alignSelf: 'flex-start' },
  pinHint: { marginTop: spacing.sm, marginBottom: spacing.xs },
});
