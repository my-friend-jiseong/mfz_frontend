import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { elevation } from '@/theme/elevation';
import { applyFieldFilters } from '@/utils/fieldFacets';
import { useKakaoPlaceSearch } from '@/components/fields/useKakaoPlaceSearch';
import { SEARCH_DEBOUNCE_MS, MIN_KEYWORD_LEN } from '@/utils/addressSearch';
import type { Field } from '@/types/entities';
import type { AddressSearchItem } from '@/api';

// 레이어 FAB(44px) 폭 + 간격만큼 우측을 비워 검색창이 FAB 와 겹치지 않게.
const FAB_RESERVE = 44 + spacing.sm;
const MAX_FIELD_RESULTS = 6;
const MAX_PLACE_RESULTS = 6;
// 결과 목록이 화면을 다 덮지 않도록 — 두 그룹 합쳐 스크롤 가능한 최대 높이.
const RESULTS_MAX_HEIGHT = 320;

interface Props {
  // 검색 대상 현장(메인 탭에선 내 현장 전체). 이름(주소)·상세·프로젝트·분류로 매칭.
  fields: Field[];
  // 내 현장 결과 선택 시 — 지도를 그 현장으로 이동(MapDashboard 가 recenter 연결).
  onSelectField: (field: Field) => void;
  // 카카오 장소(새 위치) 결과 선택 시 — 그 좌표로 현장 등록 화면 진입(MapDashboard 연결).
  onSelectPlace: (item: AddressSearchItem) => void;
}

// 지도 상단 떠 있는 검색창. 두 갈래 검색을 합친다.
//  1) 내 현장 — applyFieldFilters(이름·주소·분류). 선택 시 지도 이동·하이라이트.
//  2) 새 위치 — 카카오 장소 키워드 검색(useKakaoPlaceSearch). 선택 시 그 좌표로 현장 등록.
// 결과 노출은 focus 가 아니라 query 유무로 제어(결과 탭 시 blur 가 먼저 떠 press 가 씹히는 회로 차단).
// 선택/clear 로 query 를 비우면 닫힌다.
export function MapSearchBar({ fields, onSelectField, onSelectPlace }: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const { search: searchPlaces, element: placeBridge } = useKakaoPlaceSearch();

  const fieldResults = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return applyFieldFilters(fields, { search: q }).slice(0, MAX_FIELD_RESULTS);
  }, [query, fields]);

  // 내 현장과 좌표가 사실상 겹치는 장소는 새 위치 목록에서 제외(같은 지점 중복 노출 방지).
  // toFixed(3) ≈ 110m 격자 — 키워드 검색 POI 중심과 현장 핀이 약간 어긋나도 같은 곳으로 본다.
  const fieldCoordKeys = useMemo(() => {
    const s = new Set<string>();
    for (const f of fields) {
      s.add(`${f.latitude.toFixed(3)},${f.longitude.toFixed(3)}`);
    }
    return s;
  }, [fields]);

  // 카카오 장소(키워드) 검색 — 디바운스 + latest-wins. 느리거나 실패해도 현장 결과엔 영향 없음.
  const [places, setPlaces] = useState<AddressSearchItem[]>([]);
  const placeReqRef = useRef(0);
  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_KEYWORD_LEN) {
      placeReqRef.current++;
      setPlaces([]);
      return;
    }
    const myReq = ++placeReqRef.current;
    const handle = setTimeout(() => {
      searchPlaces(q)
        .then((items) => {
          if (myReq !== placeReqRef.current) return;
          setPlaces(items);
        })
        .catch(() => {
          if (myReq !== placeReqRef.current) return;
          setPlaces([]);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query, searchPlaces]);

  const placeResults = useMemo(() => {
    if (!query.trim()) return [];
    return places
      .filter(
        (p) =>
          Number.isFinite(p.lat) &&
          Number.isFinite(p.lng) &&
          !fieldCoordKeys.has(`${p.lat.toFixed(3)},${p.lng.toFixed(3)}`),
      )
      .slice(0, MAX_PLACE_RESULTS);
  }, [places, fieldCoordKeys, query]);

  const open = query.trim().length > 0;
  const hasAny = fieldResults.length > 0 || placeResults.length > 0;

  const handleSelectField = (field: Field) => {
    onSelectField(field);
    setQuery('');
    Keyboard.dismiss();
  };

  const handleSelectPlace = (item: AddressSearchItem) => {
    onSelectPlace(item);
    setQuery('');
    Keyboard.dismiss();
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* 네이티브 장소검색용 헤드리스 WebView 브릿지(웹은 null) — 화면엔 안 보임. */}
      {placeBridge}
      <View
        style={[styles.anchor, { top: insets.top + spacing.sm }]}
        pointerEvents="box-none"
      >
        <View style={styles.bar}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="현장·주소·장소 검색"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 ? (
            <Pressable
              onPress={() => setQuery('')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="검색어 지우기"
            >
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {open ? (
          <View style={styles.results}>
            {!hasAny ? (
              <Text variant="bodySm" color="textMuted" style={styles.empty}>
                검색 결과 없음
              </Text>
            ) : (
              <ScrollView
                style={styles.resultsScroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {/* 내 현장 그룹 — 선택 시 지도 이동·하이라이트 */}
                {fieldResults.length > 0 ? (
                  <View>
                    {placeResults.length > 0 ? (
                      <Text variant="caption" color="textMuted" style={styles.groupLabel}>
                        내 현장
                      </Text>
                    ) : null}
                    {fieldResults.map((f, i) => {
                      const secondary =
                        f.addressDetail ||
                        f.projectName ||
                        f.categories?.join(' · ') ||
                        '';
                      return (
                        <Pressable
                          key={f.id}
                          onPress={() => handleSelectField(f)}
                          style={({ pressed }) => [
                            styles.item,
                            i > 0 && styles.itemDivider,
                            pressed && styles.itemPressed,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`현장 ${f.name || f.address}`}
                        >
                          <Ionicons
                            name="location-outline"
                            size={16}
                            color={colors.primary}
                            style={styles.itemIcon}
                          />
                          <View style={styles.itemText}>
                            <Text variant="bodySm" numberOfLines={1}>
                              {f.name || f.address}
                            </Text>
                            {secondary ? (
                              <Text variant="caption" color="textMuted" numberOfLines={1}>
                                {secondary}
                              </Text>
                            ) : null}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}

                {/* 새 위치 그룹 — 카카오 장소 검색. 선택 시 그 좌표로 현장 등록 진입 */}
                {placeResults.length > 0 ? (
                  <View>
                    <Text variant="caption" color="textMuted" style={styles.groupLabel}>
                      새 위치 등록
                    </Text>
                    {placeResults.map((p, i) => {
                      const primary = p.buildingName || p.roadAddress || p.jibunAddress;
                      const secondary =
                        p.buildingName && p.roadAddress
                          ? p.roadAddress
                          : p.roadAddress && p.jibunAddress && p.roadAddress !== p.jibunAddress
                            ? p.jibunAddress
                            : '';
                      return (
                        <Pressable
                          key={`place-${i}-${p.lat}-${p.lng}`}
                          onPress={() => handleSelectPlace(p)}
                          style={({ pressed }) => [
                            styles.item,
                            i > 0 && styles.itemDivider,
                            pressed && styles.itemPressed,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`새 위치 ${primary} 현장 등록`}
                        >
                          <Ionicons
                            name="add-circle-outline"
                            size={16}
                            color={colors.textMuted}
                            style={styles.itemIcon}
                          />
                          <View style={styles.itemText}>
                            <Text variant="bodySm" numberOfLines={1}>
                              {primary}
                            </Text>
                            {secondary ? (
                              <Text variant="caption" color="textMuted" numberOfLines={1}>
                                {secondary}
                              </Text>
                            ) : null}
                          </View>
                          <Text variant="caption" color="primary" style={styles.registerHint}>
                            등록
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </ScrollView>
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg + FAB_RESERVE,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...elevation.raised,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    padding: 0,
  },
  results: {
    marginTop: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...elevation.raised,
  },
  resultsScroll: {
    maxHeight: RESULTS_MAX_HEIGHT,
  },
  empty: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    textAlign: 'center',
  },
  groupLabel: {
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
    backgroundColor: colors.surfaceMuted,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  itemDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
  },
  itemPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  itemIcon: {
    marginTop: 1,
  },
  itemText: {
    flex: 1,
  },
  registerHint: {
    marginLeft: spacing.sm,
  },
});
