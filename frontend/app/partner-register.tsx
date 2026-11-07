import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useCatalog } from "@/src/components/invoice-card";
import { Button, Icon, Input, radius, ScreenHeader, SectionTitle, space, useToast } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import type { User } from "@/src/types";

export default function PartnerRegister() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { user, setUser, logout } = useAuth();
  const { data: cat } = useCatalog();
  const p = user?.partner_profile;
  const [f, setF] = useState({
    full_name: p?.full_name ?? user?.name ?? "", phone: p?.phone ?? user?.phone ?? "", city: p?.city ?? "",
    vehicle_type: p?.vehicle_type ?? "mini_truck", vehicle_number: p?.vehicle_number ?? "", license_number: p?.license_number ?? "",
    id_proof: p?.id_proof ?? "", upi_id: p?.upi_id ?? "", gstin: p?.gstin ?? "",
    bank_account_holder: p?.bank_account_holder ?? "", bank_account_number: p?.bank_account_number ?? "",
    bank_ifsc: p?.bank_ifsc ?? "", bank_name: p?.bank_name ?? "",
  });
  const [showAcc, setShowAcc] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const hasProfile = !!p;

  const submit = async () => {
    if (!f.full_name || !f.phone || !f.city || !f.vehicle_number || !f.license_number || !f.id_proof) {
      toast("Please fill all required fields", "error");
      return;
    }
    if (f.bank_account_number && !/^\d{9,18}$/.test(f.bank_account_number)) {
      toast("Account number must be 9 to 18 digits", "error");
      return;
    }
    if (f.bank_ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(f.bank_ifsc)) {
      toast("Enter a valid 11-character IFSC (e.g. SBIN0001234)", "error");
      return;
    }
    setBusy(true);
    try {
      const nul = (v: string) => v.trim() || null;
      const u = await api<User>("/partner/profile", { body: {
        ...f, upi_id: nul(f.upi_id), gstin: nul(f.gstin), bank_account_holder: nul(f.bank_account_holder),
        bank_account_number: nul(f.bank_account_number), bank_ifsc: nul(f.bank_ifsc), bank_name: nul(f.bank_name),
      } });
      setUser(u);
      toast("Submitted for admin approval", "success");
      router.replace("/(tabs)");
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.root}>
      <ScreenHeader testID="partner-register" title="Delivery Partner details" subtitle="Verified by LuggEase before you can take jobs" onBack={hasProfile ? () => router.back() : undefined} />
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + space.xl, gap: space.md }}>
        <SectionTitle>Personal</SectionTitle>
        <Input testID="partner-name-input" label="Full name *" value={f.full_name} onChangeText={set("full_name")} />
        <Input testID="partner-phone-input" label="Mobile number *" value={f.phone} onChangeText={set("phone")} keyboardType="phone-pad" maxLength={13} />
        <Input testID="partner-city-input" label="Operating city *" value={f.city} onChangeText={set("city")} placeholder="Bengaluru" />
        <Input testID="partner-id-input" label="PAN / Aadhaar (last 4) *" value={f.id_proof} onChangeText={set("id_proof")} autoCapitalize="characters" />

        <SectionTitle>Vehicle</SectionTitle>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {cat?.vehicles.map((v) => {
            const active = f.vehicle_type === v.key;
            return (
              <Pressable key={v.key} testID={`vehicle-option-${v.key}`} onPress={() => set("vehicle_type")(v.key)} style={[s.veh, active && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }]}>
                <Icon name={v.icon as any} size={26} color={active ? colors.brandPrimary : colors.onSurfaceTertiary} />
                <Text style={s.vehName}>{v.name}</Text>
                <Text style={s.vehCap}>up to {v.max_kg} kg</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Input testID="partner-vehicle-number-input" label="Vehicle registration no. *" value={f.vehicle_number} onChangeText={set("vehicle_number")} autoCapitalize="characters" placeholder="KA01AB1234" />
        <Input testID="partner-license-input" label="Driving licence no. *" value={f.license_number} onChangeText={set("license_number")} autoCapitalize="characters" />

        <SectionTitle>Payouts</SectionTitle>
        <Input testID="partner-upi-input" label="UPI ID (for payouts)" value={f.upi_id} onChangeText={set("upi_id")} autoCapitalize="none" placeholder="name@upi" />
        <Input testID="partner-gstin-input" label="GSTIN (if registered)" value={f.gstin} onChangeText={set("gstin")} autoCapitalize="characters" />

        <SectionTitle>Bank account for settlement</SectionTitle>
        <Input testID="partner-bank-holder-input" label="Account holder name" value={f.bank_account_holder} onChangeText={set("bank_account_holder")} />
        <Input testID="partner-bank-account-input" label="Account number" value={f.bank_account_number} onChangeText={(t) => set("bank_account_number")(t.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={18} secureTextEntry={!showAcc} />
        <Pressable testID="partner-bank-show-toggle" onPress={() => setShowAcc((v) => !v)} style={{ alignSelf: "flex-start", paddingVertical: space.xs }}>
          <Text style={{ color: colors.brandPrimary, fontWeight: "700", fontSize: 13 }}>{showAcc ? "Hide" : "Show"} account number</Text>
        </Pressable>
        <Input testID="partner-bank-ifsc-input" label="IFSC code" value={f.bank_ifsc} onChangeText={(t) => set("bank_ifsc")(t.toUpperCase())} autoCapitalize="characters" maxLength={11} placeholder="SBIN0001234" />
        <Input testID="partner-bank-name-input" label="Bank name" value={f.bank_name} onChangeText={set("bank_name")} placeholder="State Bank of India" />

        <View style={s.note}>
          <Icon name="information-outline" size={18} color={colors.onBrandTertiary} />
          <Text style={s.noteText}>LuggEase keeps only 5% commission. You receive 95% of the fare (excluding GST) for every completed job.</Text>
        </View>
        <Button testID="partner-submit-button" title={hasProfile ? "Update & resubmit" : "Submit for approval"} onPress={submit} loading={busy} />
        {!hasProfile ? (
          <Pressable testID="partner-register-logout" onPress={logout} style={{ alignSelf: "center", padding: space.md }}>
            <Text style={{ color: colors.muted, fontWeight: "600" }}>Log out</Text>
          </Pressable>
        ) : null}
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  veh: { width: 120, flexShrink: 0, padding: space.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surfaceSecondary, gap: 4 },
  vehName: { fontSize: 13, fontWeight: "700", color: c.onSurface },
  vehCap: { fontSize: 11, color: c.muted },
  note: { flexDirection: "row", gap: space.sm, backgroundColor: c.brandTertiary, padding: space.md, borderRadius: radius.md },
  noteText: { flex: 1, fontSize: 13, color: c.onSurfaceTertiary, lineHeight: 19 },
}));
