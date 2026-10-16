import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Touchable } from '@/components/ui/Touchable';
import { SearchBar } from '@/components/ui/SearchBar';
import { DestinationFAB } from '@/components/ui/DestinationFAB';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { Button2 } from '@/components/ui/Button2';
import { Icon } from '@/components/icons';
import { safeBack } from '@/utils/backNavigation';
import { useDestinationCart } from '@/utils/destinationCart';
import { openRouteTo } from '@/utils/navigation';
import { c2, space } from '@/theme/v2';

const SEARCH_HREF = '/(tabs)/trips/fields';

/**
 * 5 현장 상세·5-2 등록 안 된 위치의 머리(Figma 691:3427): 뒤로(검색 결과로) · 검색어 알약 · 목적지 버튼.
 * 알약·지우기는 4 현장 검색으로 — 스택에 있으면 거기까지 닫고, 없으면 이 화면을 바꾼다(dismissTo).
 */
export function FieldDetailHeader({ query }: { query: string }) {
  const router = useRouter();
  const cart = useDestinationCart();
  const toSearch = (q: string) => router.dismissTo({ pathname: SEARCH_HREF, params: { q } } as never);
  return (
    <View style={styles.header}>
      <Touchable onPress={() => safeBack(router)} accessibilityRole="button" accessibilityLabel="검색 결과로" style={styles.back}>
        <Icon name="arrow-left" size={22} color={c2.text.primary} />
      </Touchable>
      <SearchBar
        value={query}
        onPressLauncher={() => toSearch(query)}
        onClear={() => toSearch('')}
        launcherLook="muted"
        placeholder="현장 이름이나 주소"
        style={styles.search}
      />
      <DestinationFAB size={44} count={cart.count} onPress={cart.open} />
    </View>
  );
}

interface FooterProps {
  name: string;
  lat: number;
  lng: number;
  added: boolean;
  adding?: boolean;
  onAdd: () => void;
}

/** 5·5-2 아래 줄: [길찾기] + [외근 목적지에 추가 / ✓ 외근 목적지에 추가됨]. */
export function FieldDetailFooter({ name, lat, lng, added, adding, onAdd }: FooterProps) {
  return (
    <BottomActionBar
      safeArea={false}
      style={styles.footer}
      secondary={
        <Button2 variant="secondary" icon="navigation" onPress={() => void openRouteTo({ name, lat, lng })}>
          길찾기
        </Button2>
      }
    >
      <Button2
        variant={added ? 'tonal' : 'primary'}
        icon={added ? 'check' : undefined}
        loading={adding}
        onPress={onAdd}
        fullWidth
      >
        {added ? '외근 목적지에 추가됨' : '외근 목적지에 추가'}
      </Button2>
    </BottomActionBar>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 52,
    marginTop: space[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[8],
    paddingLeft: space[4],
    paddingRight: space[16],
  },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  search: { flex: 1 },
  footer: { paddingTop: space[12], paddingBottom: 13, borderTopColor: c2.border.default },
});
