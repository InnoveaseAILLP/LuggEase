import {useState} from 'react';
import {Pressable, ScrollView, Text, View} from 'react-native';
import {useQuery} from '@tanstack/react-query';
import {useAuth} from '../src/auth';
import {api} from '../src/api';
import {useRouter} from '../src/router';
import {ROLE_LABELS} from '../src/roles';
import {recordsCSV} from '../src/report-csv';
import {saveReportCSV} from '../src/report-download';
import {useTheme} from '../src/theme';
import {Button,Card,Input,Row,ScreenHeader,SectionTitle,space,useToast} from '../src/components/ui';
import type {Role} from '../src/types';

type RecordRow=Record<string,string|number>;
type Report={start_date:string;end_date:string;basis:string;notes:string[];summary:Record<string,number>} & Record<string,unknown>;
type Directory={users:{user_id:string;name:string;email:string;role:Role|null;partner_status?:string}[];total:number};
const views=[['daily','Daily sales and collections'],['monthly','Monthly sales and collections'],['transactions','Transactions'],
  ['pickup_cities','Pickup cities'],['drop_cities','Destination cities'],['pickup_states','Pickup states'],['drop_states','Destination states'],['statuses','Order status'],['services','Service demand']] as const;
const metrics=[['orders','Bookings'],['invoiced_paise','Gross invoiced, excluding tips'],['taxable_paise','Invoiced sales before GST'],['gst_paise','GST invoiced'],
  ['collections_paise','Posted provider-captured collections'],['captured_pending_review_paise','Captured payments awaiting review'],['quoted_commission_paise','Quoted platform commission'],['current_invoice_balance_paise','Current balance on period invoices'],
  ['cancelled_invoice_paise','Period invoices now cancelled'],['supplement_invoiced_paise','Traffic supplements invoiced'],['customer_confirmed_cash_paise','Traffic cash confirmed by customer'],
  ['refund_due_paise','Refunds due, not confirmed refunded'],['settlement_recorded_paise','Partner settlements recorded']] as const;
function dateString(d:Date){return new Date(d.getTime()+330*60000).toISOString().slice(0,10);}
function recent(days:number){return {start:dateString(new Date(Date.now()-(days-1)*86400000)),end:dateString(new Date())};}
const currency=(paise:number)=>`₹${(paise/100).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;

export default function AdminReports() {
  const {user}=useAuth();const {colors}=useTheme();const router=useRouter();const toast=useToast();
  const [section,setSection]=useState<'reports'|'users'>('reports');const [range,setRange]=useState(()=>recent(30));
  const [dates,setDates]=useState(range);const [view,setView]=useState<string>('daily');const [exporting,setExporting]=useState(false);
  const [role,setRole]=useState('');const [search,setSearch]=useState('');const [searchText,setSearchText]=useState('');const [offset,setOffset]=useState(0);
  const allowed=user?.role==='admin';
  const report=useQuery({queryKey:['admin-reports',range],queryFn:()=>api<Report>(`/admin/reports?start_date=${encodeURIComponent(range.start)}&end_date=${encodeURIComponent(range.end)}`),enabled:allowed&&section==='reports',retry:false});
  const directory=useQuery({queryKey:['admin-users',role,search,offset],queryFn:()=>api<Directory>(`/admin/users?limit=20&offset=${offset}&search=${encodeURIComponent(search)}${role?'&role='+role:''}`),enabled:allowed&&section==='users'});
  const rows=(report.data?.[view] as RecordRow[]|undefined)??[];
  const action=async()=>{
    setExporting(true);
    try{toast(await saveReportCSV(recordsCSV(rows),`LuggEase-Report-${view}-${range.start}-${range.end}`),'success');}
    catch(error:any){toast(error.message,'error');}finally{setExporting(false);}
  };
  if(!allowed)return <Text accessibilityRole="alert">Administrator access is required.</Text>;
  const chip=(key:string,label:string,active:boolean,onPress:()=>void)=><Pressable key={key} accessibilityRole="button" accessibilityState={{selected:active}} onPress={onPress} style={{borderWidth:1,borderColor:active?colors.brandPrimary:colors.border,borderRadius:12,padding:10,backgroundColor:active?colors.brandTertiary:colors.surfaceSecondary}}><Text style={{color:active?colors.brandPrimary:colors.onSurface}}>{label}</Text></Pressable>;
  return <View style={{flex:1,backgroundColor:colors.surface}}>
    <ScreenHeader title="Admin reports" subtitle="Sales, transactions, demand and account roles" onBack={()=>router.back()}/>
    <ScrollView contentContainerStyle={{padding:space.lg,gap:space.md,paddingBottom:40}}>
      <View style={{flexDirection:'row',gap:8}}>{chip('reports','Reports',section==='reports',()=>setSection('reports'))}{chip('users','Account directory',section==='users',()=>setSection('users'))}</View>
      {section==='reports'?<>
        <Card><SectionTitle>Reporting period · India time</SectionTitle>
          <View style={{flexDirection:'row',gap:8,flexWrap:'wrap',marginVertical:10}}>{[7,30,90].map(days=>chip(String(days),`Last ${days} days`,false,()=>{const next=recent(days);setDates(next);setRange(next);}))}</View>
          <Input label="From (YYYY-MM-DD)" value={dates.start} onChangeText={start=>setDates({...dates,start})} maxLength={10}/>
          <Input label="To (YYYY-MM-DD)" value={dates.end} onChangeText={end=>setDates({...dates,end})} maxLength={10}/>
          <Button title="Generate reports" testID="generate-admin-reports" onPress={()=>{if(dates.start===range.start&&dates.end===range.end)report.refetch();else setRange({...dates});}}/>
        </Card>
        {report.isLoading?<Text>Loading reports…</Text>:null}
        {report.error?<Text accessibilityRole="alert" style={{color:colors.error}}>{report.error.message}</Text>:null}
        {report.data&&!report.isFetching?<>
          <Card><SectionTitle>Consolidated overview</SectionTitle>
            <Text>Report: {report.data.start_date} through {report.data.end_date} · India time</Text>
            {metrics.map(([key,label])=><Row key={key} label={label} value={key.endsWith('_paise')?currency(report.data!.summary[key]??0):String(report.data!.summary[key]??0)}/>)}
            <Text style={{color:colors.muted,fontSize:12,marginTop:12}}>{report.data.basis}</Text>
            {report.data.notes.map(note=><Text key={note} style={{fontSize:12,color:colors.muted,marginTop:6}}>• {note}</Text>)}
            <Text style={{fontSize:12,color:colors.muted,marginTop:6}}>Bookings without structured city: pickup {report.data.summary.orders_without_pickup_city??0}, destination {report.data.summary.orders_without_drop_city??0}. Undated payments: {report.data.summary.undated_payment_records??0}. Duplicate payment references deduplicated: {report.data.summary.duplicate_payment_references??0}.</Text>
          </Card>
          <View style={{flexDirection:'row',gap:8,flexWrap:'wrap'}}>{views.map(([key,label])=>chip(key,label,view===key,()=>setView(key)))}</View>
          <Button title="Download CSV" testID="admin-report-download" loading={exporting} disabled={!rows.length} onPress={action}/>
          <Text style={{color:colors.muted}}>Showing {Math.min(rows.length,50)} of {rows.length} records. CSV includes every record in this report.</Text>
          {!rows.length?<Text>No records for this report and date range.</Text>:null}
          {rows.slice(0,50).map((row,index)=><Card key={index}>
            {Object.entries(row).map(([key,value])=><Row key={key} label={key.replace(/_paise$/,' (INR)').replace(/_/g,' ')} value={key.endsWith('_paise')?currency(Number(value)):String(value)}/>)}
            {typeof row.orders==='number'?<View accessibilityLabel={`${row.orders} orders`} style={{height:6,backgroundColor:colors.brandSecondary,marginTop:8}}><View style={{height:6,backgroundColor:colors.brandPrimary,width:`${row.orders/Math.max(1,...rows.map(r=>Number(r.orders)||0))*100}%`}}/></View>:null}
          </Card>)}
        </>:null}
      </>:<>
        <Text>Account roles are read-only here. Admin access is assigned privately; partner approval remains on the dashboard.</Text>
        <Input label="Search name or email" value={searchText} onChangeText={setSearchText} maxLength={100}/>
        <Button title="Search accounts" onPress={()=>{setSearch(searchText.trim());setOffset(0);}}/>
        <View style={{flexDirection:'row',gap:8,flexWrap:'wrap'}}>{[['','All roles'],['customer','Customer'],['partner','Delivery Partner'],['admin','Admin'],['unassigned','Not yet chosen']].map(([key,label])=>chip(key,label,role===key,()=>{setRole(key);setOffset(0);}))}</View>
        {directory.isLoading?<Text>Loading accounts…</Text>:null}
        {directory.error?<Text accessibilityRole="alert">{directory.error.message}</Text>:null}
        <Text>{directory.data?.total??0} matching accounts</Text>
        {directory.data?.users.map(account=><Card key={account.user_id}><Text style={{fontWeight:'700',color:colors.onSurface}}>{account.name||'LuggEase user'}</Text><Text>{account.email}</Text><Text>{account.role?ROLE_LABELS[account.role]:'Not yet chosen'}</Text>{account.role==='partner'?<Text>Partner application: {account.partner_status||'incomplete'}</Text>:null}</Card>)}
        <Button title="Previous accounts" disabled={offset===0} onPress={()=>setOffset(Math.max(0,offset-20))}/>
        <Button title="Next accounts" disabled={!directory.data||offset+20>=directory.data.total} onPress={()=>setOffset(offset+20)}/>
      </>}
    </ScrollView>
  </View>;
}
