import { useRouter } from "expo-router";
import { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { Card, Icon, inr, space, StatusBadge } from "@/src/components/ui";
import { useTheme } from "@/src/theme";
import type { Order } from "@/src/types";

export function OrderCard({ order, showPayout, footer }: { order: Order; showPayout?: boolean; footer?: ReactNode }) {
  const router = useRouter();
  const { colors } = useTheme();
  const q = order.quote;
  const count = q.items.reduce((a, i) => a + i.qty, 0);
  return (
    <Pressable testID={`order-card-${order.order_id}`} onPress={() => router.push(`/order/${order.order_id}`)} style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}>
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.muted }}>#{order.order_id}</Text>
          <StatusBadge status={order.status} />
        </View>
        <View style={{ marginTop: space.md, gap: space.sm }}>
          <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-start" }}>
            <Icon name="circle-slice-8" size={16} color={colors.success} style={{ marginTop: 2 }} />
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: colors.onSurface }}>{order.pickup_address}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-start" }}>
            <Icon name="map-marker" size={16} color={colors.brandPrimary} style={{ marginTop: 2 }} />
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: colors.onSurface }}>{order.drop_address}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md, marginTop: space.md }}>
          <Meta icon={q.vehicle.icon as any} text={q.vehicle.name} />
          <Meta icon="map-marker-distance" text={`${q.distance_km} km`} />
          <Meta icon="weight-kilogram" text={`${q.total_weight_kg} kg · ${count} items`} />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: space.md }}>
          <Text style={{ fontSize: 12, color: colors.muted }}>{q.service_type === "pack_and_shift" ? "Pack & Shift" : "Shift only"}{order.move_date ? ` · ${order.move_date}` : ""}</Text>
          {showPayout ? (
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ fontSize: 11, color: colors.muted }}>You earn (after 5%)</Text>
              <Text testID={`order-payout-${order.order_id}`} style={{ fontSize: 18, fontWeight: "800", color: colors.success }}>{inr(q.partner_payout)}</Text>
            </View>
          ) : (
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.onSurface }}>{inr(q.grand_total, 0)}</Text>
          )}
        </View>
        {footer ? <View style={{ marginTop: space.md }}>{footer}</View> : null}
      </Card>
    </Pressable>
  );
}

function Meta({ icon, text }: { icon: any; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Icon name={icon} size={14} color={colors.muted} />
      <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>{text}</Text>
    </View>
  );
}
