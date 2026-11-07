import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useBooking } from "@/src/booking";
import { useCatalog } from "@/src/components/invoice-card";
import { Button, Icon, radius, ScreenHeader, SectionTitle, space, Stepper } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import type { CatalogItem } from "@/src/types";

const TIERS = [
  { key: "shift_only" as const, title: "Shift only", gst: "GST 5%", points: ["Loading & unloading", "Transport in right-sized vehicle", "Helpers billed per hour"] },
  { key: "pack_and_shift" as const, title: "Pack & Shift", gst: "GST 18%", points: ["Bubble wrap, cartons & tape", "Professional packing per item", "Everything in Shift only"] },
];

export default function BookItems() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { draft, update } = useBooking();
  const { data: cat } = useCatalog();

  const setQty = (k: string, q: number) => update({ items: { ...draft.items, [k]: q }, hours: null, vehicle_key: null, helpers: null });
  const total = Object.values(draft.items).reduce((a, b) => a + b, 0);
  const kg = cat ? Object.entries(draft.items).reduce((a, [k, q]) => a + (cat.items.find((i) => i.key === k)?.weight ?? 0) * q, 0) : 0;

  const renderItem = (it: CatalogItem) => (
    <View key={it.key} style={s.item} testID={`item-row-${it.key}`}>
      <View style={s.itemIcon}><Icon name={it.icon as any} size={24} color={colors.onBrandTertiary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={s.itemName}>{it.name}</Text>
        <Text style={s.itemKg}>~{it.weight} kg each</Text>
      </View>
      <Stepper testID={`item-${it.key}`} value={draft.items[it.key] ?? 0} onChange={(v) => setQty(it.key, v)} />
    </View>
  );

  return (
    <View style={s.root}>
      <ScreenHeader testID="book-items" title="What are you moving?" subtitle={`Step 2 of 3 · ${cat?.categories.find((c) => c.key === draft.service_category)?.name ?? "Booking"}`} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xl }}>
        <SectionTitle>Service type</SectionTitle>
        <View style={{ flexDirection: "row", gap: space.md }}>
          {TIERS.map((t) => {
            const on = draft.service_type === t.key;
            return (
              <Pressable key={t.key} testID={`service-${t.key}`} onPress={() => update({ service_type: t.key, hours: null, helpers: null })} style={[s.tier, on && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={s.tierTitle}>{t.title}</Text>
                  <Icon name={on ? "radiobox-marked" : "radiobox-blank"} size={20} color={on ? colors.brandPrimary : colors.borderStrong} />
                </View>
                <Text style={s.tierGst}>{t.gst}</Text>
                {t.points.map((p) => (
                  <View key={p} style={{ flexDirection: "row", gap: 4, marginTop: 4 }}>
                    <Icon name="check" size={14} color={colors.success} style={{ marginTop: 1 }} />
                    <Text style={s.tierPoint}>{p}</Text>
                  </View>
                ))}
              </Pressable>
            );
          })}
        </View>

        <SectionTitle>Household & furniture</SectionTitle>
        <View style={s.list}>{cat?.items.filter((i) => i.size === "heavy").map(renderItem)}</View>
        <SectionTitle>Light items & parcels</SectionTitle>
        <View style={s.list}>{cat?.items.filter((i) => i.size === "light").map(renderItem)}</View>
      </ScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + space.md }]}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: space.sm }}>
          <Text testID="items-summary" style={s.sum}>{total ? `${total} item(s) · ~${kg} kg` : "Add items to continue"}</Text>
          <Text style={s.sumMuted}>{draft.service_type === "pack_and_shift" ? "Pack & Shift" : "Shift only"}</Text>
        </View>
        <Button testID="items-continue-button" title="See price & GST bill" disabled={!total} onPress={() => router.push("/book/review")} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  tier: { flex: 1, padding: space.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surfaceSecondary },
  tierTitle: { fontSize: 15, fontWeight: "800", color: c.onSurface },
  tierGst: { fontSize: 12, color: c.brandPrimary, fontWeight: "700", marginTop: 2, marginBottom: 4 },
  tierPoint: { flex: 1, fontSize: 12, color: c.onSurfaceTertiary, lineHeight: 16 },
  list: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, overflow: "hidden" },
  item: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderBottomWidth: 1, borderBottomColor: c.divider },
  itemIcon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  itemName: { fontSize: 14, fontWeight: "700", color: c.onSurface },
  itemKg: { fontSize: 12, color: c.muted, marginTop: 2 },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, backgroundColor: c.surfaceSecondary, borderTopWidth: 1, borderTopColor: c.border },
  sum: { fontSize: 14, fontWeight: "700", color: c.onSurface },
  sumMuted: { fontSize: 13, color: c.muted },
}));
