import React, { useEffect, useState } from 'react';
import { BackHandler, Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FieldPinMap } from '@/components/fields/FieldPinMap';
import type { ReverseAddress } from '@/components/fields/useKakaoPlaceSearch';
import { Button2 } from '@/components/ui/Button2';
import { MapButton } from '@/components/ui/MapButton';
import { Text } from '@/components/ui/Text';
import { Icon } from '@/components/icons';
import { pickedPlaceName } from '@/utils/addressFormat';
import { fmtMonthDayAmPm } from '@/utils/datetime';
import { c2, elevation2, radius2, space } from '@/theme/v2';

export interface PickedLocation {
  lat: number;
  lng: number;
  /** 역지오코딩이 끝났으면 주소. 새 묶음 이름·새 현장 주소에 쓴다. */
  address: ReverseAddress | null;
}

interface Props {
  /** takenAt: 찍은 시각. 모르면 null(줄에서 뺀다). */
  photo: { uri: string; takenAt: string | null };
  /** '2장 중 1' */
  index: number;
  total: number;
  /** 처음 지도 가운데. */
  start: { lat: number; lng: number };
  onClose: () => void;
  onPick: (p: PickedLocation) => void;
}

// 아래 카드: 위 16 + 사진 64 + 14 + 버튼 56 + 아래 여백(Figma 600:2947).
const CARD_BODY_H = space[16] + 64 + space[14] + 56;
// 이 시간 안에 주소가 오지 않으면 못 찾은 것으로 본다.
const ADDRESS_TIMEOUT_MS = 8000;
// 카드 모서리(20) 아래까지 지도를 깐다.
const CARD_RADIUS = radius2['2xl'];

/**
 * 8-8 사진 위치 지정(Figma 600:2928). 8-7 위에 덮는 전체 화면. 핀은 가운데 고정, 지도를 끌어 맞춘다(5-5 와 같은 지도).
 * X·안드로이드 뒤로는 8-7 로 돌아간다(지정하지 않음).
 */
export function PhotoLocationPicker({ photo, index, total, start, onClose, onPick }: Props) {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const [pos, setPos] = useState<PickedLocation>({ ...start, address: null });
  // 주소를 못 찾은 좌표(빈 결과·시간 초과) — '확인하고 있어요'에 머물지 않는다.
  const [missingAt, setMissingAt] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (pos.address) return;
    const at = { lat: pos.lat, lng: pos.lng };
    const t = setTimeout(() => setMissingAt(at), ADDRESS_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [pos]);
  const missing = !pos.address && missingAt?.lat === pos.lat && missingAt?.lng === pos.lng;

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  const cardH = CARD_BODY_H + Math.max(insets.bottom, space[20]);
  const mapH = Math.max(240, winH - cardH + CARD_RADIUS);
  const title = pos.address
    ? pickedPlaceName(pos.address.jibunAddress, pos.address.roadAddress)
    : missing
      ? '주소를 찾지 못했어요 · 지도를 조금 옮겨 주세요'
      : '주소를 확인하고 있어요';

  return (
    <View style={styles.root}>
      <View style={[styles.map, { height: mapH }]}>
        <FieldPinMap
          lat={start.lat}
          lng={start.lng}
          height={mapH}
          mode="center"
          pinKind="new"
          framed={false}
          showOrigin={false}
          level={4}
          resolveInitialAddress
          onAddressMissing={(lat, lng) => setMissingAt({ lat, lng })}
          onDragEnd={(lat, lng, a) =>
            setPos({
              lat,
              lng,
              address: a ? { roadAddress: a.roadAddress, jibunAddress: a.jibunAddress, sido: a.sido ?? '', sigungu: a.sigungu ?? '' } : null,
            })
          }
        />
      </View>

      <View pointerEvents="box-none" style={[styles.header, { paddingTop: insets.top + space[2] }]}>
        <MapButton icon="close" size={44} accessibilityLabel="닫기" onPress={onClose} />
        <View style={styles.titlePill}>
          <Text v2="title.pill" accessibilityRole="header" numberOfLines={1}>
            사진 위치 지정
          </Text>
        </View>
      </View>
      <View pointerEvents="none" style={[styles.hintWrap, { top: insets.top + space[2] + 44 + space[20] }]}>
        <View style={styles.hint}>
          <Icon name="move" size={16} color={c2.text.inverse} />
          <Text v2="bodyS.semibold" tone="inverse">
            지도를 움직여 사진 찍은 곳에 맞춰 주세요
          </Text>
        </View>
      </View>

      <View style={[styles.card, { paddingBottom: Math.max(insets.bottom, space[20]) }]}>
        <View style={styles.cardRow}>
          <Image source={{ uri: photo.uri }} style={styles.thumb} accessibilityIgnoresInvertColors />
          <View style={styles.flex}>
            <Text v2="caption.regular" tone="tertiary" numeric numberOfLines={1}>
              {photo.takenAt ? `${fmtMonthDayAmPm(photo.takenAt)} 촬영 · ${total}장 중 ${index}` : `${total}장 중 ${index}`}
            </Text>
            <Text v2="title.xs" numberOfLines={1} tone={pos.address ? undefined : 'tertiary'}>
              {title}
            </Text>
          </View>
        </View>
        <Button2 fullWidth onPress={() => onPick(pos)}>
          이 위치로 지정
        </Button2>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, zIndex: 20, backgroundColor: c2.bg.muted },
  flex: { flex: 1 },
  map: { position: 'absolute', left: 0, right: 0, top: 0 },
  header: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[10],
    paddingLeft: space[12],
    paddingRight: space[16],
  },
  titlePill: {
    flexShrink: 1,
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: space[16],
    borderRadius: radius2.full,
    backgroundColor: c2.bg.canvas,
    ...elevation2.control,
  },
  hintWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 11 },
  hint: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[6],
    paddingLeft: space[14],
    paddingRight: space[14],
    borderRadius: radius2.full,
    backgroundColor: c2.bg.hintStrong,
  },
  card: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 11,
    paddingTop: space[16],
    paddingHorizontal: space[20],
    gap: space[14],
    borderTopLeftRadius: CARD_RADIUS,
    borderTopRightRadius: CARD_RADIUS,
    backgroundColor: c2.bg.canvas,
    ...elevation2.sheet,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: space[12], height: 64 },
  thumb: { width: 64, height: 64, borderRadius: radius2.sm, backgroundColor: c2.bg.placeholder },
});
