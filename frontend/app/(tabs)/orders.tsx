import {getErrorMessage} from '@/src/errors';
import {useRouter} from '@/src/router';
import { BrandIcon } from "@/src/components/brand-icon";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {ShipmentTracking} from "@/src/components/shipment-tracking";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { OrderCard } from "@/src/components/order-card";
import { Button, Icon, radius, space, useToast } from "@/src/components/ui";
import { usesNativeTabs } from "@/src/navigation";
import { makeStyles, useTheme } from "@/src/theme";
import type { Order } from "@/src/types";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "pending_payment", label: "Unpaid" },
  { key: "paid", label: "Unassigned" },
  { key: "active", label: "Active" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
];

export default function Orders() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, refresh:refreshProfile } = useAuth();
  const partner=user?.role==="partner", approved=user?.partner_status==="approved";
  const [partnerTab,setPartnerTab]=useState<"available"|"mine"|"test">("available");
  const [accepting,setAccepting]=useState<string|null>(null);
  const qc=useQueryClient(),router=useRouter(),toast=useToast();
  const [filter, setFilter] = useState("all");
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const { data, isLoading, isError, refetch, isRefetching } = useQuery({ queryKey: ["orders"], queryFn: () => api<Order[]>("/orders"), refetchInterval:15000 });

  const available=useQuery({queryKey:["jobs","available",user?.user_id],queryFn:()=>api<Order[]>("/partner/jobs"),enabled:partner&&approved,refetchInterval:15000});
  const testJobs=useQuery({queryKey:["jobs","test",user?.user_id],queryFn:()=>api<Order[]>("/partner/jobs?scope=test"),enabled:partner,refetchInterval:15000});
  const browsing=partner&&partnerTab!=="mine";
  const activeQuery=partnerTab==="test"?testJobs:available;
  const rows=browsing?(partnerTab==="available"&&!approved?[]:activeQuery.data??[]):(data??[]).filter(o=>filter==="all"?true:filter==="active"?["assigned","picked_up","in_transit"].includes(o.status):o.status===filter);
  const title=partner?"Partner orders":user?.role==="admin"?"All orders":"My bookings";
  const loading=browsing?activeQuery.isLoading:isLoading;
  const failed=browsing?activeQuery.isError:isError;
  const refresh=async()=>{if(partner){try{await refreshProfile();}catch(error){toast(getErrorMessage(error),"error");}available.refetch();testJobs.refetch();}refetch();};
  const accept=async(order:Order)=>{
    if(accepting)return;
    setAccepting(order.order_id);
    try{
      await api(`/orders/${order.order_id}/accept`,{method:"POST"});
      await Promise.all([qc.invalidateQueries({queryKey:["jobs"]}),qc.invalidateQueries({queryKey:["orders"]})]);
      setPartnerTab("mine");setFilter("active");
      toast(order.is_test?"Test job accepted. No real dispatch or payment.":"Job accepted. You are the assigned delivery partner.","success");
      router.push(`/order/${order.order_id}`);
    }catch(error){toast(getErrorMessage(error),"error");await activeQuery.refetch();}
    finally{setAccepting(null);}
  };

  return (
    <View style={s.root}>
      <View style={{ paddingTop: insets.top + space.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
        <View style={{flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingRight: space.lg}}><Text style={s.h1}>{title}</Text><BrandIcon size={44}/></View>
        {partner?<View style={{flexDirection:"row",flexWrap:"wrap",gap:space.sm,paddingHorizontal:space.lg,paddingVertical:space.sm}}>
          {([{key:"available",label:"Available jobs"},{key:"mine",label:"My jobs"},...((testJobs.data?.length||partnerTab==="test")?[{key:"test",label:"Test jobs"}]:[])] as const).map(tab=><Pressable key={tab.key} accessibilityRole="tab" accessibilityState={{selected:partnerTab===tab.key}} testID={`partner-orders-${tab.key}`} onPress={()=>setPartnerTab(tab.key as "available"|"mine"|"test")} style={[s.chip,partnerTab===tab.key&&{backgroundColor:colors.brandPrimary,borderColor:colors.brandPrimary}]}><Text style={[s.chipText,partnerTab===tab.key&&{color:colors.onBrandPrimary}]}>{tab.label}</Text></Pressable>)}
          {partnerTab==="available"?<Text style={s.emptySub}>{approved?"Bookings with a confirmed advance that fit your vehicle. Choose one to accept.":"Your partner profile must be approved before you can accept real jobs."}</Text>:null}
          {partnerTab==="test"?<Text accessibilityRole="alert" style={s.emptySub}>Invited test jobs only. No real delivery, money received or earnings. Your real vehicle eligibility is unchanged.</Text>:null}
        </View>:null}
        {!browsing?<ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ height: 56, flexGrow: 0 }} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg, alignItems: "center" }}>
          {FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <Pressable key={f.key} testID={`orders-filter-${f.key}`} onPress={() => setFilter(f.key)} style={[s.chip, on && { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse }]}>
                <Text style={[s.chipText, on && { color: colors.onSurfaceInverse }]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>:null}
      </View>
      <FlatList
        data={rows}
        keyExtractor={(o) => o.order_id}
        renderItem={({ item }) => <View style={{gap:space.sm}}><OrderCard order={item} showPayout={partner} footer={browsing?<Button testID={`orders-accept-${item.order_id}`} title={item.is_test?"Accept test job":"Accept movement order"} disabled={!!accepting} loading={accepting===item.order_id} onPress={()=>accept(item)}/>:undefined}/>{item.status==="in_transit"?<ShipmentTracking order={item} compact/>:null}</View>}
        contentContainerStyle={{ padding: space.lg, paddingBottom: bottomChrome + space.xl, gap: space.md }}
        refreshControl={<RefreshControl refreshing={!!(isRefetching||available.isRefetching||testJobs.isRefetching)} onRefresh={refresh} tintColor={colors.brandPrimary} />}
        ListEmptyComponent={loading?<View style={{padding:space.xl,gap:space.sm}}><ActivityIndicator color={colors.brandPrimary}/><Text style={s.emptySub}>Loading movement orders…</Text></View> : (
          <View testID="orders-empty-state" style={{ alignItems: "center", paddingVertical: space.xxxl, gap: space.sm }}>
            <View style={s.emptyIcon}><Icon name="package-variant" size={32} color={colors.brandPrimary} /></View>
            <Text style={s.emptyTitle}>{failed ? "Couldn't load orders" : browsing ? partnerTab==="test"?"No test jobs available":"No available jobs" : "Nothing here yet"}</Text>
            <Text style={s.emptySub}>{failed ? "Pull down to try again." : browsing ? partnerTab==="test"?"Only test orders specifically shared with your account appear here.":approved?"No unassigned bookings match your vehicle yet. Pull down to refresh.":"Approval is required for real movement orders." : partner ? "Accepted jobs will show up here. Choose Available jobs to accept a booking." : "Your bookings will appear here."}</Text>
          </View>
        )}
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  h1: { fontSize: 26, fontWeight: "800", color: c.onSurface, paddingHorizontal: space.lg },
  chip: { height: 36, flexShrink: 0, paddingHorizontal: space.lg, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  chipText: { fontSize: 13, fontWeight: "600", color: c.onSurfaceTertiary },
  emptyIcon: { width: 64, height: 64, borderRadius: radius.lg, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  emptySub: { fontSize: 13, color: c.muted },
}));
