import {Text, View} from 'react-native';
import {useAuth} from '../auth';
import {ROLE_LABELS} from '../roles';
import {useTheme} from '../theme';
import {radius, space} from './ui';

export function AccountRole() {
  const {user,entryRole}=useAuth();const {colors}=useTheme();
  if(!user?.role)return null;
  return <View style={{gap:space.xs}}>
    <View style={{alignSelf:'flex-start',borderRadius:radius.pill,paddingHorizontal:space.md,paddingVertical:6,backgroundColor:colors.brandTertiary}}>
      <Text testID="account-role-label" style={{color:colors.onBrandTertiary,fontWeight:'700'}}>Signed in as {ROLE_LABELS[user.role]}</Text>
    </View>
    {entryRole&&entryRole!==user.role?<Text testID="account-role-explanation" style={{color:colors.muted,fontSize:13}}>This account is registered as {ROLE_LABELS[user.role]} and opens its saved workspace. Use a different account for another role.</Text>:null}
  </View>;
}
