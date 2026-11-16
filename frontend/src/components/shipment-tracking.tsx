import {useEffect,useRef,useState} from 'react';
import {AppState,Text} from 'react-native';
import {useQuery} from '@tanstack/react-query';
import {api} from '@/src/api';
import {Button,Card,SectionTitle,space,useToast} from '@/src/components/ui';
import {ShipmentMap} from './shipment-map';
import {watchShipmentLocation} from '@/src/location';
import {useTheme} from '@/src/theme';
import {useAuth} from '@/src/auth';
import type {Order} from '@/src/types';
export type TrackingPoint={latitude:number;longitude:number;received_at:string;accuracy:number};
export function ShipmentTracking({order,compact=false}:{order:Order;compact?:boolean}){
 const {user}=useAuth(),{colors}=useTheme(),toast=useToast();
 const [open,setOpen]=useState(false),[sharing,setSharing]=useState(false),[starting,setStarting]=useState(false),[trackingError,setTrackingError]=useState('');
 const stop=useRef<(()=>void)|null>(null),last=useRef(0),alive=useRef(true),allowed=useRef(false);
 const inTransit=order.status==='in_transit';
 const canShare=user?.user_id===order.partner_id&&inTransit;
 const canShareNow=useRef(canShare);canShareNow.current=canShare;
 const {data,isError}=useQuery({queryKey:['tracking',order.order_id],queryFn:()=>api<{points:TrackingPoint[];stale:boolean;note:string}>(`/orders/${order.order_id}/tracking`),enabled:open&&inTransit,refetchInterval:10000});
 const stopSharing=()=>{allowed.current=false;stop.current?.();stop.current=null;setSharing(false);};
 useEffect(()=>{alive.current=true;const sub=AppState.addEventListener('change',state=>{if(state!=='active'){allowed.current=false;stop.current?.();stop.current=null;setSharing(false);}});return()=>{alive.current=false;allowed.current=false;stop.current?.();sub.remove();};},[]);
 useEffect(()=>{if(!canShare)stopSharing();if(!inTransit)setOpen(false);},[canShare,inTransit]);
 const start=async()=>{
  setStarting(true);setTrackingError('');
  try{
   const cancel=await watchShipmentLocation(async point=>{
    if(!alive.current||!canShareNow.current||!allowed.current||Date.now()-last.current<15000)return;
    last.current=Date.now();
    try{await api(`/orders/${order.order_id}/tracking`,{body:point});setTrackingError('');}
    catch(e:any){setTrackingError(e.message);}
   },message=>{if(alive.current)setTrackingError(message);});
   if(!alive.current||!canShareNow.current||AppState.currentState!=='active'){cancel();return;}
   stop.current=cancel;allowed.current=true;last.current=0;setSharing(true);setOpen(true);
  }catch(e:any){toast(e.message,'error');}finally{if(alive.current)setStarting(false);}
 };
 const latest=data?.points.at(-1);
 return <Card style={{gap:space.sm}} testID={`shipment-tracking-${order.order_id}`}>
  {!compact?<SectionTitle>Shipment tracking</SectionTitle>:null}
  {order.delivery_estimate?<Text style={{color:colors.onSurface}}>Expected delivery: {new Date(order.delivery_estimate.expected_delivery_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST{order.delivery_estimate.reason?` · ${order.delivery_estimate.reason}`:''}</Text>:<Text style={{color:colors.muted}}>Delivery estimate awaiting route / partner confirmation.</Text>}
  {inTransit?<Button compact variant="outline" title={open?'Hide live map':'Show live delivery map'} onPress={()=>setOpen(!open)}/>:<Text style={{color:colors.muted}}>Live map becomes available when the shipment is In transit.</Text>}
  {open&&inTransit?<>
   {data?.points.length?<ShipmentMap points={data.points}/>:<Text style={{color:colors.muted}}>{isError?'Unable to load shipment locations. Please try again.':'No location shared yet. The partner starts sharing while the shipment is In transit.'}</Text>}
   {latest?<Text style={{color:colors.muted}}>Last report: {new Date(latest.received_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST · accuracy ±{Math.round(latest.accuracy)} m · {latest.latitude.toFixed(5)}, {latest.longitude.toFixed(5)}</Text>:null}
   {data?.stale?<Text style={{color:colors.muted}}>Location is stale or unavailable. This is not a live position.</Text>:null}
   <Text style={{color:colors.muted,fontSize:12}}>Recent device-reported route. Updates require the partner tracking screen to stay open; sharing stops when the app is backgrounded or the screen closes.</Text>
  </>:null}
  {canShare?<Button title={sharing?'Stop sharing my delivery location':'Share my delivery location'} loading={starting} onPress={sharing?stopSharing:start}/>:null}
  {trackingError?<Text accessibilityRole="alert" style={{color:colors.muted}}>{trackingError}</Text>:null}
 </Card>;
}
