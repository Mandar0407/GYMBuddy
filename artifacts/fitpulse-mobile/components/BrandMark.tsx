import {Platform} from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

export function BrandMark({ size = 34, tile, glyph }: { size?: number; tile: string; glyph: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" {...(Platform.OS==='web'?{'aria-hidden':true}:{accessibilityElementsHidden:true,importantForAccessibility:'no-hide-descendants' as const})}>
      <Rect width={64} height={64} rx={18} fill={tile} />
      <Path d="M13 18H17Q20 18 20 21V43Q20 46 17 46H13Q10 46 10 43V21Q10 18 13 18ZM22 23H25V41H22Q20 41 20 39V25Q20 23 22 23ZM24 29H40V35H24ZM39 23H42Q44 23 44 25V39Q44 41 42 41H39ZM47 18H51Q54 18 54 21V43Q54 46 51 46H47Q44 46 44 43V21Q44 18 47 18Z" fill={glyph} />
    </Svg>
  );
}
