import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, LogBox, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { AuthProvider, useAuth } from "@/src/auth";
import { BookingProvider } from "@/src/booking";
import { ErrorBoundary } from "@/src/components/error-boundary";
import { ToastProvider } from "@/src/components/ui";
import { queryClient } from "@/src/query-client";
import { useTheme } from "@/src/theme";

LogBox.ignoreAllLogs(true);

function Gate() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { colors } = useTheme();

  useEffect(() => {
    if (loading) return;
    const first = segments[0] as string | undefined;
    let target: string | null = null;
    if (!user) target = first === "login" ? null : "/login";
    else if (!user.role) target = first === "onboarding" ? null : "/onboarding";
    else if (user.role === "partner" && (!user.partner_profile || user.partner_status === "incomplete")) target = first === "partner-register" ? null : "/partner-register";
    else if (first === "login" || first === "onboarding" || first === undefined) target = "/(tabs)";
    if (target) router.replace(target as any);
  }, [user, loading, segments, router]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      {!loading ? <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} /> : null}
      {loading ? (
        <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }]}>
          <ActivityIndicator testID="app-loading" size="large" color={colors.brandPrimary} />
        </View>
      ) : null}
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <KeyboardProvider>
            <AuthProvider>
              <BookingProvider>
                <ToastProvider>
                  <StatusBar style="dark" />
                  <Gate />
                </ToastProvider>
              </BookingProvider>
            </AuthProvider>
          </KeyboardProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
