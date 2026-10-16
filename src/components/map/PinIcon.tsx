import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import type { MapPinKind } from '@/assets/mapPins';
import type { FieldStatus } from '@/types/entities';
import { c2 } from '@/theme/v2';

// 지도 핀을 RN 화면 위에 직접 그릴 때(지도 HTML 밖) 쓴다. 모양은 mapPins.ts(지도 안 핀)와 같다.

const FILL: Record<MapPinKind, string> = {
  pending: c2.status.pending,
  in_progress: c2.status.inProgress,
  done: c2.status.done,
  new: c2.status.new,
  search: c2.status.new,
  visited: c2.status.visited,
  skipped: c2.bg.canvas,
};

const WHITE = c2.text.inverse;

const PIN_BODY =
  'M19.2 41C17.6 37.2 6.2 28.2 6.2 16.5C6.2 13.05 7.57 9.75 10.01 7.31C12.45 4.87 15.75 3.5 19.2 3.5C22.65 3.5 25.95 4.87 28.39 7.31C30.83 9.75 32.2 13.05 32.2 16.5C32.2 28.2 20.8 37.2 19.2 41Z';

function PinGlyph({ kind }: { kind: MapPinKind }) {
  switch (kind) {
    case 'in_progress':
      return <Path d="M19.2 10.7L25.2 21.2H13.2L19.2 10.7Z" fill={WHITE} stroke={WHITE} strokeWidth={2} strokeLinejoin="round" />;
    case 'done':
      return <Path d="M14.1 16.7L17.9 20.5L25.5 12.1" stroke={WHITE} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />;
    case 'new':
      return <Circle cx={19.2} cy={16.5} r={5} fill={WHITE} />;
    case 'search':
      return (
        <>
          <Circle cx={18.2} cy={15.5} r={4.6} stroke={WHITE} strokeWidth={2.2} fill="none" />
          <Path d="M21.6 18.9L24.6 21.9" stroke={WHITE} strokeWidth={2.4} strokeLinecap="round" />
        </>
      );
    case 'skipped':
      return <Circle cx={19.2} cy={16.5} r={4.6} fill={c2.status.visited} />;
    default:
      return <Circle cx={19.2} cy={16.5} r={4.6} fill={WHITE} />;
  }
}

/** 지도 핀(Figma Pin 532:1103) 32×44 기준. width 만 주면 비율대로 커진다. 끝이 아래 가운데. */
export function MapPinIcon({ kind, width = 32 }: { kind: MapPinKind; width?: number }) {
  return (
    <Svg width={width} height={(width * 44) / 32} viewBox="3.2 0.2 32 44" fill="none">
      <Path d={PIN_BODY} fill={FILL[kind]} stroke={kind === 'skipped' ? c2.status.visited : undefined} />
      <PinGlyph kind={kind} />
    </Svg>
  );
}

const LIST_BODY =
  'M11 27.9545C9.90909 25.3636 2.13636 19.2273 2.13636 11.25C2.13636 8.89922 3.07021 6.64472 4.73246 4.98246C6.39472 3.32021 8.64922 2.38636 11 2.38636C13.3508 2.38636 15.6053 3.32021 17.2675 4.98246C18.9298 6.64472 19.8636 8.89922 19.8636 11.25C19.8636 19.2273 12.0909 25.3636 11 27.9545Z';

/** 목록 행 왼쪽 작은 상태 핀(Figma Pin/List 532:1139, 22×30). */
export function ListPin({ status }: { status: FieldStatus }) {
  return (
    <Svg width={22} height={30} viewBox="0 0 22 30" fill="none">
      <Path d={LIST_BODY} fill={FILL[status]} />
      {status === 'pending' ? (
        <Circle cx={11} cy={11.25} r={3.27} fill={WHITE} />
      ) : status === 'in_progress' ? (
        <Path d="M11 7.09091L15.2273 14.5227H6.77273L11 7.09091Z" fill={WHITE} stroke={WHITE} strokeWidth={1.36} strokeLinejoin="round" />
      ) : (
        <Path d="M7.31818 11.4545L10.0455 14.1818L15.3636 8.31818" stroke={WHITE} strokeWidth={2.18} strokeLinecap="round" strokeLinejoin="round" />
      )}
    </Svg>
  );
}
