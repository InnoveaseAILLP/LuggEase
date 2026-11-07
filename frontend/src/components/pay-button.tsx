import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import { api } from "@/src/api";
import { Button, Icon, radius, space, useToast } from "@/src/components/ui";
import { useTheme } from "@/src/theme";

export function PayButton({ orderId, amountLabel, onDone }: { orderId: string; amountLabel: string; onDone: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const start = async () => {
    setBusy(true);
    try {
      const r = await api<{ checkout_url: string }>("/payments/create", { body: { order_id: orderId } });
      setUrl(r.checkout_url);
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const close = (msg?: string, kind?: "success" | "error" | "info") => {
    setUrl(null);
    if (msg) toast(msg, kind);
    onDone();
  };

  return (
    <>
      <Button testID="pay-now-button" title={`Pay ${amountLabel} with Razorpay`} icon="shield-lock-outline" loading={busy} onPress={start} />
      <Modal visible={!!url} animationType="slide" onRequestClose={() => close()}>
        <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top, paddingBottom: insets.bottom }}>
          <View style={{ flexDirection: "row", alignItems: "center", padding: space.md, gap: space.md }}>
            <Pressable testID="payment-close-button" onPress={() => close()} style={{ width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary }}>
              <Icon name="close" size={22} color={colors.onSurface} />
            </Pressable>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.onSurface }}>Secure payment</Text>
          </View>
          {url ? (
            <WebView
              testID="payment-webview"
              source={{ uri: url }}
              javaScriptEnabled
              domStorageEnabled
              originWhitelist={["*"]}
              setSupportMultipleWindows={false}
              onMessage={(e) => {
                const m = e.nativeEvent.data;
                if (m === "success") close("Payment successful", "success");
                else if (m === "failed") close("Payment could not be verified", "error");
                else if (m === "dismissed") close("Payment cancelled", "info");
              }}
            />
          ) : null}
        </View>
      </Modal>
    </>
  );
}
