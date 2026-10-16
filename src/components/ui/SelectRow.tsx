import React, { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icons';
import { c2, radius2, space } from '@/theme/v2';
import { Text } from './Text';
import { Touchable } from './Touchable';

interface Props {
  title: string;
  /** 예: '현장 12곳', '현장 12곳 · 지금 속한 프로젝트' */
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
  /** check = 여러 개(5-6 분류), radio = 하나만(5-3 프로젝트·9-10) */
  mode?: 'check' | 'radio';
  /** 행 오른쪽 ⋯(5-7 이름 변경·삭제). 넘기면 보인다. anchor 는 ⋯ 버튼 — 팝오버 메뉴 위치용. */
  onMore?: (anchor: View | null) => void;
  /** 목록 첫 행 — 위 구분선을 그리지 않는다. */
  first?: boolean;
  /** 이름 자리에 다른 것을 그릴 때(5-8 행 안 이름 변경 입력칸). */
  children?: React.ReactNode;
}

/** 시트 안 고르기 행(Figma 5-3·5-6·9-10). 64 높이, 체크 24, 이름 Body L, 보조 Caption. */
export function SelectRow({ title, subtitle, selected, onPress, mode = 'check', onMore, first, children }: Props) {
  const moreRef = useRef<View>(null);
  return (
    <View style={[styles.row, !first && styles.divider]}>
      {children ?? (
        <Touchable
          onPress={onPress}
          accessibilityRole={mode === 'radio' ? 'radio' : 'checkbox'}
          accessibilityState={{ checked: selected }}
          accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
          style={styles.main}
        >
          {mode === 'radio' ? (
            <View style={[styles.radio, selected ? styles.radioOn : styles.boxOff]}>
              {selected ? <View style={styles.radioDot} /> : null}
            </View>
          ) : (
            <View style={[styles.check, selected ? styles.checkOn : styles.boxOff]}>
              {selected ? <Icon name="check" size={15} color={c2.text.inverse} /> : null}
            </View>
          )}
          <View style={styles.texts}>
            <Text v2={selected ? 'bodyL.bold' : 'bodyL.semibold'} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text v2="caption.regular" tone="tertiary" numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </Touchable>
      )}
      {onMore ? (
        <Touchable
          ref={moreRef}
          onPress={() => onMore(moreRef.current)}
          accessibilityRole="button"
          accessibilityLabel={`${title} 더보기`}
          style={styles.more}
        >
          <Icon name="more" size={22} color={c2.text.tertiary} />
        </Touchable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center' },
  divider: { borderTopWidth: 1, borderTopColor: c2.border.subtle },
  main: { flex: 1, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space[14] },
  texts: { flex: 1, gap: space[2] },
  check: { width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: c2.bg.brand },
  boxOff: { borderWidth: 2, borderColor: c2.border.mutedStrong },
  radio: { width: 24, height: 24, borderRadius: radius2.full, alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: c2.bg.brand },
  radioDot: { width: 8, height: 8, borderRadius: radius2.full, backgroundColor: c2.bg.canvas },
  // ⋯ 아이콘 중심이 행 오른쪽 끝에서 12 안쪽(Figma 5-6) — 44 상자를 10 만큼 밖으로 뺀다.
  more: { width: 44, height: 44, marginRight: -10, alignItems: 'center', justifyContent: 'center' },
});
