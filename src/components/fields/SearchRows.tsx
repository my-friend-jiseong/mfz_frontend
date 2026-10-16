import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { AddToggle } from '@/components/ui/AddToggle';
import { STATUS_LABEL } from '@/components/ui/StatusMark';
import { ListPin } from '@/components/map/PinIcon';
import { Icon } from '@/components/icons';
import { STATUS_TONE } from '@/components/trips/TripStopRow';
import type { FieldStatus } from '@/types/entities';
import { c2, radius2, space } from '@/theme/v2';

// 4 현장 검색 목록 행(Figma 537:1465·537:1570). 행 높이 64, 위 구분선.

/** 검색어 부분만 파랗게(4-1 '낙동대로 351'). 대소문자 무시, 첫 번째만. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) {
    return (
      <Text v2="bodyL.semibold" numberOfLines={1} style={styles.flexText}>
        {text}
      </Text>
    );
  }
  return (
    <Text v2="bodyL.semibold" numberOfLines={1} style={styles.flexText}>
      {text.slice(0, i)}
      <Text v2="bodyL.semibold" tone="link">
        {text.slice(i, i + q.length)}
      </Text>
      {text.slice(i + q.length)}
    </Text>
  );
}

interface FieldRowProps {
  title: string;
  query?: string;
  status: FieldStatus;
  /** 상태 뒤 회색 글 — ' 120m · 10월 8일' */
  meta: string;
  added: boolean;
  onPress: () => void;
  onToggle: () => void;
  divider: boolean;
}

export function FieldSearchRow({ title, query = '', status, meta, added, onPress, onToggle, divider }: FieldRowProps) {
  return (
    <View style={[styles.row, divider && styles.divider]}>
      <ListPin status={status} />
      <Touchable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}, ${STATUS_LABEL[status]}`} style={styles.main}>
        <Highlight text={title} query={query} />
        <Text v2="caption.regular" tone="tertiary" numberOfLines={1}>
          <Text v2="caption.semibold" tone={STATUS_TONE[status]}>
            {STATUS_LABEL[status]}
          </Text>
          {meta ? ` ${meta}` : ''}
        </Text>
      </Touchable>
      <AddToggle added={added} onPress={onToggle} label={title} />
    </View>
  );
}

interface PlaceRowProps {
  title: string;
  query: string;
  /** '초등학교'·'도로명' — 이름 옆 회색 작은 글. */
  tag?: string;
  kind: 'place' | 'address';
  meta: string;
  adding?: boolean;
  onPress: () => void;
  onAdd: () => void;
  divider: boolean;
}

export function PlaceSearchRow({ title, query, tag, kind, meta, adding, onPress, onAdd, divider }: PlaceRowProps) {
  return (
    <View style={[styles.row, divider && styles.divider]}>
      <View style={styles.iconSlot}>
        <Icon name={kind === 'address' ? 'home' : 'place'} size={20} color={c2.text.secondary} />
      </View>
      <Touchable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}, 등록 안 된 위치`} style={styles.main}>
        <View style={styles.titleLine}>
          <Highlight text={title} query={query} />
          {tag ? (
            <Text v2="small.regular" tone="tertiary" numberOfLines={1} style={styles.tag}>
              {tag}
            </Text>
          ) : null}
        </View>
        <Text v2="caption.regular" tone="tertiary" numberOfLines={1}>
          {meta}
        </Text>
      </Touchable>
      <AddToggle added={!!adding} onPress={onAdd} label={title} />
    </View>
  );
}

interface ProjectRowProps {
  name: string;
  meta: string;
  allAdded: boolean;
  onAddAll: () => void;
  divider: boolean;
}

export function ProjectSearchRow({ name, meta, allAdded, onAddAll, divider }: ProjectRowProps) {
  return (
    <View style={[styles.row, divider && styles.divider]}>
      <View style={styles.folder}>
        <Icon name="folder" size={20} color={c2.text.secondary} />
      </View>
      <View style={styles.main}>
        <Text v2="bodyL.semibold" numberOfLines={1}>
          {name}
        </Text>
        <Text v2="caption.regular" tone="tertiary" numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Touchable
        onPress={onAddAll}
        disabled={allAdded}
        accessibilityRole="button"
        accessibilityLabel={`${name} 현장 모두 외근 목적지에 추가`}
        style={[styles.addAll, allAdded && styles.dim]}
      >
        <Text v2="bodyS.bold" tone={allAdded ? 'tertiary' : 'link'}>
          모두 추가
        </Text>
      </Touchable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space[14] },
  divider: { borderTopWidth: 1, borderTopColor: c2.border.subtle },
  main: { flex: 1, minHeight: 64, justifyContent: 'center', gap: space[2] },
  flexText: { flexShrink: 1 },
  titleLine: { flexDirection: 'row', alignItems: 'baseline', gap: space[6] },
  tag: { flexShrink: 0 },
  iconSlot: { width: 22, alignItems: 'center' },
  folder: {
    width: 40,
    height: 40,
    borderRadius: radius2.md,
    backgroundColor: c2.bg.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addAll: { height: 44, paddingHorizontal: space[8], justifyContent: 'center' },
  dim: { opacity: 0.6 },
});
