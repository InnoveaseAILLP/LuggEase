import {Image, type ImageStyle, type StyleProp} from 'react-native';
import artwork from '../../assets/branding/luggease-icon.png';

// Metro returns an asset identifier; Vite returns a public image URL.
const source = typeof artwork === 'string' ? {uri: artwork} : artwork;

export function BrandIcon({size = 48, style}: {size?: number; style?: StyleProp<ImageStyle>}) {
  return <Image accessibilityLabel="LuggEase" source={source} resizeMode="cover"
    style={[{width: size, height: size, borderRadius: size * 0.22}, style]}/>;
}
