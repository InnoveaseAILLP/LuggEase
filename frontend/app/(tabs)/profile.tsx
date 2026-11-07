import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { useCatalog } from "@/src/components/invoice-card";
import { Button, Card, Icon, radius, Row, SectionTitle, space } from "@/src/components/ui";
import { usesNativeTabs } from "@/src/navigation";
import { makeStyles, useTheme } from "@/src/theme";

export default function Profile() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { data: cat } = useCatalog();
  const [busy, setBusy] = useState(false);
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const pp = user?.partner_profile;
  const roleLabel = { customer: "Customer", partner: "Delivery Partner", admin: "Admin" }[user?.role ?? "customer"];

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.lg, paddingBottom: bottomChrome + space.xl, gap: space.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.lg }}>
          {user?.picture ? (
            <Image source={{ uri: user.picture }} style={s.avatar} />
          ) : (
            <View style={[s.avatar, { alignItems: "center", justifyContent: "center", backgroundColor: colors.brandTertiary }]}>
              <Text style={{ fontSize: 24, fontWeight: "800", color: colors.brandPrimary }}>{(user?.name || user?.email || "?")[0].toUpperCase()}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text testID="profile-name" style={s.name}>{user?.name || "LuggEase user"}</Text>
            <Text testID="profile-email" style={s.muted}>{user?.email}</Text>
            <View style={s.rolePill}><Text testID="profile-role" style={s.roleText}>{roleLabel}</Text></View>
          </View>
        </View>

        {pp ? (
          <Card>
            <SectionTitle>Partner details</SectionTitle>
            <Row label="Status" value={(user?.partner_status ?? "").toUpperCase()} testID="profile-partner-status" />
            <Row label="Vehicle" value={cat?.vehicles.find((v) => v.key === pp.vehicle_type)?.name ?? pp.vehicle_type} />
            <Row label="Registration" value={pp.vehicle_number} />
            <Row label="City" value={pp.city} />
            <Row label="Phone" value={pp.phone} />
            <Row label="Settlement bank" value={pp.bank_account_number ? `${pp.bank_name ?? "Bank"} XXXX${pp.bank_account_number.slice(-4)}` : "Not added"} testID="profile-bank" />
            {pp.bank_ifsc ? <Row label="IFSC" value={pp.bank_ifsc} /> : null}
            <Button testID="profile-edit-partner-button" variant="outline" compact title="Edit details" style={{ marginTop: space.md }} onPress={() => router.push("/partner-register")} />
          </Card>
        ) : null}

        {cat ? (
          <Card>
            <SectionTitle>Billing entity</SectionTitle>
            <Text style={s.bold}>{cat.supplier.name}</Text>
            <Text style={s.muted}>{cat.supplier.address}</Text>
            <Row label="GSTIN" value={cat.supplier.gstin} />
            <Row label="PAN" value={cat.supplier.pan} />
            <Row label="GST (Shift only, SAC 996511)" value="5%" />
            <Row label="GST (Pack & Shift, SAC 996729)" value="18%" />
            <Row label="Platform commission" value={`${cat.commission_rate}%`} />
            <Row label="Bank" value={`${cat.supplier.bank.bank_name} · ${cat.supplier.bank.ifsc}`} />
          </Card>
        ) : null}

        <Pressable testID="open-deployment-button" onPress={() => router.push("/deployment")} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
          <Card>
            <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
              <Icon name="rocket-launch-outline" size={24} color={colors.brandPrimary} />
              <View style={{ flex: 1 }}>
                <Text style={s.bold}>Deployment & environments</Text>
                <Text style={s.muted}>Development · QA · Production, build info{user?.role === "admin" ? ", test users" : ""}</Text>
              </View>
              <Icon name="chevron-right" size={22} color={colors.muted} />
            </View>
          </Card>
        </Pressable>

        <Card>
          <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
            <Icon name="headset" size={24} color={colors.brandPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={s.bold}>Need help?</Text>
              <Text style={s.muted}>support@luggease.in · 9 AM to 9 PM</Text>
            </View>
          </View>
        </Card>

        <Button testID="logout-button" variant="danger" icon="logout" title="Log out" loading={busy} onPress={async () => { setBusy(true); await logout(); }} />
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  avatar: { width: 72, height: 72, borderRadius: radius.pill },
  name: { fontSize: 22, fontWeight: "800", color: c.onSurface },
  muted: { fontSize: 13, color: c.muted },
  bold: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  rolePill: { alignSelf: "flex-start", marginTop: space.xs, backgroundColor: c.brandTertiary, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 4 },
  roleText: { fontSize: 12, fontWeight: "700", color: c.onBrandTertiary },
}));
