import { Text } from 'react-native';

type BrandWordmarkProps = {
  size: number;
  color: string;
  accentColor?: string;
};

export function BrandWordmark({ size, color, accentColor }: BrandWordmarkProps) {
  return (
    <Text
      accessibilityLabel="GYM Buddy"
      style={{
        color,
        fontFamily: 'GYMBuddyDisplay',
        fontSize: size,
        lineHeight: size * 1.08,
        includeFontPadding: false,
      }}
    >
      GYM <Text style={{ color: accentColor ?? color }}>Buddy</Text>
    </Text>
  );
}