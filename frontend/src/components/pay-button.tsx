import {useState} from 'react';
import {Modal,Pressable,Text,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {WebView} from 'react-native-webview';
import {api} from '@/src/api';
import {Button,Icon,radius,space,useToast} from '@/src/components/ui';
import {useTheme} from '@/src/theme';

type Checkout={key_id:string;razorpay_order_id:string;amount:number;currency:string;order_id:string;stage?:string;name:string;email:string;contact:string};
export function PayButton({orderId,amountLabel,onDone,stage,disabled=false}:{orderId:string;amountLabel:string;onDone:()=>void;stage?:'advance'|'balance';disabled?:boolean}){
 const [html,setHtml]=useState<string|null>(null),[busy,setBusy]=useState(false);
 const toast=useToast(),insets=useSafeAreaInsets(),{colors}=useTheme();
 const close=(message?:string,kind:'success'|'error'|'info'='info')=>{setHtml(null);setBusy(false);if(message)toast(message,kind);onDone();};
 const start=async()=>{
  setBusy(true);
  try{
   const o=await api<Checkout>('/payments/create',{body:{order_id:orderId,stage}});
   const options=JSON.stringify({key:o.key_id,amount:o.amount,currency:o.currency,name:'LuggEase',description:`${o.stage??'Order'} payment — ${o.order_id}`,order_id:o.razorpay_order_id,prefill:{name:o.name,email:o.email,contact:o.contact},theme:{color:'#CC5500'}}).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
   // Firebase credentials stay in the app's API transport, never in this payment document.
   setHtml(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><p>Opening secure Razorpay checkout…</p><script src="https://checkout.razorpay.com/v1/checkout.js"></script><script>function send(type,data){window.ReactNativeWebView.postMessage(JSON.stringify({type,data}))}try{var options=${options};options.handler=function(receipt){send('receipt',receipt)};options.modal={ondismiss:function(){send('dismissed')}};var r=new Razorpay(options);r.on('payment.failed',function(){send('failed')});r.open()}catch(e){send('failed')}</script></body></html>`);
  }catch(e:any){toast(e.message,'error');setBusy(false);}
 };
 const title=stage==='advance'?'Pay 50% booking advance':stage==='balance'?'Pay 50% pickup balance':'Pay invoice';
 return <>
  <Button testID="pay-now-button" title={`${title} · ${amountLabel}`} icon="shield-lock-outline" loading={busy} disabled={disabled} onPress={start}/>
  <Modal visible={!!html} animationType="slide" onRequestClose={()=>close()}><View style={{flex:1,backgroundColor:colors.surface,paddingTop:insets.top,paddingBottom:insets.bottom}}>
   <View style={{flexDirection:'row',alignItems:'center',padding:space.md,gap:space.md}}><Pressable onPress={()=>close()} testID="payment-close-button" style={{width:44,height:44,borderRadius:radius.pill,alignItems:'center',justifyContent:'center',backgroundColor:colors.surfaceTertiary}}><Icon name="close" size={22} color={colors.onSurface}/></Pressable><Text style={{color:colors.onSurface}}>{title}</Text></View>
   {html?<WebView source={{html,baseUrl:'https://checkout.razorpay.com'}} javaScriptEnabled domStorageEnabled originWhitelist={['*']} setSupportMultipleWindows={false} onMessage={async e=>{
    try{const message=JSON.parse(e.nativeEvent.data);if(message.type==='receipt'){await api('/payments/verify',{body:message.data});close('Payment verified.','success');}else if(message.type==='dismissed')close('Payment closed. Refresh status if money was deducted.');else if(message.type==='failed')close('Payment could not be completed.','error');}catch(error:any){close(error.message||'Payment verification is pending. Refresh payment status before retrying.','error');}
   }}/>:null}
  </View></Modal>
 </>;
}
