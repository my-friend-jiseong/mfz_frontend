import React, { useCallback, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { AppSheet } from '@/components/ui/AppSheet';
import { Button2 } from '@/components/ui/Button2';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { Icon } from '@/components/icons';
import { useLocationPermissionStore } from '@/stores/locationPermissionStore';
import { openLocationSettings } from '@/utils/geolocation';
import { c2, space } from '@/theme/v2';

// 아이콘 상자 모서리. Figma 1-2 에 변수 없이 18 로 박혀 있다.
const ICON_BOX_RADIUS = 18;
// 웹은 설정 앱으로 보낼 수 없다 — 한 번 막으면 브라우저 사이트 설정에서만 풀린다.
const IS_WEB = Platform.OS === 'web';

interface Props {
  /** 시트가 어떤 길로든 닫힌 뒤 한 번. granted 는 이번에 허용했는가. */
  onDone?: (granted: boolean) => void;
}

/**
 * 1-2 위치 권한 안내 시트(Figma 635:3192). 권한이 꺼진 상태에서 내 위치·외근 시작을 누르면 뜬다.
 * 두 번 거절했으면(또는 OS 가 더 묻지 않으면) 버튼이 '설정에서 켜기'로 바뀐다. 웹에서 막혀 있으면 브라우저 안내.
 */
export function LocationPermissionSheet({ onDone }: Props) {
  const open = useLocationPermissionStore((s) => s.sheetOpen);
  const status = useLocationPermissionStore((s) => s.status);
  const blocked = status === 'blocked';
  const webBlocked = blocked && IS_WEB;
  const grantedRef = useRef(false);
  const busyRef = useRef(false);

  const close = () => useLocationPermissionStore.getState().closeSheet();
  // AppSheet 는 버튼·스크림·끌어내리기 어떤 길로 닫혀도 onClose 를 한 번 부른다.
  const handleClose = useCallback(() => {
    useLocationPermissionStore.getState().closeSheet();
    const granted = grantedRef.current;
    grantedRef.current = false;
    onDone?.(granted);
  }, [onDone]);

  const allow = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      if (blocked) {
        if (!IS_WEB) openLocationSettings();
        return;
      }
      const next = await useLocationPermissionStore.getState().request();
      grantedRef.current = next === 'granted';
    } finally {
      busyRef.current = false;
      close();
    }
  };

  return (
    <AppSheet open={open} onClose={handleClose} closeButton={false}>
      <View style={styles.body}>
        <View style={styles.iconBox}>
          <Icon name="location-off" size={28} color={c2.text.link} />
        </View>
        <Text v2="title.sheet" style={styles.title} accessibilityRole="header">
          {'지금 위치를 쓰려면\n위치 권한이 필요해요'}
        </Text>
        <Text v2="bodyM.regular" tone="secondary" style={styles.desc}>
          {webBlocked
            ? '브라우저가 위치를 막고 있어요. 주소창 왼쪽의 사이트 설정에서 위치를 허용해 주세요. 권한 없이도 검색과 지도는 그대로 쓸 수 있어요.'
            : '외근 중에 지나온 길과 도착한 현장을 확인하고, 서 있는 곳에 현장을 기록할 때 써요. 권한 없이도 검색과 지도는 그대로 쓸 수 있어요.'}
        </Text>
        <Button2 onPress={() => void allow()} fullWidth>
          {webBlocked ? '확인' : blocked ? '설정에서 켜기' : '위치 권한 허용'}
        </Button2>
        {webBlocked ? null : (
          <Touchable onPress={close} accessibilityRole="button" style={styles.later}>
            <Text v2="bodyM.semibold" tone="secondary">
              나중에
            </Text>
          </Touchable>
        )}
      </View>
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  // 손잡이 영역(20) 아래 10 → 아이콘(Figma: 시트 위 30).
  body: { paddingHorizontal: space[20], paddingTop: space[10], paddingBottom: space[16] },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: ICON_BOX_RADIUS,
    backgroundColor: c2.bg.brandSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { marginTop: 18 },
  desc: { marginTop: space[8], marginBottom: space[24] },
  later: { height: 48, marginTop: space[8], alignItems: 'center', justifyContent: 'center' },
});
