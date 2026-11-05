import { StyleSheet, View } from 'react-native';
import Svg, { Path, Polygon, Rect } from 'react-native-svg';
import { Text } from '@/components/text';
import { brand, space, themedStyles } from '@/lib/theme';

/** A D with a road running through it. The app icons are drawn from the same shapes. */
export function LogoMark({ size = 72 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect width={100} height={100} rx={20} fill={brand.dark} />
      <Path
        fillRule="evenodd"
        d="M22 18H46A32 32 0 0 1 46 82H22ZM33 30V70H52A20 20 0 0 0 52 30Z"
        fill={brand.green}
      />
      <Polygon points="39,82 61,82 52.5,30 47.5,30" fill={brand.light} />
      <Rect x={49.4} y={33} width={1.2} height={5} fill={brand.dark} />
      <Rect x={49} y={44} width={2} height={8} fill={brand.dark} />
      <Rect x={48.5} y={59} width={3} height={13} fill={brand.dark} />
    </Svg>
  );
}

/** A road running to the horizon, faint behind the dark welcome screens. */
export function RoadBackdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Polygon points="58,100 100,100 100,78 66,30 63,30" fill={brand.light} fillOpacity={0.05} />
        <Rect x={72.5} y={84} width={1.6} height={16} fill={brand.light} fillOpacity={0.14} />
        <Rect x={69.8} y={64} width={1.1} height={11} fill={brand.light} fillOpacity={0.14} />
        <Rect x={67.7} y={48} width={0.8} height={8} fill={brand.light} fillOpacity={0.14} />
        <Rect x={66.1} y={36} width={0.5} height={5} fill={brand.light} fillOpacity={0.14} />
      </Svg>
    </View>
  );
}

/** The mark with the name beside it, for dark backgrounds. */
export function Logo({ size = 56 }: { size?: number }) {
  return (
    <View style={styles.logo} accessible accessibilityRole="image" accessibilityLabel="Digital Transport">
      <LogoMark size={size} />
      <View>
        <Text style={styles.wordmark}>DIGITAL</Text>
        <Text style={styles.wordmark}>TRANSPORT</Text>
      </View>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  logo: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  wordmark: { fontSize: 17, lineHeight: 21, fontWeight: '700', letterSpacing: 2, color: brand.light },
}));
