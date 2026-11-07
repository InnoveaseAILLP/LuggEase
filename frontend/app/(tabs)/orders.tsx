import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { OrderCard } from "@/src/components/order-card";
import { Icon, radius, space } from "@/src/components/ui";
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
  const { user } = useAuth();
  const [filter, setFilter] = useState("all");
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const { data, isLoading, isError, refetch, isRefetching } = useQuery({ queryKey: ["orders"], queryFn: () => api<Order[]>("/orders") });

  const rows = (data ?? []).filter((o) =>
    filter === "all" ? true : filter === "active" ? ["assigned", "picked_up", "in_transit"].includes(o.status) : o.status === filter,
  );
  const title = user?.role === "partner" ? "My jobs" : user?.role === "admin" ? "All orders" : "My bookings";

  return (
    <View style={s.root}>
      <View style={{ paddingTop: insets.top + space.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
        <Text style={s.h1}>{title}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ height: 56, flexGrow: 0 }} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg, alignItems: "center" }}>
          {FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <Pressable key={f.key} testID={`orders-filter-${f.key}`} onPress={() => setFilter(f.key)} style={[s.chip, on && { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse }]}>
                <Text style={[s.chipText, on && { color: colors.onSurfaceInverse }]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(o) => o.order_id}
        renderItem={({ item }) => <OrderCard order={item} showPayout={user?.role === "partner"} />}
        contentContainerStyle={{ padding: space.lg, paddingBottom: bottomChrome + space.xl, gap: space.md }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); }} tintColor={colors.brandPrimary} />}
        ListEmptyComponent={!isLoading ? (
          <View testID="orders-empty-state" style={{ alignItems: "center", paddingVertical: space.xxxl, gap: space.sm }}>
            <View style={s.emptyIcon}><Icon name="package-variant" size={32} color={colors.brandPrimary} /></View>
            <Text style={s.emptyTitle}>{isError ? "Couldn't load orders" : "Nothing here yet"}</Text>
            <Text style={s.emptySub}>{isError ? "Pull down to try again." : user?.role === "partner" ? "Accepted jobs will show up here." : "Your bookings will appear here."}</Text>
          </View>
        ) : undefined}
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
