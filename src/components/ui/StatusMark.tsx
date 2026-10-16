import React from 'react';
import Svg, { Path } from 'react-native-svg';
import type { FieldStatus } from '@/types/entities';
import { c2 } from '@/theme/v2';

export type StatusMarkStyle = 'color' | 'onBrand';

interface Props {
  status: FieldStatus;
  /** color = 상태색, onBrand = 파란 배경 위 흰색(선택된 칩·상태 버튼) */
  variant?: StatusMarkStyle;
  /** 기본 16. 필터 칩 안은 12. */
  size?: number;
}

export const STATUS_COLOR: Record<FieldStatus, string> = {
  pending: c2.status.pending,
  in_progress: c2.status.inProgress,
  done: c2.status.done,
};

export const STATUS_LABEL: Record<FieldStatus, string> = {
  pending: '조치 전',
  in_progress: '조치 중',
  done: '조치 완료',
};

/**
 * 조치 상태 기호(Figma StatusMark 532:1163): 조치 전 ● / 조치 중 ▲ / 조치 완료 원 안 ✓.
 * 색만으로 상태를 전하지 않도록 모양이 다르다(KWCAG 1.4.1).
 */
export function StatusMark({ status, variant = 'color', size = 16 }: Props) {
  const fg = variant === 'onBrand' ? c2.text.inverse : STATUS_COLOR[status];
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      {status === 'pending' ? (
        <Path
          d="M8 14.667A6.667 6.667 0 1 0 8 1.333a6.667 6.667 0 0 0 0 13.334Z"
          fill={fg}
        />
      ) : status === 'in_progress' ? (
        <Path d="M8 1.778 14.667 13.778H1.333L8 1.778Z" fill={fg} stroke={fg} strokeWidth={1.422} strokeLinejoin="round" />
      ) : (
        <>
          <Path d="M8 15.111A7.111 7.111 0 1 0 8 .889a7.111 7.111 0 0 0 0 14.222Z" fill={fg} />
          <Path
            d="M4.622 8.267 6.933 10.489 11.378 5.689"
            stroke={variant === 'onBrand' ? c2.text.link : c2.text.inverse}
            strokeWidth={1.956}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </Svg>
  );
}
