import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
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
import { useAuthStore } from '@/stores/authStore';
import { fields as fieldsApi, errorCode, localizeError } from '@/api';
import type { AddressSearchItem } from '@/api';
import type { Field, FieldStatus } from '@/types/entities';
import { FIELD_STATUS_VALUES, FIELD_STATUS_LABEL } from '@/types/entities';
import {
  isInKorea,
  itemToSelected,
  mergeSearchItems,
  SEARCH_DEBOUNCE_MS,
  MIN_KEYWORD_LEN,
  type SelectedAddress,
} from '@/utils/addressSearch';
import { requestUserLocation } from '@/utils/geolocation';
import { ProjectPicker } from '@/components/ProjectPicker';
import { CategoryMultiPicker } from '@/components/fields/CategoryMultiPicker';
import { ManualCoordinateForm } from '@/components/fields/ManualCoordinateForm';
import { FieldPinMap, type FieldPinMapHandle } from '@/components/fields/FieldPinMap';
import { getQuickPhoto } from '@/components/fields/quickPhotoHandoff';
import { useKakaoPlaceSearch } from '@/components/fields/useKakaoPlaceSearch';
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

// 측위·검색 선택 모두 없을 때의 지도 초기 중심 — KakaoMapWebView 의 DEFAULT_CENTER 와 동일 부산 중심.
const DEFAULT_CENTER = { lat: 35.17, lng: 129.07 };

export default function NewField() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const createField = useFieldStore((s) => s.create);
  const addPhoto = useFieldStore((s) => s.addPhoto);

  // Quick Photo "이 위치에 새 현장 등록" 진입 — 촬영 좌표는 params, 사진은 토큰 매칭 핸드오프.
  // 화면 수명 동안 불변이어야 하므로 초기 1회만 파싱해 고정 (이후 params 변동 무시).
  // getQuickPhoto 는 idempotent 읽기라 StrictMode 이중 initializer 호출에도 안전.
  const params = useLocalSearchParams<{
    lat?: string;
    lng?: string;
    photoToken?: string;
  }>();
  const [entry] = useState(() => {
    const la = Number(params.lat);
    const ln = Number(params.lng);
    const pos =
      Number.isFinite(la) && Number.isFinite(ln) && isInKorea(la, ln)
        ? { lat: la, lng: ln }
        : null;
    const photo = getQuickPhoto(
      typeof params.photoToken === 'string' ? params.photoToken : undefined,
    );
    return { pos, photo };
  });
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

  // 검색창은 순수 검색용 — 현재 주소의 진실 출처는 selected(카드에 실시간 표시).
  // 결과 선택 시 query 를 비워 리스트를 닫는다 (입력창-주소 양방향 동기화로 인한 clobber 회피).
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
  // 현 위치 우선 — 진입 시 자동 측위, 실패해도 지도는 기본 중심으로 띄워 손으로 바로 지정 가능.
  const [locating, setLocating] = useState(true);
  // FieldPinMap 마운트 시 초기 역지오코딩 여부 — 현 위치 성공 시에만.
  // (기본 중심 fallback 은 임의 주소 자동 기입 금지 — 사용자가 고르지 않은 주소가 등록될 위험)
  const [resolveOnMount, setResolveOnMount] = useState(false);
  const mapRef = useRef<FieldPinMapHandle>(null);
  // 지도 조작 중 부모 ScrollView 잠금 — 안드로이드 제스처 경합 해소용.
  const [mapBusy, setMapBusy] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [detail, setDetail] = useState('');
  const [status, setStatus] = useState<FieldStatus>('pending');
  const [submitting, setSubmitting] = useState(false);

  // 장소(키워드) 검색 — 클라이언트 카카오 SDK. 백엔드 주소검색(도로명)과 병행해
  // "동아대학교" 같은 POI 도 잡는다. element 는 네이티브 헤드리스 WebView(웹은 null).
  const { search: searchPlaces, element: placeSearchBridge } = useKakaoPlaceSearch();

  // 디바운스 검색 — 키워드 변경 시 SEARCH_DEBOUNCE_MS 후 호출.
  // 호출 도중 입력이 또 바뀌면 기존 결과는 폐기 (latest-wins).
  const reqIdRef = useRef(0);
  useEffect(() => {
    const k = query.trim();
    if (k.length < MIN_KEYWORD_LEN) {
      // 진행 중이던 요청 무효화 — 타이머가 이미 발화해 fetch 가 in-flight 면 clearTimeout 으로는
      // 못 막으므로, 토큰을 올려 늦은 응답이 결과 리스트를 되살리지 못하게 한다 (선택 직후 setQuery('') 경로).
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
      // 1차: 주소(백엔드) 결과를 즉시 표시 — 장소 검색에 묶지 않는다(절대 차단 금지).
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

      // 2차: 장소(키워드) 결과가 도착하면 병합 (비차단 — 느리거나 실패해도 주소 결과엔 영향 없음).
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

  const handleSelectItem = (item: AddressSearchItem) => {
    Keyboard.dismiss();
    setSelected(itemToSelected(item));
    setQuery('');
  };

  // 현 위치 측위 → 핀 이동 + 역지오코딩.
  // auto: 진입 시 1회 자동 — 그 사이 사용자가 이미 주소를 골랐으면 폐기, 실패는 silent.
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const startFromCurrentLocation = async (auto: boolean) => {
    setLocating(true);
    // GPS cold fix·실내에서 getCurrentPositionAsync 가 무기한 대기할 수 있음 — 타임아웃으로 스피너 고정 방지.
    const pos = await Promise.race([
      requestUserLocation({ high: true }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000)),
    ]);
    setLocating(false);
    if (auto && selectedRef.current !== null) return;
    if (!pos || !isInKorea(pos.lat, pos.lng)) {
      if (!auto) {
        Alert.alert(
          '현 위치를 사용할 수 없어요',
          '위치 권한을 확인하거나, 주소로 검색해주세요.',
        );
      } else if (selectedRef.current === null) {
        // 자동 측위 실패 — 기본 중심으로 지도만 띄워 손으로 바로 지정하게. 주소 자동 기입은 하지 않는다.
        setSelected({
          roadAddress: '',
          jibunAddress: '',
          buildingName: null,
          lat: DEFAULT_CENTER.lat,
          lng: DEFAULT_CENTER.lng,
          display: '지도를 탭해 위치를 지정하거나 주소를 검색하세요',
        });
      }
      return;
    }
    // 버튼 경로만 키보드 닫기 — 자동 측위가 타이핑 중인 키보드를 닫지 않도록.
    if (!auto) Keyboard.dismiss();
    const placeholder: SelectedAddress = {
      roadAddress: '',
      jibunAddress: '',
      buildingName: null,
      lat: pos.lat,
      lng: pos.lng,
      display: '현 위치 (주소 확인 중…)',
    };
    if (selectedRef.current === null) {
      // 지도 미마운트 — 마운트 시 1회 역지오코딩 (resolveInitialAddress).
      setResolveOnMount(true);
      setSelected(placeholder);
    } else {
      // 지도 이미 표시 중 — 명령형 핸들로 핀 이동 + 재역지오코딩.
      setSelected(placeholder);
      mapRef.current?.resolveAddress(pos.lat, pos.lng);
    }
  };

  // 진입 시 1회 — 촬영 좌표가 넘어왔으면 그 좌표 직행(자동 측위 생략), 아니면 현 위치 자동 시도.
  useEffect(() => {
    if (entry.pos) {
      // 지도 마운트 시 역지오코딩으로 주소를 채운다 (현 위치 직행과 동일 패턴).
      setResolveOnMount(true);
      setLocating(false);
      setSelected({
        roadAddress: '',
        jibunAddress: '',
        buildingName: null,
        lat: entry.pos.lat,
        lng: entry.pos.lng,
        display: '촬영 위치 (주소 확인 중…)',
      });
      return;
    }
    void startFromCurrentLocation(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 생성 성공 공통 후처리 — Quick Photo 에서 넘어온 사진이 있으면 새 현장에 첨부 후 상세로 이동.
  const finishCreate = async (field: Field) => {
    if (entry.photo) {
      const res = await addPhoto(field.id, entry.photo);
      if (!res.ok) {
        // 현장 생성은 이미 성공 — 사진만 실패. 상세 화면에서 재시도 가능하므로 이동은 계속한다.
        Alert.alert(
          '사진 등록 실패',
          `현장은 등록됐지만 사진 업로드에 실패했어요. 현장 상세에서 다시 등록해주세요.\n(${res.error})`,
        );
      }
    }
    router.replace(`/(tabs)/fields/${field.id}` as never);
  };

  const handleCreate = async () => {
    if (!user || !selected) return;
    // 역지오코딩이 아직(또는 끝내) 주소를 못 채운 경우 — 빈 주소 등록 차단.
    if (!selected.roadAddress.trim() && !selected.jibunAddress.trim()) {
      Alert.alert(
        '주소 확인 필요',
        '아직 주소를 확인하지 못했어요. 지도의 핀을 살짝 옮겨 주소를 다시 받아오거나, 주소를 검색해주세요.',
      );
      return;
    }
    const baseBody = {
      name: selected.display,
      status,
      // 산지 등 도로명 미부여 지점의 역지오코딩은 지번만 올 수 있음 — ManualCoordinateForm 과 동일 fallback.
      roadAddress: selected.roadAddress || selected.jibunAddress,
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

    if (result.ok) {
      // 사진 첨부까지 끝날 때까지 submitting 유지 — 버튼 재탭(중복 생성) 차단.
      // finally: addPhoto 가 향후 reject 하게 바뀌어도 버튼이 영구 로딩에 잠기지 않게.
      try {
        await finishCreate(result.field);
      } finally {
        setSubmitting(false);
      }
      return;
    }
    setSubmitting(false);

    if ('needsConfirm' in result) {
      // Phase 7 duplicate_address_warning_required — confirm 후 forceCreateWithDuplicate 로 재호출
      const proceed = (yes: boolean) => {
        if (!yes) return;
        void (async () => {
          setSubmitting(true);
          const forced = await createField({ ...baseBody, forceCreateWithDuplicate: true });
          if (forced.ok) {
            try {
              await finishCreate(forced.field);
            } finally {
              setSubmitting(false);
            }
            return;
          }
          setSubmitting(false);
          if (!('needsConfirm' in forced)) {
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
      {placeSearchBridge}
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!mapBusy}
      >
        <Text variant="h3" style={styles.title}>
          현장 등록
        </Text>

        {/* Quick Photo 이관 사진 — 등록 완료 시 자동 첨부됨을 미리 안내 */}
        {entry.photo ? (
          <Card padding="md" style={styles.photoBox}>
            <Image source={{ uri: entry.photo.uri }} style={styles.photoThumb} />
            <Text variant="bodySm" color="textMuted" style={styles.photoText}>
              현장 등록을 마치면 촬영한 사진이 이 현장에 함께 등록돼요
            </Text>
          </Card>
        ) : null}

        {/* 검색·현위치·지도 단일 화면 — 주소 재검색과 핀 이동이 서로를 실시간 갱신 */}
        <Input
          label="주소 · 건물명 · 장소명 검색"
          value={query}
          onChangeText={setQuery}
          placeholder="예: 동아대학교, 해운대 우동, 동성로"
          autoCapitalize="none"
          returnKeyType="search"
        />

        {locating ? (
          <View style={styles.loadingRow}>
            <LoadingState inline label="현 위치 확인 중" />
          </View>
        ) : (
          <Button
            onPress={() => void startFromCurrentLocation(false)}
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
              setManualMode(false);
              setQuery('');
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

        {selected ? (
          <>
            <Card padding="md" style={styles.selectedBox}>
              <Text variant="caption" weight="bold" color="primary">
                현장 주소
              </Text>
              <Text variant="body" weight="semibold" style={styles.selectedAddr}>
                {selected.display}
              </Text>
              <Text variant="caption" color="textMuted" style={styles.selectedCoord}>
                {selected.lat.toFixed(6)}, {selected.lng.toFixed(6)}
              </Text>
            </Card>

            <Text variant="caption" color="textMuted" style={styles.pinHint}>
              지도를 탭하거나 핀을 드래그해 위치를 잡으면 주소도 자동으로 갱신돼요
            </Text>
            <FieldPinMap
              ref={mapRef}
              // 지도에 손이 닿아 있는 동안 화면 스크롤을 끈다 — 안드로이드에서 부모
              // ScrollView 가 지도 드래그를 가로채던 문제(FieldPinMap 주석 참고).
              onInteractionChange={setMapBusy}
              lat={selected.lat}
              lng={selected.lng}
              // 현 위치 직행 마운트에서만 초기 역지오코딩 (마운트 시점 값만 사용).
              resolveInitialAddress={resolveOnMount}
              onDragEnd={(la, ln, addr) =>
                setSelected((prev) => {
                  if (!prev) return prev;
                  const next = { ...prev, lat: la, lng: ln };
                  // 역지오코딩이 도착하면 주소 필드도 좌표에 맞춰 갱신 (좌표↔주소 불일치 방지).
                  if (addr) {
                    next.roadAddress = addr.roadAddress;
                    next.jibunAddress = addr.jibunAddress;
                    next.buildingName = addr.buildingName;
                    next.sido = addr.sido;
                    next.sigungu = addr.sigungu;
                    next.display = addr.display;
                  }
                  return next;
                })
              }
            />
          </>
        ) : null}

        <Text variant="bodySm" weight="semibold" color="textMuted" style={styles.label}>
          프로젝트 (선택)
        </Text>
        <ProjectPicker value={projectId} onChange={setProjectId} />

        <Text variant="bodySm" weight="semibold" color="textMuted" style={styles.label}>
          분류 (선택)
        </Text>
        <CategoryMultiPicker
          value={categories}
          onChange={setCategories}
          disabled={submitting}
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
          disabled={!selected}
          size="lg"
          fullWidth
          leftIcon="checkmark"
          style={styles.submit}
        >
          현장 등록
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl * 2 },
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
  warnBody: { marginTop: spacing.xs },
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
  locateBtn: { marginTop: spacing.sm, alignSelf: 'flex-start' },
  photoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
  },
  photoThumb: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  photoText: { flex: 1 },
  selectedBox: {
    backgroundColor: colors.primaryMuted,
    marginTop: spacing.md,
  },
  selectedAddr: { marginTop: 2 },
  selectedCoord: { marginTop: 4 },
  pinHint: { marginTop: spacing.xs, marginBottom: spacing.xs },
  statusRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  submit: { marginTop: spacing.xl },
});
