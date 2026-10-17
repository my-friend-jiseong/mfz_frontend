import React, { useCallback, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppSheet } from '@/components/ui/AppSheet';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { STATUS_LABEL } from '@/components/ui/StatusMark';
import { STATUS_TONE } from '@/components/trips/TripStopRow';
import { ListPin } from '@/components/map/PinIcon';
import { Icon } from '@/components/icons';
import type { FieldStatus } from '@/types/entities';
import { c2, space } from '@/theme/v2';

export interface ClusterItem {
  id: string;
  label: string;
  /** 상태 뒤 회색 글(구·동 등). */
  sublabel?: string;
  pin?: string;
}

interface Props {
  /** null 이면 닫힘. */
  items: ClusterItem[] | null;
  onClose: () => void;
  /** 행을 고르면 시트가 다 내려간 뒤 부른다 — 닫기와 화면 이동이 같은 틱에 겹치지 않게. */
  onPick: (id: string) => void;
}

function statusOf(pin?: string): FieldStatus | null {
  return pin === 'pending' || pin === 'in_progress' || pin === 'done' ? pin : null;
}

/** 지도에서 겹친 핀 묶음을 누르면 뜨는 현장 고르기 시트. 4 현장 검색 행과 같은 모양(작은 상태 핀·이름·상태). */
export function MapClusterSheet({ items, onClose, onPick }: Props) {
  const picked = useRef<string | null>(null);
  const handleClose = useCallback(() => {
    const id = picked.current;
    picked.current = null;
    onClose();
    if (id) onPick(id);
  }, [onClose, onPick]);
  const open = items !== null;
  // 닫히는 동안에도 목록을 그대로 보이게 마지막 목록을 붙잡아 둔다.
  const last = useRef<ClusterItem[]>([]);
  if (items) last.current = items;
  const list = items ?? last.current;

  return (
    <AppSheet open={open} onClose={handleClose} title={`이 근처 현장 ${list.length}곳`} scrollable>
      <View style={styles.list}>
        {list.map((m, i) => {
          const status = statusOf(m.pin);
          return (
            <Touchable
              key={m.id}
              onPress={() => {
                picked.current = m.id;
                onClose();
              }}
              accessibilityRole="button"
              accessibilityLabel={status ? `${m.label}, ${STATUS_LABEL[status]}` : m.label}
              style={[styles.row, i > 0 && styles.divider]}
            >
              {status ? <ListPin status={status} /> : null}
              <View style={styles.main}>
                <Text v2="bodyL.semibold" numberOfLines={1}>
                  {m.label || '현장'}
                </Text>
                {status || m.sublabel ? (
                  <Text v2="caption.regular" tone="tertiary" numberOfLines={1}>
                    {status ? (
                      <Text v2="caption.semibold" tone={STATUS_TONE[status]}>
                        {STATUS_LABEL[status]}
                      </Text>
                    ) : null}
                    {m.sublabel ? `${status ? ' ' : ''}${m.sublabel}` : ''}
                  </Text>
                ) : null}
              </View>
              <Icon name="chevron-right" size={20} color={c2.text.tertiary} />
            </Touchable>
          );
        })}
      </View>
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space[20] },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space[14] },
  divider: { borderTopWidth: 1, borderTopColor: c2.border.subtle },
  main: { flex: 1, gap: space[2] },
});
