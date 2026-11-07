import { useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Button, Card, Icon, radius, Row, ScreenHeader, SectionTitle, space, useToast } from "@/src/components/ui";
import { AppEnv, BUILD_ENV, currentEnv, ENVIRONMENTS, setEnv } from "@/src/env";
import { makeStyles, useTheme } from "@/src/theme";

type Health = { ok: boolean; ms: number; env?: string; version?: string; database?: string; payments?: string };

async function probe(url: string): Promise<Health> {
  if (!url) return { ok: false, ms: 0 };
  const t = Date.now();
  try {
    const r = await fetch(`${url}/api/system/info`);
    const d = await r.json();
    return { ok: r.ok, ms: Date.now() - t, ...d };
  } catch {
    return { ok: false, ms: Date.now() - t };
  }
}

export default function Deployment() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { user, logout } = useAuth();
  const [active, setActive] = useState<AppEnv>(currentEnv());
  const [seeding, setSeeding] = useState(false);
  const [seeded, setSeeded] = useState<{ email: string; role: string }[] | null>(null);
  const health = useQuery({ queryKey: ["env-health"], queryFn: () => Promise.all(ENVIRONMENTS.map((e) => probe(e.url))) });

  const runtime = Constants.executionEnvironment === "storeClient" ? "Expo Go (preview)" : Platform.OS === "web" ? "Web preview" : "Standalone native build";

  const switchTo = async (env: AppEnv) => {
    if (env === active) return;
    await setEnv(env);
    setActive(env);
    toast(`Switched to ${ENVIRONMENTS.find((e) => e.key === env)?.label}. Please sign in again.`, "info");
    await logout();
  };

  const seed = async () => {
    setSeeding(true);
    try {
      const r = await api<{ users: { email: string; role: string }[] }>("/admin/seed-test-users", { method: "POST" });
      setSeeded(r.users);
      toast("Test users ready", "success");
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setSeeding(false);
    }
  };

  return (
    <View style={s.root}>
      <ScreenHeader testID="deployment" title="Deployment & environments" subtitle="Development · QA · Production" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: insets.bottom + space.xl }}>
        <Card>
          <SectionTitle>This build</SectionTitle>
          <Row label="App version" value={Constants.expoConfig?.version ?? "1.0.0"} testID="build-version" />
          <Row label="Runs as" value={runtime} testID="build-runtime" />
          <Row label="Platform" value={`${Platform.OS} ${Platform.Version ?? ""}`} />
          <Row label="Built for" value={ENVIRONMENTS.find((e) => e.key === BUILD_ENV)?.label ?? BUILD_ENV} testID="build-env" />
          <Row label="Bundle ID" value={Platform.OS === "ios" ? Constants.expoConfig?.ios?.bundleIdentifier ?? "-" : Constants.expoConfig?.android?.package ?? "-"} />
        </Card>

        <SectionTitle>Environments</SectionTitle>
        {ENVIRONMENTS.map((e, i) => {
          const h = health.data?.[i];
          const on = active === e.key;
          const configured = !!e.url;
          return (
            <Pressable key={e.key} testID={`env-card-${e.key}`} disabled={!configured} onPress={() => switchTo(e.key)} style={[s.env, on && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }, !configured && { opacity: 0.6 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                <Icon name={on ? "radiobox-marked" : "radiobox-blank"} size={22} color={on ? colors.brandPrimary : colors.borderStrong} />
                <View style={{ flex: 1 }}>
                  <Text style={s.envTitle}>{e.label}</Text>
                  <Text style={s.muted}>{e.desc}</Text>
                </View>
                {health.isLoading ? <ActivityIndicator color={colors.brandPrimary} /> : (
                  <View testID={`env-status-${e.key}`} style={[s.pill, { backgroundColor: !configured ? colors.surfaceTertiary : h?.ok ? colors.success : colors.error }]}>
                    <Text style={[s.pillText, { color: !configured ? colors.onSurfaceTertiary : colors.onSuccess }]}>{!configured ? "Not set up" : h?.ok ? `Online · ${h.ms}ms` : "Offline"}</Text>
                  </View>
                )}
              </View>
              {configured ? (
                <View style={{ marginTop: space.sm }}>
                  <Text style={s.mono} numberOfLines={1}>{e.url}</Text>
                  {h?.ok ? <Text style={s.muted}>Server v{h.version} · env {h.env} · db {h.database} · {h.payments}</Text> : null}
                </View>
              ) : (
                <Text style={[s.muted, { marginTop: space.sm }]}>Add the {e.key === "qa" ? "EXPO_PUBLIC_QA_BACKEND_URL" : "EXPO_PUBLIC_PROD_BACKEND_URL"} value once this environment is deployed.</Text>
              )}
            </Pressable>
          );
        })}
        <Button testID="env-refresh-button" variant="outline" compact icon="refresh" title="Re-check environments" onPress={() => health.refetch()} />

        <Card>
          <SectionTitle>Release checklist</SectionTitle>
          {[
            "Development: build and preview features in this workspace",
            "QA: deploy a separate copy, set its URL above, test with seeded users",
            "Production: Publish → Deploy, then generate Android (APK/AAB) and iOS (TestFlight) builds",
            "Switch Razorpay to live keys and replace sample GSTIN & bank details before go-live",
          ].map((t, i) => (
            <View key={t} style={{ flexDirection: "row", gap: space.sm, marginTop: space.sm }}>
              <View style={s.step}><Text style={s.stepText}>{i + 1}</Text></View>
              <Text style={[s.muted, { flex: 1, fontSize: 13 }]}>{t}</Text>
            </View>
          ))}
        </Card>

        {user?.role === "admin" ? (
          <Card>
            <SectionTitle>Test users (all roles)</SectionTitle>
            <Text style={s.muted}>Creates or refreshes demo customers, partners (approved, pending, rejected, incomplete), a no-role user and an admin. Disabled in production.</Text>
            <Button testID="seed-test-users-button" compact title="Create / refresh test users" icon="account-multiple-plus" loading={seeding} style={{ marginTop: space.md }} onPress={seed} />
            {seeded?.map((u) => <Row key={u.email} label={u.role} value={u.email} />)}
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  muted: { fontSize: 12, color: c.muted },
  mono: { fontSize: 12, color: c.onSurfaceTertiary, fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) },
  env: { padding: space.lg, borderRadius: radius.lg, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surfaceSecondary },
  envTitle: { fontSize: 16, fontWeight: "800", color: c.onSurface },
  pill: { borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 4 },
  pillText: { fontSize: 11, fontWeight: "800" },
  step: { width: 22, height: 22, borderRadius: 11, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  stepText: { fontSize: 11, fontWeight: "800", color: c.onBrandTertiary },
}));
