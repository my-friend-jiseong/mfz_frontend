import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapPreviewCard } from '@/components/MapPreviewCard';
import { FieldDetailFooter, FieldDetailHeader } from '@/components/fields/FieldDetailChrome';
import { Tag } from '@/components/ui/Tag';
import { Text } from '@/components/ui/Text';
import { notice } from '@/components/ui/ConfirmDialog';
import { Icon } from '@/components/icons';
import { STATUS_PIN_COLOR } from '@/components/shell/pinColors';
import { openFullMap } from '@/components/shell/fullMap';
import { createFieldFromPlace } from '@/utils/placeToField';
import { useKakaoPlaceSearch } from '@/components/fields/useKakaoPlaceSearch';
import { useDestinationCart } from '@/utils/destinationCart';
import { districtOf, shortJibun, stripRegion } from '@/utils/addressFormat';
import { formatDistanceM } from '@/utils/nearestField';
import { haversineKm } from '@/utils/routeOptimize';
import { peekUserLocation, type LatLng } from '@/utils/geolocation';
import type { PlaceRouteParams } from '@/utils/placeParams';
import { c2, radius2, space } from '@/theme/v2';

/**
 * 5-2 현장 상세 · 등록 안 된 위치(Figma 691:3721). 4-1 의 주소·장소 결과를 누르면 열린다.
 * 아직 현장이 아니라 방문·프로젝트·분류·더보기가 없다. [외근 목적지에 추가]하면 현장으로 저장하고 5 현장 상세로 바뀐다.
 */
export default function UnregisteredPlace() {
  const p = useLocalSearchParams() as Partial<PlaceRouteParams>;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cart = useDestinationCart();
  const lat = Number(p.lat);
  const lng = Number(p.lng);
  const road = p.road ?? '';
  const jibun = p.jibun ?? '';
  const name = p.name?.trim() || stripRegion(road || jibun);

  const [myLoc, setMyLoc] = useState<LatLng | null>(null);
  useEffect(() => {
    void peekUserLocation().then(setMyLoc);
  }, []);
  const [adding, setAdding] = useState(false);
  const { reverse, element: placeBridge } = useKakaoPlaceSearch();
  // 현장을 만드는 동안은 뒤로 가지 못하게 하고(만들어진 현장이 담기지 않은 채 남지 않게), 떠난 뒤엔 화면을 바꾸지 않는다.
  const addingRef = useRef(false);
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
        if (addingRef.current) e.preventDefault();
      }),
    [navigation],
  );

  const valid = Number.isFinite(lat) && Number.isFinite(lng);
  const distance = myLoc && valid ? formatDistanceM(haversineKm(myLoc, { lat, lng }) * 1000) : null;
  const subtitle = [p.cat || districtOf(jibun || road), distance ? `현 위치에서 ${distance}` : null].filter(Boolean).join(' · ');

  const add = async () => {
    if (addingRef.current || !valid) return;
    addingRef.current = true;
    setAdding(true);
    const r = await createFieldFromPlace(
      {
        name: p.name || null,
        roadAddress: road,
        jibunAddress: jibun,
        sido: p.sido,
        sigungu: p.sigungu,
        lat,
        lng,
      },
      reverse,
    );
    addingRef.current = false;
    if (!r.ok) {
      if (!mountedRef.current) return;
      setAdding(false);
      await notice('외근 목적지에 추가하지 못했어요', r.error);
      return;
    }
    cart.add([r.field.id]);
    if (!mountedRef.current) return;
    // 현장이 되었으니 5 현장 상세로 바꾼다. 상태 변경과 화면 교체를 한 배치에 두지 않는다.
    setTimeout(() => {
      if (mountedRef.current) {
        router.replace({ pathname: '/(tabs)/trips/fields/[id]', params: { id: r.field.id, q: p.q ?? '' } } as never);
      }
    }, 0);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {placeBridge}
      <FieldDetailHeader query={p.q ?? ''} />
      <ScrollView contentContainerStyle={styles.content}>
        <Tag label="등록 안 된 위치" style={styles.tag} />
        <Text v2="title.l" numberOfLines={2} style={styles.title}>
          {name}
        </Text>
        {subtitle ? (
          <Text v2="bodyS.regular" tone="tertiary" style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
        {valid ? (
          <MapPreviewCard
            markers={[{ id: 'place', lat, lng, label: name, color: STATUS_PIN_COLOR.search, pin: 'search', selected: true }]}
            onExpand={() =>
              openFullMap({
                title: [name, districtOf(jibun || road)].filter(Boolean).join(' · '),
                pins: [{ id: 'place', lat, lng, kind: 'search', selected: true, label: name }],
                nearbyFields: true,
              })
            }
            accessibilityLabel="위치 지도 크게 보기"
            style={styles.map}
          />
        ) : null}
        <View style={styles.addressBox}>
          {road ? (
            <View style={styles.addressRow}>
              <Text v2="bodyS.regular" tone="tertiary" style={styles.addressKey}>
                도로명
              </Text>
              <Text v2="bodyS.regular" style={styles.flex}>
                {road}
              </Text>
            </View>
          ) : null}
          {jibun ? (
            <View style={styles.addressRow}>
              <Text v2="bodyS.regular" tone="tertiary" style={styles.addressKey}>
                지번
              </Text>
              <Text v2="bodyS.regular" style={styles.flex}>
                {shortJibun(jibun)}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.info}>
          <Icon name="info" size={16} color={c2.text.link} />
          <Text v2="caption.regular" tone="secondary">
            외근 목적지에 추가하면 현장으로 저장돼요.
          </Text>
        </View>
      </ScrollView>
      {valid ? <FieldDetailFooter name={name} lat={lat} lng={lng} added={false} adding={adding} onAdd={() => void add()} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c2.bg.canvas },
  content: { paddingHorizontal: space[20], paddingTop: space[12], paddingBottom: space[24] },
  tag: { alignSelf: 'flex-start' },
  title: { marginTop: space[12] },
  subtitle: { marginTop: space[4] },
  map: { marginTop: space[20] },
  addressBox: {
    marginTop: space[20],
    paddingHorizontal: space[16],
    paddingVertical: space[12],
    gap: space[8],
    borderRadius: radius2.lg,
    backgroundColor: c2.bg.subtle,
  },
  addressRow: { flexDirection: 'row', gap: space[16] },
  addressKey: { width: 40 },
  flex: { flex: 1 },
  info: { marginTop: space[20], flexDirection: 'row', alignItems: 'center', gap: space[6] },
});
