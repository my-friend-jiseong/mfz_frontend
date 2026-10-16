import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FieldPinMap, type FieldPinMapHandle } from '@/components/fields/FieldPinMap';
import { CategoryChips } from '@/components/fields/CategoryChips';
import { AddressSearchSheet } from '@/components/fields/AddressSearchSheet';
import { useKakaoPlaceSearch } from '@/components/fields/useKakaoPlaceSearch';
import { reconcileCategories, waitForCategoryCascade } from '@/utils/categoryCascade';
import { TextField2, FieldMessage } from '@/components/ui/FormField2';
import { KeyboardAvoid } from '@/components/ui/KeyboardAvoid';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { Button2 } from '@/components/ui/Button2';
import { MapButton } from '@/components/ui/MapButton';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { notice } from '@/components/ui/ConfirmDialog';
import { Icon } from '@/components/icons';
import { useFieldStore } from '@/stores/fieldStore';
import { useFieldDraftStore } from '@/stores/fieldDraftStore';
import type { UpdateFieldBody } from '@/api';
import type { MapPinKind } from '@/components/KakaoMapWebView';
import { fieldActionStatus } from '@/utils/fieldStatus';
import { regionOf, shortJibun, stripRegion } from '@/utils/addressFormat';
import { isInKorea } from '@/utils/addressSearch';
import { requestUserLocation } from '@/utils/geolocation';
import { safeBack } from '@/utils/backNavigation';
import { c2, radius2, space } from '@/theme/v2';

const NAME_MAX = 100;
const DETAIL_MAX = 100;
// 위치 보정 지도 높이(Figma 556:2612).
const MAP_H = 236;

interface Addr {
  road: string;
  jibun: string;
  sido?: string;
  sigungu?: string;
  lat: number;
  lng: number;
}

const sameKey = (list: string[]) => [...list].sort().join('\u0001');

// 고칠 대상 — 저장된 현장, 또는 아직 서버에 없는 새 현장 입력값(8-3 [위치 보정], fieldDraftStore).
interface Source {
  key: string;
  name: string;
  address: string;
  jibun: string;
  addressDetail: string;
  categories: string[];
  latitude: number;
  longitude: number;
  pinKind: MapPinKind;
}

/**
 * 5-5 현장 정보 수정(Figma 556:2603). X 로 닫는 모달(탭 바를 가림). 위치 보정 지도(가운데 고정 핀) · 현장명 · 주소 · 상세 주소 · 분류.
 * 현장명은 비워도 저장한다 — 비우면 주소가 이름이 된다(인수인계 2026-10-15). 프로젝트는 5-3 이 맡는다.
 * 8-3 새 현장 체크인의 [위치 보정]도 이 모달을 연다(?draft=키). 그때는 서버에 쓰지 않고 입력값만 고쳐 돌려준다 —
 * 현장은 체크인 [새 현장으로 저장]에서 만든다.
 */
export default function FieldEditModal() {
  const { id, draft: draftKey } = useLocalSearchParams<{ id?: string; draft?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const savedField = useFieldStore((s) => (id ? s.fields.find((f) => f.id === id) : undefined));
  const draft = useFieldDraftStore((s) => (draftKey ? s.drafts[draftKey] : undefined));
  const field = useMemo<Source | undefined>(() => {
    if (savedField) {
      return {
        key: savedField.id,
        // 이름이 주소와 같으면(예전 앱이 주소를 이름으로 저장) 빈 칸으로 보인다 — 비어 있으면 주소가 이름.
        name: savedField.name?.trim() && savedField.name.trim() !== savedField.address ? savedField.name.trim() : '',
        address: savedField.address,
        jibun: '',
        addressDetail: savedField.addressDetail ?? '',
        categories: savedField.categories ?? [],
        latitude: savedField.latitude,
        longitude: savedField.longitude,
        pinKind: fieldActionStatus(savedField),
      };
    }
    if (draft && draftKey) {
      return {
        key: `draft:${draftKey}`,
        name: draft.name,
        address: draft.road || draft.jibun,
        jibun: draft.jibun,
        addressDetail: draft.detail,
        categories: draft.categories,
        latitude: draft.lat,
        longitude: draft.lng,
        pinKind: 'new',
      };
    }
    return undefined;
  }, [savedField, draft, draftKey]);

  useEffect(() => {
    if (id && !useFieldStore.getState().fields.some((f) => f.id === id)) void useFieldStore.getState().loadDetail(id);
  }, [id]);
  // 새 현장 입력값은 저장 시점의 원래 값과 비교하지 않는다 — 처음 값을 한 번 잡아 둔다.
  const draftAtOpen = useRef(draft);

  // 처음 값 — 현장이 늦게 도착해도(웹 새로고침) 한 번만 맞춘다.
  const initial = useMemo(
    () =>
      field
        ? {
            name: field.name,
            detail: field.addressDetail,
            categories: field.categories,
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [field?.key],
  );
  const [name, setName] = useState('');
  const [detail, setDetail] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [addr, setAddr] = useState<Addr | null>(null);
  const [moved, setMoved] = useState(false);
  const hydrated = useRef<string | null>(null);
  useEffect(() => {
    if (!field || !initial || hydrated.current === field.key) return;
    hydrated.current = field.key;
    setName(initial.name);
    setDetail(initial.detail);
    setCategories(initial.categories);
    const d = draftAtOpen.current;
    setAddr(
      d && !savedField
        ? { road: d.road, jibun: d.jibun, sido: d.sido, sigungu: d.sigungu, lat: d.lat, lng: d.lng }
        : { road: field.address, jibun: field.jibun, lat: field.latitude, lng: field.longitude },
    );
  }, [field, initial]);

  const mapRef = useRef<FieldPinMapHandle>(null);
  // 분류 선택을 마지막으로 고친 때 — 저장할 때 그 뒤에 끝난 이름 변경·삭제만 맞춘다(categoryCascade.reconcileCategories).
  const categoriesAt = useRef(Date.now());
  // 저장 중에는 닫지 못한다(X·안드로이드 뒤로) — 반만 저장된 채 떠나지 않게. 떠난 뒤엔 이동하지 않는다.
  const savingRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );
  const navigation = useNavigation();
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (savingRef.current) e.preventDefault();
      }),
    [navigation],
  );
  // 지도를 만지는 동안 바깥 스크롤을 잠근다 — 안드로이드는 ScrollView 가 지도 끌기를 가로챈다(FieldPinMap 주석).
  const [mapBusy, setMapBusy] = useState(false);
  const { search: searchPlaces, reverse, element: placeBridge } = useKakaoPlaceSearch();
  const [searchOpen, setSearchOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!field || !addr || !initial) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Header onClose={() => safeBack(router)} />
      </View>
    );
  }

  const close = () => {
    if (savingRef.current) return;
    safeBack(router);
  };
  // 저장이 끝나 떠날 때 — 막는 표시를 먼저 풀고, 이미 떠난 화면이면 아무것도 하지 않는다.
  const leave = () => {
    savingRef.current = false;
    if (mountedRef.current) safeBack(router);
  };
  const fail = (msg: string) => {
    savingRef.current = false;
    if (!mountedRef.current) return;
    setSaving(false);
    setError(msg);
  };

  // 지도를 끌어 놓은 자리(가운데 핀). 주소는 역지오코딩이 끝나면 따라온다.
  const onPinMove = (lat: number, lng: number, a?: { roadAddress: string; jibunAddress: string; sido?: string; sigungu?: string }) => {
    const isOrigin = Math.abs(lat - field.latitude) < 1e-9 && Math.abs(lng - field.longitude) < 1e-9;
    if (isOrigin && !moved) {
      // 처음 위치의 지번만 채운다(바뀐 것이 아니다).
      if (a) setAddr((cur) => (cur ? { ...cur, jibun: a.jibunAddress } : cur));
      return;
    }
    setMoved(true);
    setError(null);
    setAddr((cur) => ({
      road: a ? a.roadAddress : (cur?.road ?? ''),
      jibun: a ? a.jibunAddress : (cur?.jibun ?? ''),
      sido: a?.sido ?? cur?.sido,
      sigungu: a?.sigungu ?? cur?.sigungu,
      lat,
      lng,
    }));
  };

  const locate = async () => {
    const pos = await requestUserLocation({ high: true });
    if (!pos || !isInKorea(pos.lat, pos.lng)) {
      await notice('현 위치를 쓸 수 없어요', '위치 권한을 확인하거나 주소로 검색해 주세요.');
      return;
    }
    mapRef.current?.resolveAddress(pos.lat, pos.lng);
    setMoved(true);
    setAddr((cur) => (cur ? { ...cur, road: '', jibun: '', lat: pos.lat, lng: pos.lng } : cur));
  };

  const nameTrim = name.trim();
  const detailTrim = detail.trim();
  const save = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    // 분류 시트에서 시작한 이름 변경·삭제가 끝난 뒤 저장한다 — 안 그러면 옛 이름으로 덮어쓴다.
    await waitForCategoryCascade();
    const cats = reconcileCategories(categories, categoriesAt.current);
    // 새 현장(8-3) — 입력값만 돌려준다. 시·도·시·군·구는 [새 현장으로 저장]이 채운다(createFieldFromPlace).
    if (!savedField && draftKey) {
      useFieldDraftStore.getState().patch(draftKey, {
        name: nameTrim,
        detail: detailTrim,
        categories: cats,
        categoriesAt: categoriesAt.current,
        ...(moved
          ? { road: addr.road, jibun: addr.jibun, sido: addr.sido, sigungu: addr.sigungu, lat: addr.lat, lng: addr.lng, moved: true }
          : {}),
      });
      leave();
      return;
    }
    if (!savedField) {
      fail('현장을 찾을 수 없어요.');
      return;
    }
    // 비교는 지금 저장된 값과 — 반영 작업이 이 현장의 분류를 이미 바꿨을 수 있다.
    const savedCats = useFieldStore.getState().fields.find((f) => f.id === savedField.id)?.categories ?? initial.categories;
    const body: UpdateFieldBody = {};
    if (nameTrim !== initial.name) body.name = nameTrim;
    if (detailTrim !== initial.detail.trim()) body.detailAddress = detailTrim;
    if (sameKey(cats) !== sameKey(savedCats)) body.categories = cats;
    if (moved) {
      let a = addr;
      // 장소 검색으로 고른 곳은 시·도·시·군·구가 비어 온다 — 좌표로 채우고, 안 되면 주소 글에서 읽는다.
      if (!a.sido || !a.sigungu || !(a.road || a.jibun)) {
        const r = await reverse(a.lat, a.lng);
        if (r) a = { ...a, road: a.road || r.roadAddress, jibun: a.jibun || r.jibunAddress, sido: a.sido || r.sido, sigungu: a.sigungu || r.sigungu };
      }
      const road = a.road || a.jibun;
      if (!road) {
        fail('주소를 아직 확인하지 못했어요. 지도를 조금 움직이거나 주소로 검색해 주세요.');
        return;
      }
      if (!a.sido || !a.sigungu) {
        const parsed = regionOf(road);
        a = { ...a, sido: a.sido || parsed.sido, sigungu: a.sigungu || parsed.sigungu };
      }
      // 옛 시·군·구가 새 주소와 함께 남지 않게, 모르면 저장하지 않는다.
      if (!a.sido || !a.sigungu) {
        fail('주소의 시·군·구를 확인하지 못했어요. 주소로 다시 검색해 주세요.');
        return;
      }
      body.roadAddress = road;
      if (a.jibun) body.jibunAddress = a.jibun;
      body.lat = a.lat;
      body.lng = a.lng;
      body.sido = a.sido;
      body.sigungu = a.sigungu;
    }
    if (Object.keys(body).length === 0) {
      leave();
      return;
    }
    const r = await useFieldStore.getState().update(savedField.id, body);
    if (!r.ok) {
      fail(r.error);
      return;
    }
    // 이름을 비우면 서버가 주소를 이름으로 저장한다(2026-10-17 실측) — 화면은 '이름 = 주소'를 빈 이름으로 본다.
    leave();
  };

  // 분류 시트 부제 — 현장명이 먼저, 비어 있으면 주소.
  const placeName = nameTrim || stripRegion(addr.road || field.address);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Header onClose={close} />
      <KeyboardAvoid style={styles.flex}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll} scrollEnabled={!mapBusy}>
          <View style={styles.mapBox}>
            <FieldPinMap
              ref={mapRef}
              lat={addr.lat}
              lng={addr.lng}
              onDragEnd={onPinMove}
              resolveInitialAddress
              height={MAP_H}
              mode="center"
              pinKind={field.pinKind}
              framed={false}
              onInteractionChange={setMapBusy}
            />
            <View style={styles.mapHintWrap} pointerEvents="none">
              <View style={styles.mapHint}>
                <Icon name="move" size={14} color={c2.text.inverse} />
                <Text v2="caption.semibold" tone="inverse">
                  지도를 움직여 위치를 맞춰 주세요
                </Text>
              </View>
            </View>
            <MapButton icon="locate" size={44} accessibilityLabel="내 위치로" onPress={() => void locate()} style={styles.locate} />
          </View>

          <View style={styles.form}>
            <View style={styles.labelRow}>
              <Text v2="bodyS.bold" tone="body">
                현장명
              </Text>
              <View style={styles.recommend}>
                <Text v2="micro.bold" tone="brand">
                  권장
                </Text>
              </View>
              <View style={styles.flex} />
              <Text v2="small.regular" tone="tertiary" numeric>
                {`${name.length} / ${NAME_MAX}`}
              </Text>
            </View>
            <TextField2
              value={name}
              onChangeText={setName}
              maxLength={NAME_MAX}
              placeholder="예: 하단역 3번 출구 보안등 (비우면 주소로)"
              accessibilityLabel="현장명"
            />

            <View style={[styles.labelRow, styles.gap]}>
              <Text v2="bodyS.bold" tone="body" style={styles.flex}>
                주소
              </Text>
              {moved ? (
                <Text v2="small.bold" tone="brand">
                  지도 위치로 바뀜
                </Text>
              ) : null}
            </View>
            <Touchable
              onPress={() => setSearchOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`주소 ${addr.road || addr.jibun}, 눌러서 검색`}
              style={[styles.address, moved && styles.addressMoved]}
            >
              <Icon name="search" size={18} color={c2.text.secondary} />
              <View style={styles.flex}>
                <Text v2="bodyM.semibold" numberOfLines={1}>
                  {addr.road || addr.jibun || '주소를 확인하고 있어요'}
                </Text>
                {addr.jibun && addr.road ? (
                  <Text v2="small.regular" tone="tertiary" numberOfLines={1}>
                    {`지번 ${shortJibun(addr.jibun)}`}
                  </Text>
                ) : null}
              </View>
            </Touchable>

            <Text v2="bodyS.bold" tone="body" style={[styles.label, styles.gap]}>
              {'상세 주소 '}
              <Text v2="bodyS.regular" tone="tertiary">
                (선택)
              </Text>
            </Text>
            <TextField2
              value={detail}
              onChangeText={setDetail}
              maxLength={DETAIL_MAX}
              placeholder="예: 3번 출구 앞 횡단보도 옆"
              accessibilityLabel="상세 주소"
            />

            <View style={styles.gap}>
              <CategoryChips
                value={categories}
                onChange={(next) => {
                  categoriesAt.current = Date.now();
                  setCategories(next);
                }}
                placeName={placeName}
              />
            </View>
            {error ? <FieldMessage message={error} style={styles.gapSm} /> : null}
          </View>
        </ScrollView>
        <BottomActionBar style={styles.footer}>
          <Button2 onPress={() => void save()} loading={saving} fullWidth>
            저장
          </Button2>
        </BottomActionBar>
      </KeyboardAvoid>
      {placeBridge}
      <AddressSearchSheet
        near={{ lat: addr.lat, lng: addr.lng }}
        searchPlaces={searchPlaces}
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={(it) => {
          setSearchOpen(false);
          setMoved(true);
          setError(null);
          setAddr({ road: it.roadAddress, jibun: it.jibunAddress, sido: it.sido, sigungu: it.sigungu, lat: it.lat, lng: it.lng });
        }}
      />
    </View>
  );
}

function Header({ onClose }: { onClose: () => void }) {
  return (
    <View style={styles.header}>
      <Touchable onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기" style={styles.close}>
        <Icon name="close" size={22} color={c2.text.primary} />
      </Touchable>
      <Text v2="title.s" accessibilityRole="header">
        현장 정보 수정
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c2.bg.canvas },
  flex: { flex: 1 },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingLeft: space[6],
    borderBottomWidth: 1,
    borderBottomColor: c2.border.default,
  },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingBottom: space[24] },
  mapBox: { height: MAP_H },
  mapHintWrap: { position: 'absolute', top: space[12], left: 0, right: 0, alignItems: 'center', zIndex: 10 },
  mapHint: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[6],
    paddingHorizontal: space[12],
    borderRadius: radius2.full,
    backgroundColor: c2.bg.hint,
  },
  locate: { position: 'absolute', right: space[12], bottom: space[12], zIndex: 10 },
  form: { paddingHorizontal: space[20], paddingTop: space[16] },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: space[6], marginBottom: space[8] },
  recommend: { height: 18, paddingHorizontal: space[6], borderRadius: 9, backgroundColor: c2.bg.brandSubtle, justifyContent: 'center' },
  label: { marginBottom: space[8] },
  gap: { marginTop: space[20] },
  gapSm: { marginTop: space[12] },
  address: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[10],
    paddingHorizontal: space[14],
    paddingVertical: space[6],
    borderRadius: radius2.lg,
    borderWidth: 1.5,
    borderColor: c2.border.default,
    backgroundColor: c2.bg.subtle,
  },
  addressMoved: { backgroundColor: c2.bg.brandSubtle, borderColor: c2.border.brandMuted },
  footer: { paddingTop: space[12], borderTopColor: c2.border.default },
});
