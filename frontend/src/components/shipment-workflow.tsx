import {useState} from 'react';
import {Linking,Switch,Text,View} from 'react-native';
import {useQuery} from '@tanstack/react-query';
import {api} from '@/src/api';
import {useAuth} from '@/src/auth';
import {downloadDocument} from '@/src/invoice-download';
import {useCatalog} from "./invoice-card";
import {Button,Card,Input,SectionTitle,space,useToast,inr} from '@/src/components/ui';
import {useTheme} from '@/src/theme';
import {ShipmentTracking, type TrackingPoint} from './shipment-tracking';
import {ShipmentMap} from './shipment-map';
import {SignaturePad} from './signature-pad';
import {deliveryNavigationURL} from '@/src/delivery-navigation';
import type {Order} from '@/src/types';
export function ShipmentWorkflow({order:o,onChanged}:{order:Order;onChanged:()=>void}){
 const {data:catalog}=useCatalog();
 const {user}=useAuth(),{colors}=useTheme(),toast=useToast();
 const partner=user?.role==='partner'&&o.partner_id===user.user_id,customer=o.customer_id===user?.user_id;
 const [date,setDate]=useState(''),[time,setTime]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false);
 const [signing,setSigning]=useState(false),[invoiceSig,setInvoiceSig]=useState(''),[agreementSig,setAgreementSig]=useState(''),[name,setName]=useState(o.customer_name||''),[otp,setOtp]=useState(''),[loaded,setLoaded]=useState(false),[present,setPresent]=useState(false);
 const [deliverySig,setDeliverySig]=useState(''),[recipient,setRecipient]=useState(o.customer_name||''),[arrived,setArrived]=useState(false),[received,setReceived]=useState(false),[recipientPresent,setRecipientPresent]=useState(false);
 const [chargeReason,setChargeReason]=useState(''),[amount,setAmount]=useState('200'),[evidence,setEvidence]=useState(false),[cash,setCash]=useState(false);
 const proof=useQuery({queryKey:['traffic-evidence',o.order_id],queryFn:()=>api<{points:TrackingPoint[]}>(`/orders/${o.order_id}/traffic-evidence`),enabled:evidence});
 const run=async(fn:()=>Promise<void>)=>{setBusy(true);try{await fn();onChanged();}catch(e:any){toast(e.message,'error');}finally{setBusy(false);}};
 const doc=(path:string,title:string)=>run(async()=>{toast(await downloadDocument(path,title),'success');});
 return <View style={{gap:space.md}}>
  {o.payment_plan?<Card style={{gap:space.sm}}>
   <SectionTitle>50% booking advance + 50% pickup balance</SectionTitle>
   {catalog?.payment_configuration?.mode==="test"?<Text style={{color:colors.warning}}>Test payments only — no real money is collected.</Text>:null}
   <Text style={{color:colors.onSurface}}>Booking advance: {inr(o.payment_plan.advance_paise/100)} · {o.payment_plan.advance_paid_paise?'Paid':'Awaiting payment'}</Text>
   <Text style={{color:colors.onSurface}}>Pickup balance: {inr(o.payment_plan.balance_paise/100)} · {o.payment_plan.balance_paid_paise?'Paid':'Due after loading and signatures, before departure'}</Text>
   <Text style={{color:colors.muted}}>Received: {inr(o.payment_plan.paid_paise/100)} · Outstanding: {inr((o.payment_plan.total_paise-o.payment_plan.paid_paise)/100)}</Text>
   {customer&&catalog?.payment_configuration?.enabled?<Button variant="outline" title="Refresh payment status" loading={busy} onPress={()=>run(async()=>{await api('/payments/reconcile',{body:{order_id:o.order_id}});toast('Payment status refreshed.','success');})}/>:null}
   {!catalog?.payment_configuration?.enabled?<Text style={{color:colors.muted}}>Online payment is temporarily unavailable. Please contact support.</Text>:null}
  </Card>:null}
  <ShipmentTracking order={o}/>
  {partner&&['assigned','picked_up','in_transit'].includes(o.status)?<Card style={{gap:space.sm}}>
   <SectionTitle>Delivery navigation</SectionTitle>
   <Button title={o.status==='assigned'?'Navigate to pickup in Google Maps':'Navigate to destination in Google Maps'} onPress={()=>run(async()=>{await Linking.openURL(deliveryNavigationURL(o));})}/>
   <Text style={{color:colors.muted}}>Google Maps opens separately. Returning to LuggEase and restarting location sharing is required for live parcel updates.</Text>
  </Card>:null}
  {partner&&o.status==='in_transit'&&!o.delivery_signature_completed_at?<Card style={{gap:space.sm}}>
   <SectionTitle>Destination and final invoice signature</SectionTitle>
   <Text style={{color:colors.muted}}>At the destination, unload the goods and let the customer check and sign the final invoice before marking Delivered.</Text>
   <Button variant="outline" title="Review final invoice PDF" onPress={()=>doc(`/orders/${o.order_id}/pickup-invoice.pdf`,o.invoice_no||o.order_id)}/>
   <Input label="Recipient name" value={recipient} onChangeText={setRecipient} maxLength={150}/>
   <Text>Arrived at the destination</Text><Switch accessibilityLabel="Arrived at destination" value={arrived} onValueChange={setArrived}/>
   <Text>Goods unloaded, received and checked</Text><Switch accessibilityLabel="Goods received and checked" value={received} onValueChange={setReceived}/>
   <Text>Customer present and signing personally</Text><Switch accessibilityLabel="Delivery customer present" value={recipientPresent} onValueChange={setRecipientPresent}/>
   <SignaturePad onChange={setDeliverySig}/>
   <Button title="Save final invoice signature" loading={busy} disabled={!deliverySig||!arrived||!received||!recipientPresent||recipient.trim().length<2} onPress={()=>run(async()=>{await api(`/orders/${o.order_id}/delivery-signature`,{body:{signature:deliverySig,recipient_name:recipient,arrived_at_destination:arrived,goods_received_and_checked:received,customer_present:recipientPresent}});toast('Delivery acknowledgement saved. You can now mark Delivered.','success');})}/>
  </Card>:null}
  {o.delivery_signature_completed_at?<Card><SectionTitle>Delivery acknowledgement recorded</SectionTitle><Text style={{color:colors.onSurface}}>{o.delivery_recipient_name} · {new Date(o.delivery_signature_completed_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST</Text><Button variant="outline" title="Download signed final invoice" onPress={()=>doc(`/orders/${o.order_id}/pickup-invoice.pdf`,o.invoice_no||o.order_id)}/></Card>:null}

  {partner&&['assigned','picked_up','in_transit'].includes(o.status)?<Card style={{gap:space.sm}}>
   <SectionTitle>Revise approximate delivery</SectionTitle>
   <Input label="Delivery date (DD-MM-YYYY)" value={date} onChangeText={setDate} placeholder="17-11-2026"/>
   <Input label="Delivery time (HH:mm, India time)" value={time} onChangeText={setTime} placeholder="09:00"/>
   <Input label="Reason for revision" value={reason} onChangeText={setReason} maxLength={500} multiline placeholder="Traffic, breakdown or other difficulty"/>
   <Button title="Update customer delivery estimate" loading={busy} onPress={()=>run(async()=>{
    if(!/^\d{2}-\d{2}-\d{4}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new Error('Enter the date and time in the shown format.');
    const [day,month,year]=date.split('-');const value=new Date(`${year}-${month}-${day}T${time}:00+05:30`);
    if(!Number.isFinite(value.getTime())||new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',day:'2-digit',month:'2-digit',year:'numeric'}).format(value).replaceAll('/','-')!==date)throw new Error('Enter a valid calendar date.');
    await api(`/orders/${o.order_id}/delivery-estimate`,{body:{expected_delivery_at:value.toISOString(),reason}});toast('Delivery estimate updated for the customer.','success');
   })}/>
  </Card>:null}
  {o.agreement_id?<Card style={{gap:space.sm}}>
   <SectionTitle>Transfer agreement and pickup signatures</SectionTitle>
   <Text style={{color:colors.onSurface}}>Sales invoice {o.invoice_no??'awaiting payment'} · {inr(o.quote.grand_total)}</Text>
   <Button variant="outline" title="Review sales invoice PDF before signing" onPress={()=>doc(`/orders/${o.order_id}/pickup-invoice.pdf`,`${o.order_id}-Pickup-Invoice`)}/>
   <Button variant="outline" title="Download transfer agreement" onPress={()=>doc(`/orders/${o.order_id}/transfer-agreement.pdf`,o.agreement_id!)}/>
   <Text style={{color:colors.muted}}>{o.pickup_signatures_completed_at?`Customer signatures captured after loading: ${new Date(o.pickup_signatures_completed_at).toLocaleString()}`:'The customer must check loaded goods and sign the invoice and agreement before the partner leaves pickup.'}</Text>
   {partner&&o.status==='assigned'&&!o.pickup_signatures_completed_at?<>
    <Button title={signing?'Hide signature capture':'Capture customer signatures after loading'} onPress={()=>setSigning(!signing)}/>
    {signing?<>
     <Input label="Customer signing in person" value={name} onChangeText={setName}/>
     <Text style={{color:colors.onSurface}}>Customer: hand-sign the sales invoice</Text><SignaturePad onChange={setInvoiceSig}/>
     <Text style={{color:colors.onSurface}}>Customer: hand-sign the Logistics Transfer Agreement</Text><SignaturePad onChange={setAgreementSig}/>
     <View style={{flexDirection:'row',gap:8}}><Switch value={loaded} onValueChange={setLoaded}/><Text style={{flex:1,color:colors.onSurface}}>Loaded goods have been checked against the agreement.</Text></View>
     <View style={{flexDirection:'row',gap:8}}><Switch value={present} onValueChange={setPresent}/><Text style={{flex:1,color:colors.onSurface}}>The customer is present and has personally signed both documents.</Text></View>
     <Input label="Customer pickup OTP" value={otp} onChangeText={setOtp} keyboardType="number-pad" maxLength={4}/>
     <Button title="Save both customer signatures" disabled={!loaded||!present||!invoiceSig||!agreementSig||otp.length!==4} loading={busy} onPress={()=>run(async()=>{
      await api(`/orders/${o.order_id}/pickup-signatures`,{body:{invoice_signature:invoiceSig,agreement_signature:agreementSig,pickup_otp:otp,customer_name:name,goods_loaded_and_checked:loaded,customer_present:present}});setSigning(false);setInvoiceSig('');setAgreementSig('');setOtp('');toast('Signatures recorded. Pickup can now be confirmed.','success');
     })}/>
    </>:null}
   </>:null}
  </Card>:null}
  {partner&&o.status==='in_transit'&&!o.traffic_surcharge?<Card style={{gap:space.sm}}>
   <SectionTitle>Request a traffic charge</SectionTitle>
   <Text style={{color:colors.muted}}>One request per shipment, maximum ₹200 including GST. Requires recorded route evidence covering at least five minutes and customer acceptance.</Text>
   <Input label="Additional amount including GST (maximum ₹200)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad"/>
   <Input label="Reason for congestion charge" value={chargeReason} onChangeText={setChargeReason} maxLength={500} multiline/>
   <Button title="Send charge and route evidence to customer" loading={busy} onPress={()=>run(async()=>{const value=Number(amount);if(!Number.isFinite(value)||value<=0||value>200)throw new Error('Enter an amount above zero and no more than ₹200.');await api(`/orders/${o.order_id}/traffic-charge`,{body:{amount:value,reason:chargeReason}});toast('Charge sent for customer review.','success');})}/>
  </Card>:null}
  {o.traffic_surcharge?<Card style={{gap:space.sm}}>
   <SectionTitle>Traffic charge · {inr(o.traffic_surcharge.amount)}</SectionTitle>
   <Text style={{color:colors.onSurface}}>{o.traffic_surcharge.reason}</Text>
   <Text style={{color:colors.muted}}>Status: {({requested:"Awaiting customer review",accepted:"Accepted — payment due",rejected:"Rejected",paid_cash_customer_confirmed:"Cash paid, confirmed by customer"} as Record<string,string>)[o.traffic_surcharge.status]??"Awaiting review"}. Amount includes GST. Google Maps predicted traffic delay at request: {Math.round((o.traffic_surcharge.traffic_delay_seconds??0)/60)} minutes. Device locations show the reported journey; they do not independently prove traffic congestion.</Text>
   <Button variant="outline" title={evidence?'Hide recorded route evidence':'Review recorded route evidence'} onPress={()=>setEvidence(!evidence)}/>
   {evidence&&proof.data?<ShipmentMap points={proof.data.points}/>:null}
   {evidence&&proof.isError?<Text style={{color:colors.muted}}>Unable to load evidence. Please try again.</Text>:null}
   {customer&&o.traffic_surcharge.status==='requested'?<>
    <Button title={`Accept additional ${inr(o.traffic_surcharge.amount)} including GST`} loading={busy} onPress={()=>run(async()=>{await api(`/orders/${o.order_id}/traffic-charge/decision`,{body:{accept:true}});})}/>
    <Button variant="outline" title="Reject this charge" onPress={()=>run(async()=>{await api(`/orders/${o.order_id}/traffic-charge/decision`,{body:{accept:false}});})}/>
   </>:null}
   {['accepted','paid_cash_customer_confirmed'].includes(o.traffic_surcharge.status)?<Button variant="outline" title="Download supplementary traffic invoice" onPress={()=>doc(`/orders/${o.order_id}/traffic-invoice.pdf`,`${o.order_id}-Traffic`)}/>:null}
   {customer&&o.traffic_surcharge.status==='accepted'?<>
    <Text style={{color:colors.muted}}>Pay the accepted additional amount to the partner in cash, then confirm below. This confirmation records your acknowledgement; it does not initiate an online payment.</Text>
    <View style={{flexDirection:'row',gap:8}}><Switch value={cash} onValueChange={setCash}/><Text style={{flex:1,color:colors.onSurface}}>I have paid {inr(o.traffic_surcharge.amount)} in cash.</Text></View>
    <Button title="Confirm cash payment received by partner" disabled={!cash} onPress={()=>run(async()=>{await api(`/orders/${o.order_id}/traffic-charge/cash-receipt`,{body:{cash_paid:true}});setCash(false);})}/>
   </>:null}
  </Card>:null}
 </View>;
}
