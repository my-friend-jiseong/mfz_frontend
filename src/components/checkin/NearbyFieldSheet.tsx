import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppSheet } from '@/components/ui/AppSheet';
import { SelectRow } from '@/components/ui/SelectRow';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { Icon } from '@/components/icons';
import type { Field } from '@/types/entities';
import { fieldTitle } from '@/utils/fieldFacets';
import { formatDistanceM, type NearbyField } from '@/utils/nearestField';
import { districtOf } from '@/utils/addressFormat';
import { c2, space } from '@/theme/v2';

interface Props {
  open: boolean;
  onClose: () => void;
  /** 100m 안 현장(가까운 순). */
  nearby: NearbyField<Field>[];
  selectedId: string | null;
  onSelect: (fieldId: string) => void;
  /** 어느 현장도 아니면 — 지금 위치로 새 현장(8-3). */
  onNewField: () => void;
}

/**
 * 8-4 [다른 현장] — 자동 연결한 현장 대신 100m 안 다른 현장을 고르거나 새 현장으로 기록한다.
 * Figma 에 그린 시트가 없어 5-3 프로젝트 시트와 같은 모양(고르기 행 + 아래 '새 …' 줄)으로 만든다.
 */
export function NearbyFieldSheet({ open, onClose, nearby, selectedId, onSelect, onNewField }: Props) {
  return (
    <AppSheet open={open} onClose={onClose} title="다른 현장" subtitle="지금 위치에서 100m 안에 있는 현장이에요" scrollable>
      <View style={styles.list}>
        {nearby.map((n, i) => (
          <SelectRow
            key={n.field.id}
            mode="radio"
            title={fieldTitle(n.field)}
            subtitle={[formatDistanceM(Math.max(1, n.distanceM)), districtOf(n.field.address)].filter(Boolean).join(' · ')}
            selected={n.field.id === selectedId}
            onPress={() => onSelect(n.field.id)}
            first={i === 0}
          />
        ))}
        <View style={styles.divider}>
          <Touchable onPress={onNewField} accessibilityRole="button" style={styles.newRow}>
            <Icon name="plus" size={22} color={c2.text.link} />
            <Text v2="bodyM.bold" tone="link">
              새 현장으로
            </Text>
          </Touchable>
        </View>
      </View>
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space[20] },
  divider: { borderTopWidth: 1, borderTopColor: c2.border.subtle },
  newRow: { height: 60, flexDirection: 'row', alignItems: 'center', gap: space[14] },
});
