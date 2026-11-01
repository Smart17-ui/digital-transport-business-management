import Svg, { Path } from 'react-native-svg';
import { colors } from '@/lib/theme';

const PATHS = {
  arrowDown: 'M12 5v14M5 12l7 7 7-7',
  arrowRight: 'M5 12h14M12 5l7 7-7 7',
  arrowUp: 'M12 19V5M5 12l7-7 7 7',
  backspace: 'M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1ZM17 9.5l-5 5M12 9.5l5 5',
  bus: 'M6 18v2M18 18v2M5 18h14a1 1 0 0 0 1-1V6a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v11a1 1 0 0 0 1 1ZM4 11h16M8 15h.01M16 15h.01',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  chevronRight: 'M9 5l7 7-7 7',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7.5V12l3 2',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 11v5M12 8h.01',
  offline: 'M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5-2.8M19 13a10 10 0 0 0-3-2.1M2 8.8a15 15 0 0 1 4.2-2.7M22 8.8A15 15 0 0 0 11 4.9M12 20h.01',
  warning: 'M12 4 2.5 20h19L12 4ZM12 10v4.5M12 17.5h.01',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 24, color = colors.text }: { name: IconName; size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={PATHS[name]} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
