export const BRAND_GLYPH_PATH = 'M13 18H17Q20 18 20 21V43Q20 46 17 46H13Q10 46 10 43V21Q10 18 13 18ZM22 23H25V41H22Q20 41 20 39V25Q20 23 22 23ZM24 29H40V35H24ZM39 23H42Q44 23 44 25V39Q44 41 42 41H39ZM47 18H51Q54 18 54 21V43Q54 46 51 46H47Q44 46 44 43V21Q44 18 47 18Z';

export function BrandMark({ size = 34, tile = '#d6e66b', glyph = '#302b28', className }: { size?: number; tile?: string; glyph?: string; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="18" fill={tile} />
      <path d={BRAND_GLYPH_PATH} fill={glyph} />
    </svg>
  );
}
