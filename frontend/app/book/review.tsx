import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { toPayload, useBooking } from "@/src/booking";
import { InvoiceCard, useCatalog } from "@/src/components/invoice-card";
import { Button, Card, Icon, inr, Input, radius, Row, ScreenHeader, SectionTitle, space, Stepper, useToast } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import type { Order, Quote } from "@/src/types";

const TIPS = [0, 50, 100, 200];

export default function BookReview() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: cat } = useCatalog();
  const { draft, update } = useBooking();
  const [busy, setBusy] = useState(false);
  const [coupon, setCoupon] = useState(draft.coupon_code);
  const payload = toPayload(draft);

  const { data: q, isLoading, error, isFetching } = useQuery({
    queryKey: ["quote", payload],
    queryFn: () => api<Quote>("/quote", { body: payload }),
    placeholderData: (prev) => prev,
  });

  const confirm = async () => {
    setBusy(true);
    try {
      const o = await api<Order>("/orders", { body: payload });
      qc.invalidateQueries({ queryKey: ["orders"] });
      router.dismissAll();
      router.push(`/order/${o.order_id}`);
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.root}>
      <ScreenHeader testID="book-review" title="Price & GST bill" subtitle={`Step 3 of 3 · ${cat?.categories.find((c) => c.key === draft.service_category)?.name ?? "Booking"}`} onBack={() => router.back()} />
      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: space.md }}>
          <ActivityIndicator size="large" color={colors.brandPrimary} />
          <Text style={s.muted}>Calculating your fare…</Text>
        </View>
      ) : error && !q ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, gap: space.md }}>
          <Icon name="alert-circle-outline" size={40} color={colors.error} />
          <Text testID="quote-error" style={[s.muted, { textAlign: "center" }]}>{(error as Error).message}</Text>
          <Button variant="outline" compact title="Go back" onPress={() => router.back()} />
        </View>
      ) : q ? (
        <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xl }}>
          <View>
            <SectionTitle>Choose vehicle</SectionTitle>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
              {q.vehicle_options.map((v) => {
                const on = q.vehicle.key === v.key;
                return (
                  <Pressable key={v.key} testID={`vehicle-choice-${v.key}`} onPress={() => update({ vehicle_key: v.key })} style={[s.veh, on && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }]}>
                    <Icon name={v.icon as any} size={28} color={on ? colors.brandPrimary : colors.onSurfaceTertiary} />
                    <Text style={s.vehName} numberOfLines={2}>{v.name}</Text>
                    <Text style={s.muted}>up to {v.max_kg} kg</Text>
                    <Text testID={`vehicle-estimate-${v.key}`} style={s.vehPrice}>{inr(v.estimate, 0)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text style={[s.muted, { marginTop: space.sm }]}>{q.total_weight_kg} kg load · {q.distance_km} km{q.extra_stops.length ? ` · ${q.extra_stops.length} extra stop(s)` : ""}</Text>
          </View>

          <Card style={{ gap: space.md }}>
            <View style={s.line}>
              <View style={{ flex: 1 }}>
                <Text style={s.vehName}>Helpers</Text>
                <Text style={s.muted}>Recommended: {q.recommended_helpers}{q.min_helpers ? " · packer required" : " · 0 = driver only, you load"}</Text>
              </View>
              <Stepper testID="helpers-stepper" value={q.helpers} min={q.min_helpers} onChange={(v) => update({ helpers: Math.min(v, 6) })} />
            </View>
            {q.labour_billable ? (
              <View style={s.line}>
                <View style={{ flex: 1 }}>
                  <Text style={s.vehName}>{q.service_type === "pack_and_shift" ? "Hours to pack & shift" : "Hours to shift"}</Text>
                  <Text style={s.muted}>Recommended: {q.recommended_hours} hr</Text>
                </View>
                <Stepper testID="hours-stepper" value={q.hours} min={q.min_hours} step={0.5} format={(v) => `${v}h`} onChange={(v) => update({ hours: v })} />
              </View>
            ) : null}
            {isFetching ? <Text style={s.muted}>Updating price…</Text> : null}
          </Card>

          <Card style={{ gap: space.sm }}>
            <SectionTitle>Coupon</SectionTitle>
            <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Input testID="coupon-input" value={coupon} onChangeText={(t) => setCoupon(t.toUpperCase())} autoCapitalize="characters" placeholder="Enter code" />
              </View>
              {draft.coupon_code ? (
                <Button testID="coupon-remove-button" variant="outline" compact title="Remove" style={{ height: 50 }} onPress={() => { setCoupon(""); update({ coupon_code: "" }); }} />
              ) : (
                <Button testID="coupon-apply-button" variant="secondary" compact title="Apply" style={{ height: 50 }} disabled={!coupon.trim()} onPress={() => update({ coupon_code: coupon.trim() })} />
              )}
            </View>
            {draft.coupon_code && q.coupon_message ? (
              <Text testID="coupon-message" style={{ fontSize: 13, color: q.discount ? colors.success : colors.error }}>
                {q.discount ? `${q.coupon_code} applied · you save ${inr(q.discount)}` : q.coupon_message}
              </Text>
            ) : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
              {cat?.coupons.map((c) => (
                <Pressable key={c.code} testID={`coupon-suggestion-${c.code}`} onPress={() => { setCoupon(c.code); update({ coupon_code: c.code }); }} style={s.couponChip}>
                  <Text style={s.couponCode}>{c.code}</Text>
                  <Text style={s.couponDesc} numberOfLines={2}>{c.desc}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Card>

          <Card style={{ gap: space.sm }}>
            <SectionTitle>Tip your partner</SectionTitle>
            <Text style={s.muted}>100% goes to the partner. Tips are not taxable.</Text>
            <View style={{ flexDirection: "row", gap: space.sm }}>
              {TIPS.map((t) => {
                const on = draft.tip === t;
                return (
                  <Pressable key={t} testID={`tip-${t}`} onPress={() => update({ tip: t })} style={[s.tip, on && { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse }]}>
                    <Text style={[s.tipText, on && { color: colors.onSurfaceInverse }]}>{t ? `₹${t}` : "No tip"}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>

          <InvoiceCard quote={q} billTo={{ name: user?.name ?? "", email: user?.email ?? "", gstin: draft.customer_gstin }} />

          <Input testID="customer-gstin-input" label="Your GSTIN (optional, for business invoice)" value={draft.customer_gstin} onChangeText={(t) => update({ customer_gstin: t.toUpperCase() })} autoCapitalize="characters" maxLength={15} placeholder="29ABCDE1234F1Z5" />

          <Card style={{ backgroundColor: colors.brandTertiary, borderColor: colors.brandSecondary }}>
            <SectionTitle>Where your money goes</SectionTitle>
            <Row label={`Delivery partner (95%${q.tip ? " + tip" : ""})`} value={inr(q.partner_payout)} testID="quote-partner-payout" />
            <Row label={`LuggEase commission (${q.commission_rate}%)`} value={inr(q.platform_commission)} testID="quote-commission" />
            <Row label="GST to Government" value={inr(q.gst.total)} />
          </Card>
        </KeyboardAwareScrollView>
      ) : null}

      {q ? (
        <View style={[s.footer, { paddingBottom: insets.bottom + space.md }]}>
          <Button testID="confirm-booking-button" title={`Confirm booking · ${inr(q.grand_total, 0)}`} loading={busy} disabled={isFetching} onPress={confirm} />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  muted: { fontSize: 12, color: c.muted },
  line: { flexDirection: "row", alignItems: "center", gap: space.md },
  veh: { width: 132, flexShrink: 0, padding: space.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surfaceSecondary, gap: 2 },
  vehName: { fontSize: 15, fontWeight: "800", color: c.onSurface },
  vehPrice: { fontSize: 16, fontWeight: "800", color: c.onSurface, marginTop: space.xs },
  couponChip: { width: 170, flexShrink: 0, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: c.brandPrimary, backgroundColor: c.brandTertiary },
  couponCode: { fontSize: 14, fontWeight: "800", color: c.onBrandTertiary },
  couponDesc: { fontSize: 11, color: c.onSurfaceTertiary, marginTop: 2 },
  tip: { flex: 1, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceSecondary },
  tipText: { fontSize: 14, fontWeight: "700", color: c.onSurface },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, backgroundColor: c.surfaceSecondary, borderTopWidth: 1, borderTopColor: c.border },
}));
