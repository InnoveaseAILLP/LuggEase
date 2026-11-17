import {useState} from 'react';
import {FlatList,Modal,Pressable,StyleSheet,Text,View} from 'react-native';
import {useTheme} from '@/src/theme';
import {DELIVERY_HOURS,DELIVERY_MINUTES,type DeliveryTimeSelectProps} from './delivery-time-options';
export function DeliveryTimeSelect({value,onChange,disabled=false}:DeliveryTimeSelectProps){
 const {colors}=useTheme();const [part,setPart]=useState<'hour'|'minute'|null>(null);const [hour,minute]=value.split(':');
 const values=part==='hour'?DELIVERY_HOURS:DELIVERY_MINUTES,selected=part==='hour'?hour:minute;
 return <View style={{gap:8}}>
  <Text style={{color:colors.onSurface,fontSize:14,fontWeight:'600'}}>Delivery time (India time)</Text>
  <View style={{flexDirection:'row',gap:12}}>
   {(['hour','minute'] as const).map(key=><View key={key} style={{flex:1,gap:4}}>
    <Text style={{color:colors.muted,fontSize:12}}>{key==='hour'?'Hour (24-hour)':'Minute'}</Text>
    <Pressable testID={`delivery-revision-${key}`} accessibilityRole="button" accessibilityLabel={`Delivery ${key} (India time)`} accessibilityValue={{text:key==='hour'?hour:minute}} accessibilityState={{disabled,expanded:part===key}} disabled={disabled} onPress={()=>setPart(key)} style={{minHeight:48,borderWidth:1,borderColor:colors.border,borderRadius:12,backgroundColor:colors.surfaceSecondary,paddingHorizontal:14,flexDirection:'row',alignItems:'center',justifyContent:'space-between',opacity:disabled?0.5:1}}>
     <Text style={{fontSize:16,color:colors.onSurface}}>{key==='hour'?hour:minute}</Text><Text style={{color:colors.muted}}>⌄</Text>
    </Pressable>
   </View>)}
  </View>
  <Modal visible={!!part} transparent animationType="fade" onRequestClose={()=>setPart(null)}>
   <View style={{flex:1,justifyContent:'center',padding:24,backgroundColor:'rgba(0,0,0,0.35)'}}>
    <Pressable accessibilityRole="button" accessibilityLabel="Close time selection" onPress={()=>setPart(null)} style={StyleSheet.absoluteFill}/>
    <View accessibilityViewIsModal style={{backgroundColor:colors.surfaceSecondary,borderRadius:16,padding:16,maxHeight:430}}>
     <Text accessibilityRole="header" style={{fontSize:18,fontWeight:'700',color:colors.onSurface,marginBottom:12}}>Select delivery {part}</Text>
     <FlatList testID="delivery-time-options-list" key={part} data={values} keyExtractor={item=>item} style={{height:320,flexGrow:0}} initialScrollIndex={Math.max(0,values.indexOf(selected)-3)} getItemLayout={(_,index)=>({length:44,offset:44*index,index})} renderItem={({item})=><Pressable testID={`delivery-${part}-option-${item}`} accessibilityRole="button" accessibilityState={{selected:item===selected}} onPress={()=>{if(part==='hour')onChange(`${item}:${minute}`);else onChange(`${hour}:${item}`);setPart(null);}} style={{height:44,justifyContent:'center',paddingHorizontal:12,borderRadius:8,backgroundColor:item===selected?colors.brandSecondary:colors.surfaceSecondary}}><Text style={{fontSize:16,color:colors.onSurface}}>{item}</Text></Pressable>}/>
    </View>
   </View>
  </Modal>
 </View>;
}
