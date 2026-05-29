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

export const elevation = {
  none: make(0, 0, 0, 0),
  card: make(1, 0.04, 6, 1),
  raised: make(2, 0.08, 12, 3),
  sheet: make(0, 0.12, 24, 8),
  modal: make(4, 0.18, 32, 16),
} as const;
