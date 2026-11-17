import {useState} from 'react';
import {Text,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useAuth} from '../src/auth';
import {Button,space} from '../src/components/ui';
import {ADMIN_LOGIN_EMAIL} from '../src/admin-entry-config';
import {useTheme} from '../src/theme';

export default function AdminAccountRequired() {
  const {user,logout}=useAuth();const {colors}=useTheme();const insets=useSafeAreaInsets();
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  return <View style={{flex:1,padding:space.xl,paddingTop:insets.top+space.xl,gap:space.lg,backgroundColor:colors.surface}}>
    <Text accessibilityRole="header" style={{fontSize:24,fontWeight:'700',color:colors.onSurface}}>Administrator account required</Text>
    <Text>You are signed in as {user?.email}. This account does not have administrator access.</Text>
    <Text>Use your assigned account: {ADMIN_LOGIN_EMAIL}</Text>
    {error?<Text accessibilityRole="alert" style={{color:colors.error}}>{error}</Text>:null}
    <Button title="Use administrator account" loading={busy} onPress={async()=>{
      setBusy(true);setError('');try{await logout();}catch{setError('Could not sign out. Please try again.');}finally{setBusy(false);}
    }}/>
  </View>;
}
