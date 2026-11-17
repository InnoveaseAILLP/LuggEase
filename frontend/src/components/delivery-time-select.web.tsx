import {Text,View} from 'react-native';
import {useTheme} from '@/src/theme';
import {DELIVERY_HOURS,DELIVERY_MINUTES,type DeliveryTimeSelectProps} from './delivery-time-options';
export function DeliveryTimeSelect({value,onChange,disabled=false}:DeliveryTimeSelectProps){
 const {colors}=useTheme();const [hour,minute]=value.split(':');
 const style={width:'100%',minHeight:48,border:`1px solid ${colors.border}`,borderRadius:12,backgroundColor:colors.surfaceSecondary,color:colors.onSurface,padding:'10px 12px',fontSize:16,fontFamily:'inherit'};
 return <View style={{gap:8}}>
  <Text style={{color:colors.onSurface,fontSize:14,fontWeight:'600'}}>Delivery time (India time)</Text>
  <View style={{flexDirection:'row',gap:12}}>
   <View style={{flex:1,gap:4}}><Text style={{color:colors.muted,fontSize:12}}>Hour (24-hour)</Text>
    <select data-testid="delivery-revision-hour" aria-label="Delivery hour (India time)" value={hour} disabled={disabled} style={style} onChange={event=>onChange(`${event.target.value}:${minute}`)}>{DELIVERY_HOURS.map(h=><option key={h} value={h}>{h}</option>)}</select>
   </View>
   <View style={{flex:1,gap:4}}><Text style={{color:colors.muted,fontSize:12}}>Minute</Text>
    <select data-testid="delivery-revision-minute" aria-label="Delivery minute (India time)" value={minute} disabled={disabled} style={style} onChange={event=>onChange(`${hour}:${event.target.value}`)}>{DELIVERY_MINUTES.map(m=><option key={m} value={m}>{m}</option>)}</select>
   </View>
  </View>
 </View>;
}
