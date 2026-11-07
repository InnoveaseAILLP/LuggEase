import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { OrderCard } from "@/src/components/order-card";
import { Button, Card, Icon, inr, radius, SectionTitle, space, useToast } from "@/src/components/ui";
import { usesNativeTabs } from "@/src/navigation";
import { makeStyles, useTheme } from "@/src/theme";
import type { Order } from "@/src/types";

const EMPTY = "https://images.unsplash.com/photo-1617347454431-f49d7ff5c3b1?crop=entropy&cs=srgb&fm=jpg&q=80&w=900";

type Earnings = { delivered_count: number; active_count: number; gross_fare: number; commission: number; net_earnings: number; pending_payout: number; tips: number };

export function PartnerHome() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { user, refresh } = useAuth();
  const approved = user?.partner_status === "approved";
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const [accepting, setAccepting] = useState<string | null>(null);

  const jobs = useQuery({ queryKey: ["jobs"], queryFn: () => api<Order[]>("/partner/jobs"), enabled: approved, refetchInterval: 20000 });
  const earn = useQuery({ queryKey: ["earnings"], queryFn: () => api<Earnings>("/partner/earnings") });

  const onRefresh = async () => {
    await refresh().catch(() => {});
    jobs.refetch();
    earn.refetch();
  };

  const accept = async (id: string) => {
    setAccepting(id);
    try {
      await api(`/orders/${id}/accept`, { method: "POST" });
      toast("Job accepted. Head to pickup!", "success");
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      router.push(`/order/${id}`);
    } catch (e: any) {
      toast(e.message, "error");
      jobs.refetch();
    } finally {
      setAccepting(null);
    }
  };

  const header = (
    <View style={{ gap: space.md }}>
      <View style={s.statusRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.hello}>Partner cockpit</Text>
          <Text style={s.name}>{user?.partner_profile?.full_name || user?.name}</Text>
        </View>
        <View testID="partner-status-badge" style={[s.pill, { backgroundColor: approved ? colors.success : user?.partner_status === "rejected" ? colors.error : colors.warning }]}>
          <Text style={s.pillText}>{approved ? "Approved" : user?.partner_status === "rejected" ? "Rejected" : "Under review"}</Text>
        </View>
      </View>

      <Card style={{ backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse }}>
        <Text style={{ color: colors.onSurfaceInverse, opacity: 0.7, fontSize: 13 }}>Net earnings (after 5% commission)</Text>
        <Text testID="partner-net-earnings" style={{ color: colors.onSurfaceInverse, fontSize: 32, fontWeight: "800", marginTop: 4 }}>{inr(earn.data?.net_earnings ?? 0)}</Text>
        {earn.data?.tips ? <Text style={{ color: colors.onSurfaceInverse, opacity: 0.7, fontSize: 12, marginTop: 2 }}>Includes {inr(earn.data.tips)} in tips</Text> : null}
        <View style={{ flexDirection: "row", gap: space.lg, marginTop: space.md }}>
          <Stat label="Completed" value={String(earn.data?.delivered_count ?? 0)} />
          <Stat label="Active" value={String(earn.data?.active_count ?? 0)} />
          <Stat label="Upcoming" value={inr(earn.data?.pending_payout ?? 0, 0)} />
          <Stat label="Rating" value={user?.rating ? `${user.rating.toFixed(1)}★` : "New"} />
        </View>
      </Card>

      {!approved ? (
        <Card testID="partner-pending-card">
          <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
            <Icon name={user?.partner_status === "rejected" ? "close-octagon-outline" : "timer-sand"} size={28} color={user?.partner_status === "rejected" ? colors.error : colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>{user?.partner_status === "rejected" ? "Application rejected" : "Verification in progress"}</Text>
              <Text style={s.cardSub}>{user?.partner_status === "rejected" ? "Please review your details and resubmit." : "Our team is reviewing your vehicle and ID. You can take jobs once approved."}</Text>
            </View>
          </View>
          <Button testID="edit-partner-details-button" variant="outline" compact title="View / edit details" style={{ marginTop: space.md }} onPress={() => router.push("/partner-register")} />
        </Card>
      ) : (
        <SectionTitle>Open jobs for your vehicle</SectionTitle>
      )}
    </View>
  );

  return (
    <View style={s.root}>
      <FlatList
        data={approved ? jobs.data ?? [] : []}
        keyExtractor={(o) => o.order_id}
        contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.lg, paddingBottom: bottomChrome + space.xl, gap: space.md }}
        refreshControl={<RefreshControl refreshing={jobs.isRefetching || earn.isRefetching} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
        ListHeaderComponent={header}
        ListEmptyComponent={approved && !jobs.isLoading ? (
          <View testID="jobs-empty-state" style={{ alignItems: "center", gap: space.md, paddingVertical: space.lg }}>
            <Image source={{ uri: EMPTY }} style={{ width: "100%", height: 160, borderRadius: radius.lg }} contentFit="cover" />
            <Text style={s.cardTitle}>No open jobs near you</Text>
            <Text style={[s.cardSub, { textAlign: "center" }]}>Pull down to refresh. New bookings appear here instantly.</Text>
          </View>
        ) : undefined}
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            showPayout
            footer={<Button testID={`accept-job-${item.order_id}`} title="Accept job" icon="check-bold" loading={accepting === item.order_id} onPress={() => accept(item.order_id)} />}
          />
        )}
      />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View>
      <Text style={{ color: colors.onSurfaceInverse, fontSize: 16, fontWeight: "800" }}>{value}</Text>
      <Text style={{ color: colors.onSurfaceInverse, opacity: 0.7, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  statusRow: { flexDirection: "row", alignItems: "center" },
  hello: { fontSize: 13, color: c.muted, fontWeight: "600" },
  name: { fontSize: 24, fontWeight: "800", color: c.onSurface },
  pill: { borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6 },
  pillText: { color: c.onSuccess, fontSize: 12, fontWeight: "800" },
  cardTitle: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  cardSub: { fontSize: 13, color: c.muted, marginTop: 2, lineHeight: 19 },
}));
