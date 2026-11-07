import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, RefreshControl, Text, View } from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { InvoiceCard, useCatalog } from "@/src/components/invoice-card";
import { PayButton } from "@/src/components/pay-button";
import { Button, Card, Icon, inr, Input, radius, Row, ScreenHeader, SectionTitle, space, STATUS_LABEL, StatusBadge, useToast } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import type { Order, OrderStatus, User } from "@/src/types";

const FLOW: OrderStatus[] = ["pending_payment", "paid", "assigned", "picked_up", "in_transit", "delivered"];
const NEXT: Partial<Record<OrderStatus, { status: string; label: string }>> = {
  assigned: { status: "picked_up", label: "Mark as picked up" },
  picked_up: { status: "in_transit", label: "Start trip" },
  in_transit: { status: "delivered", label: "Mark as delivered" },
};

export default function OrderDetail() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { data: cat } = useCatalog();
  const [busy, setBusy] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [otp, setOtp] = useState("");
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [utr, setUtr] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const { data: o, refetch, isRefetching, isLoading } = useQuery({ queryKey: ["order", id], queryFn: () => api<Order>(`/orders/${id}`) });
  const partners = useQuery({ queryKey: ["admin-partners", "approved"], queryFn: () => api<User[]>("/admin/partners?status=approved"), enabled: assignOpen });

  const refreshAll = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ["orders"] });
    qc.invalidateQueries({ queryKey: ["jobs"] });
    qc.invalidateQueries({ queryKey: ["earnings"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
  };

  const act = async (key: string, path: string, body?: unknown, msg?: string) => {
    setBusy(key);
    try {
      await api(path, { method: "POST", body });
      if (msg) toast(msg, "success");
      refreshAll();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(null);
    }
  };

  if (isLoading || !o) {
    return (
      <View style={s.root}>
        <ScreenHeader testID="order-detail" title="Order" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
      </View>
    );
  }

  const role = user?.role;
  const q = o.quote;
  const isCustomer = role === "customer" && o.customer_id === user?.user_id;
  const isMine = role === "partner" && o.partner_id === user?.user_id;
  const canAccept = role === "partner" && o.status === "paid" && !o.partner_id;
  const reached = (st: OrderStatus) => o.timeline.find((t) => t.status === st);

  let footer: React.ReactNode = null;
  if (isCustomer && o.status === "pending_payment") footer = <PayButton orderId={o.order_id} amountLabel={inr(q.grand_total, 0)} onDone={refreshAll} />;
  else if (canAccept) footer = <Button testID="order-accept-button" title={`Accept job · earn ${inr(q.partner_payout, 0)}`} icon="check-bold" loading={busy === "accept"} onPress={() => act("accept", `/orders/${o.order_id}/accept`, undefined, "Job accepted")} />;
  else if (isMine && NEXT[o.status]) {
    const needOtp = o.status === "assigned";
    footer = (
      <View style={{ gap: space.sm }}>
        {needOtp ? (
          <Input testID="pickup-otp-input" value={otp} onChangeText={(t) => setOtp(t.replace(/\D/g, "").slice(0, 4))} keyboardType="number-pad" maxLength={4} placeholder="Enter 4-digit pickup OTP from customer" />
        ) : null}
        <Button
          testID="order-next-status-button"
          title={NEXT[o.status]!.label}
          disabled={needOtp && otp.length !== 4}
          loading={busy === "status"}
          onPress={() => act("status", `/orders/${o.order_id}/status`, { status: NEXT[o.status]!.status, otp: needOtp ? otp : undefined }, "Status updated")}
        />
      </View>
    );
  }
  else if (role === "admin" && o.status === "paid") footer = <Button testID="admin-assign-button" title="Assign a partner" icon="account-arrow-right" onPress={() => setAssignOpen(true)} />;

  return (
    <View style={s.root}>
      <ScreenHeader testID="order-detail" title={`#${o.order_id}`} subtitle={new Date(o.created_at).toLocaleString()} onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))} />
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); }} tintColor={colors.brandPrimary} />} contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xl }}>
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <StatusBadge status={o.status} testID="order-status-badge" />
            <Text style={s.muted}>{q.service_type === "pack_and_shift" ? "Pack & Shift" : "Shift only"}{o.move_date ? ` · ${o.move_date}` : ""}</Text>
          </View>
          {o.status !== "cancelled" ? (
            <View style={{ marginTop: space.lg, gap: space.sm }}>
              {FLOW.map((st, i) => {
                const done = reached(st);
                return (
                  <View key={st} style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                    <View style={[s.dot, { backgroundColor: done ? colors.brandPrimary : colors.surfaceTertiary }]}>
                      {done ? <Icon name="check" size={12} color={colors.onBrandPrimary} /> : <Text style={{ fontSize: 10, color: colors.muted }}>{i + 1}</Text>}
                    </View>
                    <Text style={[s.step, done && { color: colors.onSurface, fontWeight: "700" }]}>{STATUS_LABEL[st]}</Text>
                    {done ? <Text style={s.muted}>{new Date(done.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text> : null}
                  </View>
                );
              })}
            </View>
          ) : o.refund_note ? <Text style={[s.muted, { marginTop: space.sm }]}>{o.refund_note}</Text> : null}
        </Card>

        <Card style={{ gap: space.md }}>
          <View style={{ flexDirection: "row", gap: space.md }}>
            <Icon name="circle-slice-8" size={18} color={colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Pickup · {o.pickup_state} · Floor {o.pickup_floor}</Text>
              <Text testID="order-pickup-address" style={s.addr}>{o.pickup_address}</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: space.md }}>
            <Icon name="map-marker" size={18} color={colors.brandPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Drop · {o.drop_state} · Floor {o.drop_floor}</Text>
              <Text testID="order-drop-address" style={s.addr}>{o.drop_address}</Text>
            </View>
          </View>
          {(o.extra_stops ?? []).map((st, i) => (
            <View key={i} style={{ flexDirection: "row", gap: space.md }}>
              <Icon name="map-marker-plus-outline" size={18} color={colors.muted} />
              <Text style={[s.addr, { flex: 1, marginTop: 0 }]}>Stop {i + 1}: {st}</Text>
            </View>
          ))}
          <Text style={s.muted}>
            {q.distance_km} km · {q.vehicle.name} · {q.total_weight_kg} kg · {q.helpers ?? 0} helper(s) · {q.hours} hr · Lift {o.lift_available ? "available" : "not available"}
            {o.time_slot ? ` · Slot ${o.time_slot}` : ""}
          </Text>
        </Card>

        {isCustomer && o.pickup_otp && ["paid", "assigned"].includes(o.status) ? (
          <Card testID="pickup-otp-card" style={{ backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse }}>
            <Text style={{ color: colors.onSurfaceInverse, opacity: 0.8, fontSize: 13 }}>Pickup OTP · share only when the partner arrives</Text>
            <Text testID="pickup-otp-value" style={{ color: colors.onSurfaceInverse, fontSize: 32, fontWeight: "800", letterSpacing: 8, marginTop: 4 }}>{o.pickup_otp}</Text>
          </Card>
        ) : null}

        {isCustomer && o.status === "delivered" ? (
          <Card testID="rating-card">
            <SectionTitle>{o.rating ? "Your rating" : "Rate your partner"}</SectionTitle>
            <View style={{ flexDirection: "row", gap: space.sm }}>
              {[1, 2, 3, 4, 5].map((n) => {
                const filled = (o.rating?.stars ?? stars) >= n;
                return (
                  <Pressable key={n} testID={`rating-star-${n}`} disabled={!!o.rating} onPress={() => setStars(n)} hitSlop={4} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
                    <Icon name={filled ? "star" : "star-outline"} size={32} color={filled ? colors.warning : colors.borderStrong} />
                  </Pressable>
                );
              })}
            </View>
            {o.rating ? (
              o.rating.comment ? <Text style={[s.muted, { marginTop: space.sm }]}>“{o.rating.comment}”</Text> : null
            ) : (
              <View style={{ gap: space.sm, marginTop: space.sm }}>
                <Input testID="rating-comment-input" value={comment} onChangeText={setComment} placeholder="Tell us about the experience (optional)" />
                <Button testID="rating-submit-button" compact title="Submit rating" disabled={!stars} loading={busy === "rate"} onPress={() => act("rate", `/orders/${o.order_id}/rate`, { stars, comment: comment || undefined }, "Thanks for rating!")} />
              </View>
            )}
          </Card>
        ) : null}

        {o.partner_name ? (
          <Card testID="order-partner-card">
            <SectionTitle>Delivery partner</SectionTitle>
            <Text style={s.addr}>{o.partner_name}</Text>
            <Text style={s.muted}>{[o.partner_phone, o.partner_vehicle].filter(Boolean).join(" · ")}</Text>
          </Card>
        ) : null}

        {role !== "customer" ? (
          <Card>
            <SectionTitle>Customer</SectionTitle>
            <Text style={s.addr}>{o.customer_name || o.customer_email}</Text>
            <Text style={s.muted}>{[o.customer_phone, o.customer_email].filter(Boolean).join(" · ")}</Text>
          </Card>
        ) : null}

        <Card>
          <SectionTitle>Items</SectionTitle>
          {q.items.map((it) => <Row key={it.key} label={`${it.name} × ${it.qty}`} value={`${it.total_kg} kg`} />)}
        </Card>

        {role !== "customer" ? (
          <Card style={{ backgroundColor: colors.brandTertiary, borderColor: colors.brandSecondary }}>
            <SectionTitle>Earnings breakdown</SectionTitle>
            <Row label="Gross fare (excl. GST)" value={inr(q.taxable_value)} />
            <Row label={`LuggEase commission (${q.commission_rate}%)`} value={`- ${inr(q.platform_commission)}`} testID="order-commission" />
            {q.tip ? <Row label="Customer tip (100% yours)" value={`+ ${inr(q.tip)}`} testID="order-tip" /> : null}
            <Row label="Partner earnings" value={inr(q.partner_payout)} bold testID="order-partner-payout" />
            {o.settlement ? (
              <View testID="settlement-card" style={{ marginTop: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, gap: 2 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={s.label}>Settlement account</Text>
                  <Text testID="settlement-status" style={{ fontSize: 12, fontWeight: "800", color: o.settlement.status === "settled" ? colors.success : colors.warning }}>
                    {o.settlement.status === "settled" ? "SETTLED" : "PENDING"}
                  </Text>
                </View>
                {o.settlement.account_number_masked ? (
                  <Text style={s.addr}>{o.settlement.account_holder} · {o.settlement.bank_name ?? "Bank"} {o.settlement.account_number_masked} · IFSC {o.settlement.ifsc}</Text>
                ) : <Text style={s.muted}>No bank account on file{o.settlement.upi_id ? ` · UPI ${o.settlement.upi_id}` : ""}</Text>}
                {o.settlement.utr ? <Text testID="settlement-utr" style={s.muted}>UTR {o.settlement.utr} · {new Date(o.settlement.settled_at!).toLocaleDateString()}</Text> : null}
              </View>
            ) : null}
            {role === "admin" && o.status === "delivered" && o.settlement?.status !== "settled" ? (
              <View style={{ gap: space.sm, marginTop: space.md }}>
                <Input testID="settle-utr-input" value={utr} onChangeText={(t) => setUtr(t.toUpperCase())} autoCapitalize="characters" placeholder="Bank transfer UTR / reference" />
                <Button testID="settle-order-button" compact title={`Mark ${inr(q.partner_payout, 0)} as settled`} disabled={utr.trim().length < 6} loading={busy === "settle"} onPress={() => act("settle", `/admin/orders/${o.order_id}/settle`, { utr }, "Payout settled")} />
              </View>
            ) : null}
          </Card>
        ) : null}

        <InvoiceCard quote={q} order={o} />
        {o.payment ? <Text style={s.muted}>Paid via Razorpay ({o.payment.method ?? "online"}) · Ref {o.payment.payment_id}</Text> : null}

        {(isCustomer || role === "admin") && ["pending_payment", "paid", "assigned"].includes(o.status) ? (
          <Button testID="cancel-order-button" variant="danger" compact title="Cancel booking" loading={busy === "cancel"} onPress={() => setCancelOpen(true)} />
        ) : null}
        {cat ? null : null}
      </KeyboardAwareScrollView>

      {footer ? (
        <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
          <View style={[s.footer, { paddingBottom: insets.bottom + space.md }]}>{footer}</View>
        </KeyboardStickyView>
      ) : null}

      <Modal visible={cancelOpen} transparent animationType="fade" onRequestClose={() => setCancelOpen(false)}>
        <View style={[s.backdrop, { justifyContent: "center", padding: space.xl }]}>
          <View testID="cancel-confirm-dialog" style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: space.xl, gap: space.md }}>
            <Text style={s.sheetTitle}>Cancel this booking?</Text>
            <Text style={[s.muted, { fontSize: 14, lineHeight: 20 }]}>
              {o.status === "pending_payment"
                ? "No payment has been made, so nothing will be charged."
                : o.status === "assigned"
                  ? `A partner is already assigned. A cancellation fee of ${inr(cat?.cancellation_fee ?? 100, 0)} applies and ${inr(q.grand_total - (cat?.cancellation_fee ?? 100))} will be refunded.`
                  : `You'll get a full refund of ${inr(q.grand_total)} to your original payment method.`}
            </Text>
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <Button testID="cancel-dismiss-button" variant="outline" compact title="Keep booking" style={{ flex: 1 }} onPress={() => setCancelOpen(false)} />
              <Button testID="cancel-confirm-button" variant="danger" compact title="Yes, cancel" style={{ flex: 1 }} onPress={() => { setCancelOpen(false); act("cancel", `/orders/${o.order_id}/cancel`, undefined, "Booking cancelled"); }} />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={assignOpen} transparent animationType="slide" onRequestClose={() => setAssignOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setAssignOpen(false)} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + space.md }]}>
          <View style={s.handle} />
          <Text style={s.sheetTitle}>Assign approved partner</Text>
          {partners.isLoading ? <ActivityIndicator color={colors.brandPrimary} /> : null}
          <FlatList
            data={partners.data ?? []}
            keyExtractor={(p) => p.user_id}
            ListEmptyComponent={!partners.isLoading ? <Text style={s.muted}>No approved partners yet.</Text> : undefined}
            renderItem={({ item }) => {
              const veh = cat?.vehicles.find((v) => v.key === item.partner_profile?.vehicle_type);
              return (
                <Pressable
                  testID={`assign-partner-${item.user_id}`}
                  onPress={async () => { setAssignOpen(false); await act("assign", `/admin/orders/${o.order_id}/assign`, { partner_id: item.user_id }, "Partner assigned"); }}
                  style={({ pressed }) => [s.pRow, pressed && { backgroundColor: colors.surfaceTertiary }]}
                >
                  <View style={s.pIcon}><Icon name={(veh?.icon ?? "truck") as any} size={22} color={colors.onBrandTertiary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.addr}>{item.partner_profile?.full_name}</Text>
                    <Text style={s.muted}>{veh?.name} · {item.partner_profile?.vehicle_number} · {item.partner_profile?.city}</Text>
                  </View>
                  <Icon name="chevron-right" size={20} color={colors.muted} />
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  muted: { fontSize: 13, color: c.muted },
  label: { fontSize: 12, color: c.muted, fontWeight: "600" },
  addr: { fontSize: 15, color: c.onSurface, fontWeight: "600", marginTop: 2 },
  dot: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  step: { flex: 1, fontSize: 14, color: c.muted },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, backgroundColor: c.surfaceSecondary, borderTopWidth: 1, borderTopColor: c.border },
  backdrop: { flex: 1, backgroundColor: c.scrim },
  sheet: { maxHeight: "70%", backgroundColor: c.surfaceSecondary, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: space.lg },
  handle: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: c.borderStrong, marginVertical: space.sm },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: c.onSurface, marginBottom: space.sm },
  pRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md, paddingHorizontal: space.sm, borderRadius: radius.md },
  pIcon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
}));
