import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useCatalog } from "@/src/components/invoice-card";
import { Button, Card, inr, SectionTitle, space, useToast } from "@/src/components/ui";
import { usesNativeTabs } from "@/src/navigation";
import { makeStyles, useTheme } from "@/src/theme";
import type { User } from "@/src/types";

type Stats = { paid_orders: number; open_orders: number; gmv: number; commission_earned: number; gst_collected: number; pending_partners: number };

export function AdminHome() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: cat } = useCatalog();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const [busy, setBusy] = useState<string | null>(null);
  const stats = useQuery({ queryKey: ["admin-stats"], queryFn: () => api<Stats>("/admin/stats") });
  const pending = useQuery({ queryKey: ["admin-partners", "pending"], queryFn: () => api<User[]>("/admin/partners?status=pending") });

  const decide = async (id: string, decision: "approved" | "rejected") => {
    setBusy(id + decision);
    try {
      await api(`/admin/partners/${id}/decision`, { body: { decision } });
      toast(decision === "approved" ? "Partner approved" : "Partner rejected", decision === "approved" ? "success" : "info");
      qc.invalidateQueries({ queryKey: ["admin-partners"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(null);
    }
  };

  const tiles = [
    { k: "Paid orders", v: String(stats.data?.paid_orders ?? 0), id: "paid" },
    { k: "Awaiting partner", v: String(stats.data?.open_orders ?? 0), id: "open" },
    { k: "GMV (incl. GST)", v: inr(stats.data?.gmv ?? 0, 0), id: "gmv" },
    { k: "Commission (5%)", v: inr(stats.data?.commission_earned ?? 0, 0), id: "commission" },
    { k: "GST collected", v: inr(stats.data?.gst_collected ?? 0, 0), id: "gst" },
    { k: "Pending partners", v: String(stats.data?.pending_partners ?? 0), id: "pending" },
  ];

  return (
    <View style={s.root}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={stats.isRefetching} onRefresh={() => { stats.refetch(); pending.refetch(); }} tintColor={colors.brandPrimary} />}
        contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.lg, paddingBottom: bottomChrome + space.xl, gap: space.md }}
      >
        <Text style={s.h1}>Admin dashboard</Text>
        <View style={s.grid}>
          {tiles.map((t) => (
            <Card key={t.id} style={s.tile}>
              <Text testID={`admin-stat-${t.id}`} style={s.tileV}>{t.v}</Text>
              <Text style={s.tileK}>{t.k}</Text>
            </Card>
          ))}
        </View>

        <SectionTitle>Partner approvals</SectionTitle>
        {pending.data?.length === 0 ? <Text testID="no-pending-partners" style={s.muted}>No partners waiting for approval.</Text> : null}
        {pending.data?.map((p) => {
          const pp = p.partner_profile!;
          const veh = cat?.vehicles.find((v) => v.key === pp.vehicle_type);
          return (
            <Card key={p.user_id} testID={`pending-partner-${p.user_id}`}>
              <Text style={s.pName}>{pp.full_name}</Text>
              <Text style={s.muted}>{p.email} · {pp.phone} · {pp.city}</Text>
              <View style={{ marginTop: space.sm, gap: 2 }}>
                <Text style={s.detail}>Vehicle: {veh?.name ?? pp.vehicle_type} · {pp.vehicle_number}</Text>
                <Text style={s.detail}>Licence: {pp.license_number} · ID: {pp.id_proof}</Text>
                {pp.upi_id ? <Text style={s.detail}>UPI: {pp.upi_id}</Text> : null}
                {pp.gstin ? <Text style={s.detail}>GSTIN: {pp.gstin}</Text> : null}
              </View>
              <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.md }}>
                <Button testID={`reject-partner-${p.user_id}`} compact variant="danger" title="Reject" style={{ flex: 1 }} loading={busy === p.user_id + "rejected"} onPress={() => decide(p.user_id, "rejected")} />
                <Button testID={`approve-partner-${p.user_id}`} compact title="Approve" style={{ flex: 1 }} loading={busy === p.user_id + "approved"} onPress={() => decide(p.user_id, "approved")} />
              </View>
            </Card>
          );
        })}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  h1: { fontSize: 26, fontWeight: "800", color: c.onSurface },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  tile: { width: "47%", flexGrow: 1, padding: space.md },
  tileV: { fontSize: 20, fontWeight: "800", color: c.onSurface },
  tileK: { fontSize: 12, color: c.muted, marginTop: 2 },
  muted: { fontSize: 13, color: c.muted },
  pName: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  detail: { fontSize: 13, color: c.onSurfaceTertiary },
}));
