import {shareShipmentPosition} from '@/src/shipment-location';
import {getErrorMessage} from '@/src/errors';
import {useEffect,useRef,useState} from 'react';
import {ActivityIndicator,AppState,Text} from 'react-native';
import {useQuery} from '@tanstack/react-query';
import {api} from '@/src/api';
import {Button,Card,SectionTitle,space,useToast} from '@/src/components/ui';
import {ShipmentMap} from './shipment-map';
import {watchShipmentLocation,type Position} from '@/src/location';
import {useTheme} from '@/src/theme';
import {useAuth} from '@/src/auth';
import type {Order} from '@/src/types';
export type TrackingPoint={latitude:number;longitude:number;received_at:string;accuracy:number};
export function ShipmentTracking({order,compact=false}:{order:Order;compact?:boolean}){
 const {user}=useAuth(),{colors}=useTheme(),toast=useToast();
 const inTransit=order.status==='in_transit',customer=user?.user_id===order.customer_id;
 const canShare=user?.user_id===order.partner_id&&inTransit;
 const [open,setOpen]=useState(inTransit&&customer),[sharing,setSharing]=useState(false),[starting,setStarting]=useState(false),[trackingError,setTrackingError]=useState(''),[confirmed,setConfirmed]=useState(false);
 const stop=useRef<(()=>void)|null>(null),last=useRef(0),alive=useRef(true),allowed=useRef(false),generation=useRef(0),appState=useRef(AppState.currentState),queued=useRef<Position|null>(null),emit=useRef<((point:Position)=>Promise<void>)|null>(null);
 const canShareNow=useRef(canShare);canShareNow.current=canShare;
 const {data,isError,isLoading,refetch}=useQuery({queryKey:['tracking',order.order_id,user?.user_id],queryFn:()=>api<{points:TrackingPoint[];stale:boolean;note:string}>(`/orders/${order.order_id}/tracking`),enabled:open&&inTransit,refetchInterval:10000,staleTime:0,refetchOnMount:'always'});
 const stopSharing=()=>{generation.current++;allowed.current=false;queued.current=null;emit.current=null;stop.current?.();stop.current=null;if(alive.current){setSharing(false);setStarting(false);setConfirmed(false);}};
 useEffect(()=>{
  alive.current=true;
  const sub=AppState.addEventListener('change',state=>{
   appState.current=state;
   if(state==='background')stopSharing();
   else if(state==='active'&&queued.current&&emit.current)void emit.current(queued.current);
  });
  return()=>{alive.current=false;stopSharing();sub.remove();};
 },[]);
 useEffect(()=>()=>{stopSharing();},[order.order_id,user?.user_id]);
 useEffect(()=>{if(!canShare)stopSharing();if(!inTransit)setOpen(false);else if(customer)setOpen(true);},[canShare,inTransit,customer,order.order_id]);
 const start=async(retry=false)=>{
  if(starting||(sharing&&!retry)||!canShareNow.current)return;
  const session=++generation.current;allowed.current=true;last.current=0;
  setStarting(true);setTrackingError('');setConfirmed(false);
  const current=()=>alive.current&&allowed.current&&canShareNow.current&&generation.current===session;
  let posting=false;
  const send=async(point:Position)=>{
   if(!current())return;
   if(!Number.isFinite(point.accuracy)||point.accuracy<0||point.accuracy>250){setTrackingError('Your location is too approximate to share. Enable precise location on your phone and move to an open area.');return;}
   if(appState.current!=='active'){queued.current=point;return;}
   queued.current=null;
   if(posting||Date.now()-last.current<15000)return;
   posting=true;last.current=Date.now();
   try{
    await shareShipmentPosition(order.order_id,point);
    if(current()){setTrackingError('');setConfirmed(true);void refetch?.();}
   }catch(error){if(current()){setConfirmed(false);setTrackingError(getErrorMessage(error));}}
   finally{posting=false;}
  };
  emit.current=send;
  try{
   const cancel=await watchShipmentLocation(point=>{void send(point);},(message,fatal)=>{if(current()){setTrackingError(message);if(fatal)stopSharing();}});
   if(!current()||appState.current==='background'){cancel();return;}
   stop.current=cancel;setSharing(true);setOpen(true);
  }catch(error){if(current()){stopSharing();setTrackingError(getErrorMessage(error));toast(getErrorMessage(error),'error');}}
  finally{if(alive.current&&generation.current===session)setStarting(false);}
 };
 const latest=data?.points.at(-1);
 return <Card style={{gap:space.sm}} testID={`shipment-tracking-${order.order_id}`}>
  {!compact?<SectionTitle>Shipment tracking</SectionTitle>:null}
  {order.delivery_estimate?<Text style={{color:colors.onSurface}}>Expected delivery: {new Date(order.delivery_estimate.expected_delivery_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST{order.delivery_estimate.reason?` · ${order.delivery_estimate.reason}`:''}</Text>:<Text style={{color:colors.muted}}>Delivery estimate awaiting route / partner confirmation.</Text>}
  {inTransit?<Button compact variant="outline" title={open?'Hide live map':'Show live delivery map'} onPress={()=>setOpen(!open)}/>:<Text style={{color:colors.muted}}>Live map becomes available when the shipment is In transit.</Text>}
  {open&&inTransit?<>
   {data?.points.length?<ShipmentMap points={data.points}/>:isLoading?<><ActivityIndicator color={colors.brandPrimary}/><Text style={{color:colors.muted}}>Loading shared delivery location…</Text></>:<Text style={{color:colors.muted}}>{isError?'Unable to load shipment locations. Please try again.':'Waiting for the partner’s first GPS location. The map will appear automatically when it is received.'}</Text>}
   {latest?<Text style={{color:colors.muted}}>Last report: {new Date(latest.received_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST · accuracy ±{Math.round(latest.accuracy)} m · {latest.latitude.toFixed(5)}, {latest.longitude.toFixed(5)}</Text>:null}
   {latest&&data?.stale?<Text accessibilityRole="alert" style={{color:colors.warning}}>Showing the last shared location. Live updates have paused; the partner needs to reopen the tracking screen and share again.</Text>:null}
   <Text style={{color:colors.muted,fontSize:12}}>For ongoing updates, the partner must stay signed in with this tracking screen open on their phone. Switching accounts, closing the screen or backgrounding the app stops sharing. The customer can view from a separate device.</Text>
  </>:null}
  {canShare?<>
   <Button title={sharing?'Stop sharing my delivery location':'Share my delivery location'} loading={starting} onPress={sharing?stopSharing:()=>{void start();}}/>
   {sharing?<Text accessibilityRole="status" style={{color:colors.muted}}>{confirmed?'Your location was sent to the customer. Keep this screen open for live updates.':'Waiting for a precise GPS fix. No new location has been confirmed as shared yet.'}</Text>:null}
  </>:null}
  {trackingError?<><Text accessibilityRole="alert" style={{color:colors.error}}>{trackingError}</Text>{canShare&&sharing?<Button variant="outline" title="Retry location" onPress={()=>{stopSharing();void start(true);}}/>:null}</>:null}
 </Card>;
}
