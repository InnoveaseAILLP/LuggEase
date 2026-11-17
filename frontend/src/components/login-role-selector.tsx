import {Pressable, Text, View} from 'react-native';
import {ROLE_DESCRIPTIONS, ROLE_LABELS} from '../roles';
import type {Role} from '../types';
import {makeStyles, useTheme} from '../theme';
import {Icon, radius, space} from './ui';

export function LoginRoleSelector({role, onChange, disabled}: {role:Exclude<Role,'admin'>;onChange:(role:Exclude<Role,'admin'>)=>void;disabled:boolean}) {
  const s=useStyles();const {colors}=useTheme();
  return <View style={{gap:space.sm}}>
    <Text style={s.heading}>Continue as</Text>
    <View accessibilityRole="radiogroup" accessibilityLabel="Account type" style={s.options}>
      {(['customer','partner'] as const).map(value=><Pressable key={value}
        testID={`login-role-${value}`} accessibilityRole="radio" accessibilityLabel={ROLE_LABELS[value]}
        accessibilityState={{selected:value===role,checked:value===role,disabled}} aria-checked={value===role} disabled={disabled}
        onPress={()=>onChange(value)} style={[s.option,value===role&&s.selected]}>
        <Icon name={value==='customer'?'package-variant-closed':'truck-delivery-outline'} size={24} color={value===role?colors.brandPrimary:colors.muted}/>
        <Text style={[s.label,value===role&&{color:colors.brandPrimary}]}>{ROLE_LABELS[value]}</Text>
      </Pressable>)}
    </View>
    <Text style={s.description}>{ROLE_DESCRIPTIONS[role]}</Text>
    <Text style={s.note}>Existing accounts open their saved role. New accounts confirm their account type after verification.</Text>
  </View>;
}
const useStyles=makeStyles(c=>({
  heading:{fontSize:16,fontWeight:'700',color:c.onSurface},options:{flexDirection:'row',gap:space.sm},
  option:{flex:1,padding:space.md,borderWidth:1.5,borderColor:c.border,borderRadius:radius.md,alignItems:'center',gap:space.xs,backgroundColor:c.surfaceSecondary},
  selected:{borderColor:c.brandPrimary,backgroundColor:c.brandTertiary},
  label:{fontSize:13,fontWeight:'700',color:c.onSurface,textAlign:'center'},
  description:{fontSize:13,color:c.onSurface},note:{fontSize:12,color:c.muted,lineHeight:18},
}));
