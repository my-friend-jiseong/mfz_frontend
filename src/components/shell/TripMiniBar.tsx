import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { router, useFocusEffect } from 'expo-router';
import { goToTabRoot } from './tabNav';
import { Icon } from '@/components/icons';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { useTripStore } from '@/stores/tripStore';
import { useDestinationStore } from '@/stores/destinationStore';
import { useFieldStore } from '@/stores/fieldStore';
import { useBottomChromeStore } from '@/stores/bottomChromeStore';
import { c2, elevation2, radius2, space } from '@/theme/v2';
import { peekUserLocation, type LatLng } from '@/utils/geolocation';
import { haversineKm } from '@/utils/routeOptimize';
import { formatDistanceM } from '@/utils/nearestField';
import { tripTitle } from '@/utils/tripFormat';
import { fieldTitle } from '@/utils/fieldFacets';
import { checkinHref } from '@/utils/checkinNav';

// Figma 7-4(598:2807) '진행 중인 외근' 카드 64 + 탭 바와의 간격 8. 위로 24 더 올라가는 흰 그라데이션(미니 바 바탕)은
// 카드 뒤 목록 글자를 가린다 — 높이 계산(콘텐츠 여백·스낵바)에는 카드+간격만 쓴다.
const CARD_H = 64;
const FADE_H = 96;
export const MINI_BAR_HEIGHT = CARD_H + space[8];
// 거리는 부가 정보 — 30초마다 다시 읽는다(권한이 있을 때만, 묻지 않음).
const LOCATION_REFRESH_MS = 30_000;


function useSilentLocation(enabled: boolean): LatLng | null {
  const [pos, setPos] = useState<LatLng | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const read = () => void peekUserLocation().then((p) => alive && p && setPos(p));
    read();
    const id = setInterval(read, LOCATION_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [enabled]);
  return pos;
}

// iOS 는 키보드가 올라오기 시작할 때(Will) 숨겨 키보드 위로 잠깐 떠오르지 않게 한다. 안드로이드는 Will 이벤트가 없다.
function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

/**
 * 탭 첫 화면(9 보고서 목록·10 내 정보) 안에 두는 미니 바. 화면 안에 있어서 푸시·팝 때 화면과 함께 밀려 나간다 —
 * 탭 레이아웃에 두면 푸시 순간 사라졌다 팝 끝에 다시 나타나 깜빡였다. 화면 바닥 = 탭 바 위라 bottom 0.
 * 화면이 포커스일 때만 높이를 bottomChromeStore 에 알린다(스낵바·useMiniBarInset).
 */
export function TabRootMiniBar() {
  const tripActive = useTripStore((s) => s.activeTripId !== null);
  const keyboardVisible = useKeyboardVisible();
  const show = tripActive && !keyboardVisible;
  const setMiniBar = useBottomChromeStore((s) => s.setMiniBar);
  useFocusEffect(
    useCallback(() => {
      setMiniBar(show ? MINI_BAR_HEIGHT : 0);
      return () => setMiniBar(0);
    }, [show, setMiniBar]),
  );
  return show ? <TripMiniBar bottom={0} /> : null;
}

/**
 * 외근 중 미니 바(7-4). 보고서·내 정보 탭에서 탭 바 바로 위에 뜬다. 누르면 외근 진행(7), [체크인]은 다음 목적지 체크인(8).
 * 진행 중 외근이 없으면 아무것도 그리지 않는다 — 보일지 여부는 탭 레이아웃이 정한다.
 */
export function TripMiniBar({ bottom }: { bottom: number }) {
  // [체크인] 두 번 누름 — 모달이 뜨는 동안 다시 눌러 체크인 화면이 두 겹 쌓이지 않게 잠깐 막는다.
  const checkinAt = useRef(0);
  const openCheckin = (fieldId: string) => {
    const now = Date.now();
    if (now - checkinAt.current < 1000) return;
    checkinAt.current = now;
    router.push(checkinHref(fieldId) as never);
  };
  const activeTripId = useTripStore((s) => s.activeTripId);
  const trip = useTripStore((s) => (s.activeTripId ? s.trips.find((t) => t.id === s.activeTripId) : undefined));
  const destinations = useDestinationStore((s) => s.destinations);
  // getById 는 함수 참조가 고정이라 현장 목록이 늦게 도착해도 다시 그려지지 않는다 — 배열을 구독한다.
  const fields = useFieldStore((s) => s.fields);
  const myPos = useSilentLocation(activeTripId !== null);
  // 하단 버튼 바가 있는 화면이면 그라데이션이 버튼 아래쪽을 덮는다 — 그땐 카드만.
  const hasFooter = useBottomChromeStore((s) => s.footer > 0);

  const info = useMemo(() => {
    if (!activeTripId) return null;
    const mine = destinations.filter((d) => d.tripId === activeTripId).sort((a, b) => a.order - b.order);
    const resolved = mine.filter((d) => d.status !== 'pending').length;
    const next = mine.find((d) => d.status === 'pending');
    const field = next ? fields.find((f) => f.id === next.fieldId) : undefined;
    return { total: mine.length, position: resolved + 1, next, field };
  }, [activeTripId, destinations, fields]);

  if (!activeTripId || !info) return null;

  const { next, field } = info;
  const label = next ? `외근 중 · 다음 ${info.position}/${info.total}` : '외근 중';
  const placeName = field ? fieldTitle(field) : null;
  const distance =
    field && myPos && !(field.latitude === 0 && field.longitude === 0)
      ? formatDistanceM(haversineKm(myPos, { lat: field.latitude, lng: field.longitude }) * 1000)
      : null;
  const title = placeName
    ? distance
      ? `${placeName} · ${distance}`
      : placeName
    : trip
      ? tripTitle(trip)
      : '외근 중';

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
      {hasFooter ? null : (
        <Svg pointerEvents="none" width="100%" height={FADE_H} style={styles.fade}>
          <Defs>
            <LinearGradient id="miniBarFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={c2.bg.canvas} stopOpacity={0} />
              <Stop offset="0.29167" stopColor={c2.bg.canvas} stopOpacity={1} />
              <Stop offset="1" stopColor={c2.bg.canvas} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height={FADE_H} fill="url(#miniBarFade)" />
        </Svg>
      )}
      <View style={styles.card}>
        <Touchable
          onPress={() => goToTabRoot('trips')}
          accessibilityRole="button"
          accessibilityLabel={`${label}, ${title}. 외근 진행 화면으로 이동`}
          noAutoHitSlop
          style={styles.main}
        >
          <View style={styles.iconBox}>
            <Icon name="briefcase" size={22} color={c2.text.inverse} />
          </View>
          <View style={styles.texts}>
            <Text v2="small.bold" tone="brand" numberOfLines={1}>
              {label}
            </Text>
            <Text v2="bodyL.bold" numberOfLines={1}>
              {title}
            </Text>
          </View>
        </Touchable>
        {next ? (
          <Touchable
            onPress={() => openCheckin(next.fieldId)}
            accessibilityRole="button"
            accessibilityLabel="체크인"
            style={styles.checkin}
          >
            <Text v2="bodyM.bold" tone="inverse">
              체크인
            </Text>
          </Touchable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, height: FADE_H, justifyContent: 'flex-end' },
  fade: { position: 'absolute', left: 0, right: 0, top: 0 },
  card: {
    height: CARD_H,
    marginHorizontal: space[12],
    marginBottom: space[8],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[8],
    paddingLeft: space[10],
    paddingRight: space[10],
    borderRadius: radius2.xl,
    borderWidth: 1,
    borderColor: c2.border.default,
    backgroundColor: c2.bg.canvas,
    ...elevation2.popover,
  },
  main: { flex: 1, height: CARD_H, flexDirection: 'row', alignItems: 'center', gap: space[10] },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: radius2.md,
    backgroundColor: c2.bg.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1 },
  checkin: {
    height: 44,
    paddingHorizontal: space[16],
    borderRadius: radius2.md,
    backgroundColor: c2.bg.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
