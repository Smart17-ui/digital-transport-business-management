import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Rect } from 'react-native-svg';
import { brand, space } from '@/lib/theme';

export function Logo({ size = 72 }: { size?: number }) {
  return (
    <View style={styles.logo} accessible accessibilityRole="image" accessibilityLabel="Digital Transport">
      <Svg width={size} height={size} viewBox="0 0 196 196">
        <Rect width={196} height={196} rx={40} fill={brand.dark} />
        <G transform="translate(44 51.5)">
          <Rect width={108} height={19} rx={9.5} fill={brand.coral} />
          <Rect y={27} width={83} height={19} rx={9.5} fill={brand.light} />
          <Rect y={54} width={108} height={19} rx={9.5} fill={brand.coral} />
          <Wheel x={25} />
          <Wheel x={83} />
        </G>
      </Svg>
      <Text style={styles.wordmark}>
        digital<Text style={styles.wordmarkAccent}>transport</Text>
      </Text>
    </View>
  );
}

function Wheel({ x }: { x: number }) {
  return (
    <>
      <Circle cx={x} cy={83} r={14} fill={brand.dark} />
      <Circle cx={x} cy={83} r={10} fill={brand.light} />
    </>
  );
}

const styles = StyleSheet.create({
  logo: { alignItems: 'center', gap: space(3) },
  wordmark: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5, color: brand.wordmarkDark },
  wordmarkAccent: { color: brand.wordmarkCoral },
});
