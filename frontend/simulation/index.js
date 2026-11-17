import 'react-native-gesture-handler';
import React,{useState} from 'react';
import {AppRegistry,Pressable,Text,View} from 'react-native';
import {SafeAreaProvider,SafeAreaView} from 'react-native-safe-area-context';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {QueryClient,QueryClientProvider,useQueryClient} from '@tanstack/react-query';
import Orders from '../app/(tabs)/orders';
import {SimulationRole} from './auth';
import {advance} from './data';
import {ToastProvider} from '../src/components/ui';
const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
function Screen(){const [role,setRole]=useState('customer');const qc=useQueryClient();return <SimulationRole.Provider value={role}><SafeAreaView style={{flex:1,backgroundColor:'#FFF7ED'}} edges={['top','bottom']}><Text style={{padding:6,textAlign:'center',fontWeight:'800',color:'#9A3412'}}>LuggEase · SIMULATION · No real delivery</Text><View style={{flexDirection:'row',justifyContent:'space-around',padding:8}}>{['customer','partner'].map(value=><Pressable key={value} accessibilityRole="button" onPress={()=>setRole(value)} style={{padding:12,borderRadius:12,backgroundColor:role===value?'#CC5500':'#FFE8D6'}}><Text style={{color:role===value?'white':'#7C2D12'}}>{value==='customer'?'Customer view':'Delivery Partner'}</Text></Pressable>)}<Pressable accessibilityRole="button" onPress={()=>{advance();qc.invalidateQueries({queryKey:['tracking']});}} style={{padding:12}}><Text>Move parcel</Text></Pressable></View><View key={role} style={{flex:1}}><Orders/></View></SafeAreaView></SimulationRole.Provider>;}
function App(){return <GestureHandlerRootView style={{flex:1}}><SafeAreaProvider><QueryClientProvider client={client}><ToastProvider><Screen/></ToastProvider></QueryClientProvider></SafeAreaProvider></GestureHandlerRootView>;}
AppRegistry.registerComponent('LuggEase',()=>App);
