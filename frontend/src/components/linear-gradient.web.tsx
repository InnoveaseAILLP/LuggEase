import {View, ViewProps} from 'react-native';
export function LinearGradient({colors, style, ...props}: ViewProps & {colors: (string | number)[]}) {
  return <View {...props} style={[style, {backgroundImage:`linear-gradient(${colors.join(',')})`} as any]}/>;
}
