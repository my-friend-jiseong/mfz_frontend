import { Platform } from 'react-native';
import { colors } from './colors';

type Elevation = {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
};

const make = (
  offsetY: number,
  opacity: number,
  radius: number,
  android: number,
): Elevation =>
  Platform.select({
    web: {
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: offsetY },
      shadowOpacity: opacity,
      shadowRadius: radius,
      elevation: 0,
    },
    default: {
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: offsetY },
      shadowOpacity: opacity,
      shadowRadius: radius,
      elevation: android,
    },
  }) as Elevation;

// Depth 전략 — 하나만 쓴다.
//   문서 흐름 안의 표면(Card·목록·폼)  → 테두리. elevation 을 쓰지 않는다.
//   지도 위에 떠 있는 chrome           → elevation. 실제로 떠 있으니 그림자가 의미를 가진다.
//     (MapDashboard · MapSearchBar · MapFilterBar · MapLegend · KakaoMapWebView)
// 'sheet' 는 callsite 0 — 바텀시트 그림자는 gorhom 이 자체 처리하므로 제거했다.
export const elevation = {
  none: make(0, 0, 0, 0),
  card: make(1, 0.04, 6, 1),
  raised: make(2, 0.08, 12, 3),
  modal: make(4, 0.18, 32, 16),
} as const;
