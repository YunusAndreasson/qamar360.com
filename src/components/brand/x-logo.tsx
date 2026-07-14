import Svg, { Path } from 'react-native-svg';

/**
 * The X (formerly Twitter) mark as a monochrome SVG so it takes the theme colour and stays crisp at
 * any size. Like {@link GoogleLogo}, third-party marks live as dedicated brand assets — never in the
 * app's `Icons` registry, which holds only SF Symbols / Material glyphs.
 */
export function XLogo({ size = 20, color = '#000' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.657l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
      />
    </Svg>
  );
}
