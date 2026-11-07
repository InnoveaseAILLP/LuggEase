import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useBooking } from "@/src/booking";
import { useCatalog } from "@/src/components/invoice-card";
import { OrderCard } from "@/src/components/order-card";
import { Card, Icon, IconName, radius, SectionTitle, space } from "@/src/components/ui";
import { usesNativeTabs } from "@/src/navigation";
import { makeStyles, useTheme } from "@/src/theme";
import type { Order } from "@/src/types";

const HERO = "https://images.unsplash.com/photo-1601467995997-ac1ae9a8fff4?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200";

const CATEGORY_DEFAULTS: Record<string, { items: Record<string, number>; service: "shift_only" | "pack_and_shift" }> = {
  home_shifting: { items: {}, service: "pack_and_shift" },
  furniture: { items: {}, service: "shift_only" },
  store_pickup: { items: {}, service: "shift_only" },
  parcel: { items: { parcel_small: 1 }, service: "shift_only" },
  junk_removal: { items: {}, service: "shift_only" },
  intercity: { items: {}, service: "pack_and_shift" },
};

export function CustomerHome() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { reset } = useBooking();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const { data, refetch, isRefetching } = useQuery({ queryKey: ["orders"], queryFn: () => api<Order[]>("/orders") });
  const active = data?.filter((o) => !["delivered", "cancelled"].includes(o.status)).slice(0, 2) ?? [];

  const { data: cat } = useCatalog();
  const start = (category = "home_shifting") => {
    const d = CATEGORY_DEFAULTS[category] ?? CATEGORY_DEFAULTS.home_shifting;
    reset({ items: d.items, service_type: d.service, service_category: category });
    router.push("/book");
  };

  return (
    <View style={s.root}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); }} tintColor={colors.brandPrimary} />}
        contentContainerStyle={{ paddingBottom: bottomChrome + space.xl }}
      >
        <View style={s.hero}>
          <Image source={{ uri: HERO }} style={{ position: "absolute", width: "100%", height: "100%" }} contentFit="cover" />
          <LinearGradient colors={["transparent", colors.scrim]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "85%" }} />
          <View style={{ padding: space.xl, paddingTop: insets.top + space.lg }}>
            <Text style={s.hello}>Hi {user?.name?.split(" ")[0] || "there"}</Text>
            <Text style={s.h1}>What are we moving today?</Text>
          </View>
        </View>

        <Animated.View entering={FadeInDown.duration(400)} style={{ paddingHorizontal: space.lg, marginTop: -space.xxl }}>
          <Pressable testID="start-booking-button" onPress={() => start()} style={({ pressed }) => [s.where, { opacity: pressed ? 0.9 : 1 }]}>
            <View style={s.whereIcon}><Icon name="map-marker-path" size={24} color={colors.onBrandPrimary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.whereTitle}>Where to?</Text>
              <Text style={s.whereSub}>Enter pickup & drop to get an instant GST quote</Text>
            </View>
            <Icon name="chevron-right" size={24} color={colors.muted} />
          </Pressable>
        </Animated.View>

        <View style={{ padding: space.lg, gap: space.md }}>
          <SectionTitle>What do you need?</SectionTitle>
          <View style={s.grid}>
            {cat?.categories.map((c, i) => (
              <Animated.View key={c.key} entering={FadeInDown.delay(60 * (i + 1)).duration(400)} style={s.gridCell}>
                <Pressable testID={`category-${c.key}`} onPress={() => start(c.key)} style={({ pressed }) => [s.quick, { opacity: pressed ? 0.9 : 1 }]}>
                  <View style={s.quickIcon}><Icon name={c.icon as IconName} size={26} color={colors.brandPrimary} /></View>
                  <Text style={s.quickTitle} numberOfLines={2}>{c.name}</Text>
                  <Text style={s.quickDesc} numberOfLines={2}>{c.desc}</Text>
                </Pressable>
              </Animated.View>
            ))}
          </View>

          {active.length ? (
            <>
              <SectionTitle>Active bookings</SectionTitle>
              {active.map((o) => <OrderCard key={o.order_id} order={o} />)}
            </>
          ) : null}

          <Card style={{ backgroundColor: colors.brandTertiary, borderColor: colors.brandSecondary }}>
            <Text style={s.promiseTitle}>Fair pricing, explained</Text>
            {[
              "Charges vary by distance, vehicle size and item weight",
              "Choose Pack & Shift or Shift-only, and set the hours you need",
              "GST tax invoice with CGST/SGST or IGST on every booking",
              "Only 5% platform commission — partners keep 95% plus 100% of tips",
              "Pickup OTP, coupons, multi-stop trips and partner ratings",
            ].map((t) => (
              <View key={t} style={{ flexDirection: "row", gap: space.sm, marginTop: space.sm }}>
                <Icon name="check-circle" size={18} color={colors.brandPrimary} />
                <Text style={s.promise}>{t}</Text>
              </View>
            ))}
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  hero: { height: 260, justifyContent: "flex-end", backgroundColor: c.surfaceInverse, overflow: "hidden" },
  hello: { fontSize: 15, color: c.onSurfaceInverse, opacity: 0.9 },
  h1: { fontSize: 28, fontWeight: "800", color: c.onSurfaceInverse, marginTop: 4, marginBottom: space.xxl, letterSpacing: -0.4 },
  where: {
    flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: space.lg,
    shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 4,
  },
  whereIcon: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  whereTitle: { fontSize: 18, fontWeight: "800", color: c.onSurface },
  whereSub: { fontSize: 13, color: c.muted, marginTop: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  gridCell: { width: "47%", flexGrow: 1 },
  quick: { gap: space.sm, backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: space.lg, borderWidth: 1, borderColor: c.border, minHeight: 148 },
  quickIcon: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  quickTitle: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  quickDesc: { fontSize: 13, color: c.muted, marginTop: 2 },
  promiseTitle: { fontSize: 16, fontWeight: "800", color: c.onSurface },
  promise: { flex: 1, fontSize: 13, color: c.onSurfaceTertiary, lineHeight: 19 },
}));
