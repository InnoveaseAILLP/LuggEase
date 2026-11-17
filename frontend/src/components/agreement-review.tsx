import {getErrorMessage} from '@/src/errors';
import {useEffect,useState} from 'react';
import {Switch,Text,View} from 'react-native';
import {useQuery} from '@tanstack/react-query';
import {api} from '@/src/api';
import {downloadDocument} from '@/src/invoice-download';
import {Button,Card,SectionTitle,space,useToast,inr} from '@/src/components/ui';
import {useTheme} from '@/src/theme';
export type Agreement={agreement_id:string;status:string;document_sha256:string;ownership_declaration:string;expires_at:string;quote:{grand_total:number;delivery_estimate?:{expected_delivery_at:string}}};
export function AgreementReview({payload,onReady}:{payload:object;onReady:(id:string|null)=>void}){
 const {colors}=useTheme(),toast=useToast();
 const [prepared,setPrepared]=useState<Agreement|null>(null),[accepted,setAccepted]=useState(false),[busy,setBusy]=useState(false);
 const key=JSON.stringify(payload);
 useEffect(()=>{setPrepared(null);setAccepted(false);onReady(null);},[key,onReady]);
 const {data}=useQuery({queryKey:['agreement',prepared?.agreement_id],queryFn:()=>api<Agreement>(`/agreements/${prepared!.agreement_id}`),enabled:!!prepared,refetchInterval:15000});
 const a=prepared?.status==='reviewed'?prepared:(data??prepared);
 useEffect(()=>{const expires=a?new Date(a.expires_at).getTime()-Date.now():0;onReady(a?.status==='reviewed'&&expires>0?a.agreement_id:null);if(expires<=0)return;const timer=setTimeout(()=>onReady(null),expires);return()=>clearTimeout(timer);},[a,onReady]);
 const run=async(fn:()=>Promise<void>)=>{setBusy(true);try{await fn();}catch(e:any){toast(getErrorMessage(e),'error');}finally{setBusy(false);}};
 return <Card style={{gap:space.sm}} testID="transfer-agreement-review">
  <SectionTitle>Logistics Transfer Agreement</SectionTitle>
  <Text style={{color:colors.muted}}>Review your goods and addresses, declare ownership, then accept the ownership declaration before placing the order.</Text>
  {!a?<Button title="Generate transfer agreement" loading={busy} onPress={()=>run(async()=>{setPrepared(await api<Agreement>('/agreements/prepare',{body:payload}));})}/>:<>
   <Text style={{color:colors.onSurface}}>{a.agreement_id} · Total {inr(a.quote.grand_total)}</Text>
   <Text style={{color:colors.muted}}>{a.ownership_declaration}</Text>
   <Button title="Download and review agreement PDF" variant="outline" onPress={()=>run(async()=>{toast(await downloadDocument(`/agreements/${a.agreement_id}/document.pdf`,a.agreement_id),'success');})}/>
   <View style={{flexDirection:'row',gap:space.sm,alignItems:'center'}}><Switch value={accepted} onValueChange={setAccepted} testID="ownership-declaration-checkbox"/><Text style={{flex:1,color:colors.onSurface}}>I own the listed goods and have reviewed and accepted this exact agreement.</Text></View>
   <Text accessibilityRole="status" style={{color:colors.muted}}>{a.status==='reviewed'?'Agreement reviewed and ownership declared. Handwritten signatures are required after loading, before departure.':'Review the document and confirm ownership to continue. The customer will hand-sign both documents after loading.'}</Text>
   <Button title="Accept agreement and ownership declaration" disabled={!accepted||a.status==='reviewed'} loading={busy} onPress={()=>run(async()=>{await api(`/agreements/${a.agreement_id}/accept`,{body:{ownership_confirmed:true,agreement_sha256:a.document_sha256}});setPrepared({...a,status:'reviewed'});})}/>
  </>}
 </Card>;
}
