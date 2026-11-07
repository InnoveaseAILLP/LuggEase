import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useBooking } from "@/src/booking";
import { useCatalog } from "@/src/components/invoice-card";
import { Button, Card, Icon, Input, radius, ScreenHeader, SectionTitle, space, Stepper, useToast } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

function nextDays(n: number) {
  const out: { key: string; label: string; sub: string }[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const key = `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
    out.push({ key, label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en-GB", { weekday: "short" }), sub: `${d.getDate()}/${d.getMonth() + 1}` });
  }
  return out;
}

export default function BookLocations() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { draft, update } = useBooking();
  const { data: cat } = useCatalog();
  const [picker, setPicker] = useState<"pickup_state" | "drop_state" | null>(null);
  const [calc, setCalc] = useState(false);
  const days = nextDays(7);

  const autoDistance = async () => {
    if (draft.pickup_address.trim().length < 3 || draft.drop_address.trim().length < 3) {
      toast("Enter both addresses first", "error");
      return;
    }
    setCalc(true);
    try {
      const r = await api<{ distance_km: number }>("/geo/distance", {
        body: { pickup: `${draft.pickup_address}, ${draft.pickup_state}`, drop: `${draft.drop_address}, ${draft.drop_state}` },
      });
      update({ distance_km: String(r.distance_km) });
      toast(`Estimated ${r.distance_km} km by road`, "success");
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setCalc(false);
    }
  };

  const valid = draft.pickup_address.trim().length >= 3 && draft.drop_address.trim().length >= 3 && parseFloat(draft.distance_km) > 0;

  return (
    <View style={s.root}>
      <ScreenHeader testID="book-locations" title="Pickup & drop" subtitle={`Step 1 of 3 · ${cat?.categories.find((c) => c.key === draft.service_category)?.name ?? "Booking"}`} onBack={() => router.back()} />
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xl }}>
        <Card style={{ gap: space.md }}>
          <View style={s.locHead}><Icon name="circle-slice-8" size={18} color={colors.success} /><Text style={s.locTitle}>Pickup</Text></View>
          <Input testID="pickup-address-input" value={draft.pickup_address} onChangeText={(t) => update({ pickup_address: t })} placeholder="House no, street, area, city, pincode" multiline />
          <StateField label="Pickup state" value={draft.pickup_state} onPress={() => setPicker("pickup_state")} testID="pickup-state-select" />
          <View style={s.floorRow}>
            <Text style={s.floorLabel}>Floor</Text>
            <Stepper testID="pickup-floor-stepper" value={draft.pickup_floor} onChange={(v) => update({ pickup_floor: v })} />
          </View>
        </Card>

        <Card style={{ gap: space.md }}>
          <View style={s.locHead}><Icon name="map-marker" size={18} color={colors.brandPrimary} /><Text style={s.locTitle}>Drop</Text></View>
          <Input testID="drop-address-input" value={draft.drop_address} onChangeText={(t) => update({ drop_address: t })} placeholder="House no, street, area, city, pincode" multiline />
          <StateField label="Drop state" value={draft.drop_state} onPress={() => setPicker("drop_state")} testID="drop-state-select" />
          <View style={s.floorRow}>
            <Text style={s.floorLabel}>Floor</Text>
            <Stepper testID="drop-floor-stepper" value={draft.drop_floor} onChange={(v) => update({ drop_floor: v })} />
          </View>
          <View style={s.floorRow}>
            <Text style={s.floorLabel}>Lift available at both ends</Text>
            <Switch testID="lift-switch" value={draft.lift_available} onValueChange={(v) => update({ lift_available: v })} trackColor={{ true: colors.brandPrimary, false: colors.borderStrong }} thumbColor={colors.surfaceSecondary} />
          </View>
        </Card>

        <Card style={{ gap: space.md }}>
          <View style={s.floorRow}>
            <Text style={s.locTitle}>Extra stops</Text>
            <Text style={s.hint}>₹{cat?.stop_charge ?? 100} per stop · max 3</Text>
          </View>
          {draft.extra_stops.map((st, i) => (
            <View key={i} style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Input testID={`extra-stop-input-${i}`} value={st} onChangeText={(t) => update({ extra_stops: draft.extra_stops.map((x, j) => (j === i ? t : x)) })} placeholder={`Stop ${i + 1} address`} />
              </View>
              <Pressable testID={`remove-stop-${i}`} hitSlop={6} onPress={() => update({ extra_stops: draft.extra_stops.filter((_, j) => j !== i) })} style={s.iconBtn}>
                <Icon name="close" size={20} color={colors.onSurface} />
              </Pressable>
            </View>
          ))}
          {draft.extra_stops.length < 3 ? (
            <Button testID="add-stop-button" variant="outline" compact icon="plus" title="Add a stop" onPress={() => update({ extra_stops: [...draft.extra_stops, ""] })} />
          ) : null}
        </Card>

        <Card style={{ gap: space.md }}>
          <SectionTitle>Distance</SectionTitle>
          <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-end" }}>
            <View style={{ flex: 1 }}>
              <Input testID="distance-input" value={draft.distance_km} onChangeText={(t) => update({ distance_km: t.replace(/[^0-9.]/g, "") })} placeholder="Distance in km" keyboardType="decimal-pad" />
            </View>
            <Button testID="auto-distance-button" variant="secondary" compact icon="map-marker-distance" title="Auto" loading={calc} onPress={autoDistance} style={{ height: 50 }} />
          </View>
          <Text style={s.hint}>Tap Auto to estimate road distance from the addresses, or type it in.</Text>
        </Card>

        <View>
          <SectionTitle>Moving date</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {days.map((d) => {
              const on = draft.move_date === d.key;
              return (
                <Pressable key={d.key} testID={`move-date-${d.key}`} onPress={() => update({ move_date: d.key })} style={[s.day, on && { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse }]}>
                  <Text style={[s.dayLabel, on && { color: colors.onSurfaceInverse }]}>{d.label}</Text>
                  <Text style={[s.daySub, on && { color: colors.onSurfaceInverse }]}>{d.sub}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View>
          <SectionTitle>Time slot</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {(cat?.time_slots ?? ["Now"]).map((t) => {
              const on = draft.time_slot === t;
              return (
                <Pressable key={t} testID={`time-slot-${t}`} onPress={() => update({ time_slot: t })} style={[s.slot, on && { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse }]}>
                  <Text style={[s.dayLabel, on && { color: colors.onSurfaceInverse }]}>{t === "Now" ? "Now (≤60 min)" : t}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </KeyboardAwareScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + space.md }]}>
        <Button testID="locations-continue-button" title="Continue to items" disabled={!valid} onPress={() => router.push("/book/items")} />
      </View>

      <Modal visible={!!picker} animationType="slide" transparent onRequestClose={() => setPicker(null)}>
        <Pressable style={s.backdrop} onPress={() => setPicker(null)} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + space.md }]}>
          <View style={s.handle} />
          <Text style={s.sheetTitle}>Select state</Text>
          <FlatList
            data={cat?.states ?? []}
            keyExtractor={(x) => x}
            renderItem={({ item }) => (
              <Pressable testID={`state-option-${item.replace(/\s/g, "-")}`} onPress={() => { update({ [picker!]: item } as any); setPicker(null); }} style={({ pressed }) => [s.stateRow, pressed && { backgroundColor: colors.surfaceTertiary }]}>
                <Text style={s.stateText}>{item}</Text>
                {picker && draft[picker] === item ? <Icon name="check" size={20} color={colors.brandPrimary} /> : null}
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

function StateField({ label, value, onPress, testID }: { label: string; value: string; onPress: () => void; testID: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} style={s.stateField}>
      <View style={{ flex: 1 }}>
        <Text style={s.hint}>{label}</Text>
        <Text style={s.stateText}>{value}</Text>
      </View>
      <Icon name="chevron-down" size={22} color={colors.muted} />
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  locHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  locTitle: { fontSize: 16, fontWeight: "800", color: c.onSurface },
  floorRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  floorLabel: { fontSize: 14, color: c.onSurfaceTertiary, fontWeight: "600", flex: 1 },
  hint: { fontSize: 12, color: c.muted },
  stateField: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: space.sm, minHeight: 52 },
  stateText: { fontSize: 15, color: c.onSurface, fontWeight: "600" },
  day: { width: 76, height: 60, flexShrink: 0, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  slot: { height: 44, flexShrink: 0, paddingHorizontal: space.lg, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  iconBtn: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceTertiary },
  dayLabel: { fontSize: 13, fontWeight: "700", color: c.onSurface },
  daySub: { fontSize: 12, color: c.muted },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, backgroundColor: c.surfaceSecondary, borderTopWidth: 1, borderTopColor: c.border },
  backdrop: { flex: 1, backgroundColor: c.scrim },
  sheet: { maxHeight: "70%", backgroundColor: c.surfaceSecondary, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: space.lg },
  handle: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: c.borderStrong, marginVertical: space.sm },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: c.onSurface, marginBottom: space.sm },
  stateRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: space.md, paddingHorizontal: space.sm, borderRadius: radius.sm, minHeight: 48 },
}));
