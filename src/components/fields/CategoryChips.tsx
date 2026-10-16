import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { FilterChip2 } from '@/components/ui/FilterChip2';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { Icon } from '@/components/icons';
import { useCategoryStore, norm } from '@/stores/categoryStore';
import { CategorySheet } from './CategorySheet';
import { c2, radius2, space } from '@/theme/v2';

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  /** 분류 선택 시트 부제 앞부분(현장 이름·주소). */
  placeName: string;
}

/**
 * 5-5 현장 정보 수정의 '분류' 칩 줄. 칩을 누르면 바로 붙이고 떼며, [+ 추가]는 5-6 분류 선택 시트를 연다.
 * 이 현장에 붙은 분류(파랑) 다음에 나머지 분류(테두리)를 보인다.
 */
export function CategoryChips({ value, onChange, placeName }: Props) {
  const categories = useCategoryStore((s) => s.categories);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    void useCategoryStore.getState().refresh();
  }, []);

  const names = useMemo(() => {
    const out = [...value];
    for (const c of categories) if (!out.some((v) => norm(v) === norm(c.name))) out.push(c.name);
    return out;
  }, [value, categories]);

  const isOn = (name: string) => value.some((v) => norm(v) === norm(name));
  const toggle = (name: string) =>
    onChange(isOn(name) ? value.filter((v) => norm(v) !== norm(name)) : [...value, name]);

  return (
    <View>
      <Text v2="bodyS.bold" tone="body" style={styles.label}>
        분류
      </Text>
      <View style={styles.chips}>
        {names.map((n) => (
          <FilterChip2 key={n} label={n} size="M" selected={isOn(n)} onPress={() => toggle(n)} />
        ))}
        <Touchable onPress={() => setSheetOpen(true)} accessibilityRole="button" accessibilityLabel="분류 추가" style={styles.add}>
          <Icon name="plus" size={12} color={c2.text.secondary} />
          <Text v2="bodyS.semibold" tone="secondary">
            추가
          </Text>
        </Touchable>
      </View>
      <CategorySheet
        open={sheetOpen}
        placeName={placeName}
        initial={value}
        onClose={(next) => {
          setSheetOpen(false);
          onChange(next);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: space[8] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[8] },
  add: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[4],
    paddingHorizontal: space[14],
    borderRadius: radius2.full,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: c2.border.default,
  },
});
