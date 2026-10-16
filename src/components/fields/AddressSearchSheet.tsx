import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AppSheet } from '@/components/ui/AppSheet';
import { SheetTextInput } from '@/components/ui/SheetTextInput';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { Icon } from '@/components/icons';
import { fields as fieldsApi, type AddressSearchItem } from '@/api';
import { MIN_KEYWORD_LEN, SEARCH_DEBOUNCE_MS, mergeSearchItems } from '@/utils/addressSearch';
import { shortJibun, stripRegion } from '@/utils/addressFormat';
import { c2, radius2, space, type2 } from '@/theme/v2';
import { fontFamily } from '@/theme/typography';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (item: AddressSearchItem) => void;
  /**
   * 장소 검색 — 화면이 가진 useKakaoPlaceSearch 의 search. 네이티브 브리지(WebView)는 시트 밖 화면에 둔다
   * (시트 안에 두면 열고 닫을 때마다 WebView 가 다시 뜨고 준비 표시가 어긋난다).
   */
  searchPlaces: (q: string, near?: { lat: number; lng: number } | null) => Promise<AddressSearchItem[]>;
  /** 장소 검색 기준점(지금 현장 위치) — 같은 이름의 먼 곳이 앞에 오지 않게. */
  near?: { lat: number; lng: number } | null;
}

/**
 * 5-5 주소 칸을 누르면 뜨는 주소 검색 시트. Figma 에 그리지 않은 보조 화면이라 4-1 결과 행 모양을 줄여 쓴다.
 * 주소(서버, 도로명·지번)와 장소(카카오 키워드)를 함께 찾는다.
 */
export function AddressSearchSheet({ open, onClose, onSelect, near, searchPlaces }: Props) {
  const nearRef = useRef(near);
  nearRef.current = near;
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<AddressSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const reqRef = useRef(0);

  useEffect(() => {
    if (open) {
      setQuery('');
      setItems([]);
    }
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_KEYWORD_LEN) {
      reqRef.current++;
      setItems([]);
      setLoading(false);
      return;
    }
    const my = ++reqRef.current;
    setLoading(true);
    const h = setTimeout(() => {
      const addrP = fieldsApi.addressSearch(q).then(
        (r) => r.items,
        () => [] as AddressSearchItem[],
      );
      const poiP = searchPlaces(q, nearRef.current).catch(() => [] as AddressSearchItem[]);
      void Promise.all([addrP, poiP]).then(([a, p]) => {
        if (my !== reqRef.current) return;
        setItems(mergeSearchItems(p, a).slice(0, 15));
        setLoading(false);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(h);
  }, [query, searchPlaces]);

  const empty = query.trim().length >= MIN_KEYWORD_LEN && !loading && items.length === 0;

  return (
    <AppSheet open={open} onClose={onClose} title="주소 검색" snapPoints={['85%']} scrollable>
      <View style={styles.body}>
        <View style={styles.inputBox}>
          <Icon name="search" size={18} color={c2.text.primary} />
          <SheetTextInput
            value={query}
            onChangeText={setQuery}
            autoFocus
            placeholder="도로명, 지번, 장소 이름"
            placeholderTextColor={c2.text.tertiary}
            returnKeyType="search"
            style={styles.input}
          />
          {loading ? <ActivityIndicator size="small" color={c2.text.tertiary} /> : null}
        </View>
        {empty ? (
          <Text v2="bodyS.regular" tone="tertiary" style={styles.empty}>
            {'결과가 없어요. 주소는 도로명이나 지번으로,\n장소는 이름으로 검색해 보세요.'}
          </Text>
        ) : null}
        {items.map((it, i) => {
          const isPlace = !!it.buildingName;
          const title = isPlace ? (it.buildingName as string) : stripRegion(it.roadAddress || it.jibunAddress);
          const sub = isPlace ? it.roadAddress || it.jibunAddress : it.jibunAddress ? `지번 ${shortJibun(it.jibunAddress)}` : '';
          return (
            <Touchable
              key={`${i}:${it.lat},${it.lng}`}
              onPress={() => onSelect(it)}
              accessibilityRole="button"
              style={[styles.row, i > 0 && styles.divider]}
            >
              <Icon name={isPlace ? 'place' : 'home'} size={20} color={c2.text.secondary} />
              <View style={styles.texts}>
                <Text v2="bodyL.semibold" numberOfLines={1}>
                  {title}
                </Text>
                {sub ? (
                  <Text v2="caption.regular" tone="tertiary" numberOfLines={1}>
                    {sub}
                  </Text>
                ) : null}
              </View>
            </Touchable>
          );
        })}
      </View>
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space[20] },
  inputBox: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[10],
    paddingHorizontal: space[14],
    marginBottom: space[8],
    borderRadius: radius2.lg,
    borderWidth: 2,
    borderColor: c2.border.brand,
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontFamily: fontFamily.regular,
    fontSize: type2['bodyL.regular'].fontSize,
    color: c2.text.primary,
    paddingVertical: 0,
  },
  empty: { textAlign: 'center', paddingVertical: space[24] },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space[14] },
  divider: { borderTopWidth: 1, borderTopColor: c2.border.subtle },
  texts: { flex: 1, gap: space[2] },
});
