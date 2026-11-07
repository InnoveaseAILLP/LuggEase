import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { Button, Icon, IconName, Input, radius, space, useToast } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

const OPTIONS: { role: "customer" | "partner"; title: string; desc: string; icon: IconName }[] = [
  { role: "customer", title: "I want to move things", desc: "Book parcels, furniture or full house shifting", icon: "sofa-outline" },
  { role: "partner", title: "Become a Delivery Partner", desc: "Register your vehicle and earn 95% of every fare", icon: "truck-delivery-outline" },
];

export default function Onboarding() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, setRole, logout } = useAuth();
  const toast = useToast();
  const [role, setR] = useState<"customer" | "partner">("customer");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [busy, setBusy] = useState(false);

  const go = async () => {
    if (phone && !/^[6-9]\d{9}$/.test(phone.replace(/\D/g, "").slice(-10))) {
      toast("Enter a valid 10-digit mobile number", "error");
      return;
    }
    setBusy(true);
    try {
      await setRole(role, phone.replace(/\D/g, "").slice(-10) || undefined);
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.root}>
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.xl, paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xl, gap: space.lg }}>
        <Text style={s.h1}>Welcome{user?.name ? `, ${user.name.split(" ")[0]}` : ""}</Text>
        <Text style={s.sub}>How would you like to use LuggEase?</Text>
        {OPTIONS.map((o) => {
          const active = role === o.role;
          return (
            <Pressable key={o.role} testID={`role-option-${o.role}`} onPress={() => setR(o.role)} style={[s.card, active && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }]}>
              <View style={s.iconBox}><Icon name={o.icon} size={28} color={colors.brandPrimary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>{o.title}</Text>
                <Text style={s.desc}>{o.desc}</Text>
              </View>
              <Icon name={active ? "radiobox-marked" : "radiobox-blank"} size={24} color={active ? colors.brandPrimary : colors.borderStrong} />
            </Pressable>
          );
        })}
        <Input testID="onboarding-phone-input" label="Mobile number (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="98XXXXXXXX" maxLength={13} />
        <Button testID="onboarding-continue-button" title="Continue" onPress={go} loading={busy} />
        <Pressable testID="onboarding-logout-button" onPress={logout} style={{ alignSelf: "center", padding: space.md }}>
          <Text style={{ color: colors.muted, fontWeight: "600" }}>Use a different account</Text>
        </Pressable>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  h1: { fontSize: 28, fontWeight: "800", color: c.onSurface },
  sub: { fontSize: 15, color: c.muted, marginTop: -space.sm },
  card: { flexDirection: "row", alignItems: "center", gap: space.lg, padding: space.lg, borderRadius: radius.lg, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surfaceSecondary },
  iconBox: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  desc: { fontSize: 13, color: c.muted, marginTop: 2 },
}));
