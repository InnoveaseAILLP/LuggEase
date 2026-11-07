import { MaterialDesignIcons } from "@react-native-vector-icons/material-design-icons";
import { createContext, ReactNode, useCallback, useContext, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleProp, Text, TextInput, TextInputProps, View, ViewStyle } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles, useTheme } from "@/src/theme";
import type { OrderStatus } from "@/src/types";

export const Icon = MaterialDesignIcons;
export type IconName = React.ComponentProps<typeof MaterialDesignIcons>["name"];

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };

export function inr(n: number, dec = 2) {
  const neg = n < 0;
  const [i, d] = Math.abs(n).toFixed(dec).split(".");
  const last3 = i.slice(-3);
  const rest = i.slice(0, -3);
  const body = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3 : last3;
  return `${neg ? "-" : ""}₹${body}${dec ? "." + d : ""}`;
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  paid: "Finding partner",
  assigned: "Partner assigned",
  picked_up: "Picked up",
  in_transit: "In transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export function Button({
  title, onPress, variant = "primary", loading, disabled, icon, testID, style, compact,
}: {
  title: string; onPress?: () => void; variant?: "primary" | "secondary" | "outline" | "danger";
  loading?: boolean; disabled?: boolean; icon?: IconName; testID?: string; style?: StyleProp<ViewStyle>; compact?: boolean;
}) {
  const { colors } = useTheme();
  const bg = { primary: colors.brandPrimary, secondary: colors.brandSecondary, outline: colors.surfaceSecondary, danger: colors.surfaceSecondary }[variant];
  const fg = { primary: colors.onBrandPrimary, secondary: colors.onBrandSecondary, outline: colors.onSurface, danger: colors.error }[variant];
  const off = disabled || loading;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        {
          height: compact ? 44 : 56, borderRadius: radius.md, backgroundColor: bg, flexDirection: "row",
          alignItems: "center", justifyContent: "center", gap: space.sm, paddingHorizontal: space.lg,
          borderWidth: variant === "outline" || variant === "danger" ? 1 : 0,
          borderColor: variant === "danger" ? colors.error : colors.borderStrong,
          opacity: off ? 0.5 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {icon ? <Icon name={icon} size={20} color={fg} /> : null}
          <Text style={{ color: fg, fontSize: 16, fontWeight: "700" }}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

const useCardStyles = makeStyles((c) => ({
  card: {
    backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: space.lg, borderWidth: 1, borderColor: c.border,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
}));

export function Card({ children, style, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const s = useCardStyles();
  return <View testID={testID} style={[s.card, style]}>{children}</View>;
}

const useInputStyles = makeStyles((c) => ({
  label: { fontSize: 13, fontWeight: "600", color: c.onSurfaceTertiary, marginBottom: space.xs },
  input: {
    minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary,
    paddingHorizontal: space.lg, fontSize: 16, color: c.onSurface,
  },
}));

export function Input({ label, style, ...props }: TextInputProps & { label?: string }) {
  const s = useInputStyles();
  const { colors } = useTheme();
  return (
    <View style={{ gap: 2 }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput placeholderTextColor={colors.muted} style={[s.input, props.multiline && { paddingVertical: space.md, minHeight: 72, textAlignVertical: "top" }, style]} {...props} />
    </View>
  );
}

export function StatusBadge({ status, testID }: { status: OrderStatus; testID?: string }) {
  const { colors } = useTheme();
  const map: Record<OrderStatus, [string, string]> = {
    pending_payment: [colors.brandTertiary, colors.onBrandTertiary],
    paid: [colors.surfaceTertiary, colors.info],
    assigned: [colors.brandSecondary, colors.onBrandSecondary],
    picked_up: [colors.brandSecondary, colors.onBrandSecondary],
    in_transit: [colors.brandSecondary, colors.onBrandSecondary],
    delivered: [colors.success, colors.onSuccess],
    cancelled: [colors.surfaceTertiary, colors.error],
  };
  const [bg, fg] = map[status];
  return (
    <View testID={testID} style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.xs, alignSelf: "flex-start" }}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: "700" }}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

export function Stepper({ value, onChange, min = 0, step = 1, testID, format }: {
  value: number; onChange: (v: number) => void; min?: number; step?: number; testID: string; format?: (v: number) => string;
}) {
  const { colors } = useTheme();
  const btn = (icon: IconName, delta: number, id: string, disabled: boolean) => (
    <Pressable
      testID={`${testID}-${id}`}
      disabled={disabled}
      onPress={() => onChange(Math.max(min, +(value + delta).toFixed(2)))}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center",
        backgroundColor: delta > 0 ? colors.brandPrimary : colors.surfaceTertiary, opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      <Icon name={icon} size={18} color={delta > 0 ? colors.onBrandPrimary : colors.onSurface} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
      {btn("minus", -step, "minus", value <= min)}
      <Text testID={`${testID}-value`} style={{ minWidth: 32, textAlign: "center", fontSize: 16, fontWeight: "700", color: colors.onSurface }}>
        {format ? format(value) : value}
      </Text>
      {btn("plus", step, "plus", false)}
    </View>
  );
}

export function ScreenHeader({ title, subtitle, onBack, testID }: { title: string; subtitle?: string; onBack?: () => void; testID?: string }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <View style={{ paddingTop: insets.top + space.sm, paddingHorizontal: space.lg, paddingBottom: space.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider, flexDirection: "row", alignItems: "center", gap: space.md }}>
      {onBack ? (
        <Pressable testID={`${testID ?? "screen"}-back-button`} onPress={onBack} hitSlop={8} style={{ width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary }}>
          <Icon name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 20, fontWeight: "800", color: colors.onSurface }} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <Text style={{ fontSize: 13, fontWeight: "700", color: colors.muted, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: space.sm }}>{children}</Text>;
}

export function Row({ label, value, bold, testID }: { label: string; value: string; bold?: boolean; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md, paddingVertical: 6 }}>
      <Text style={{ flex: 1, fontSize: bold ? 15 : 14, color: bold ? colors.onSurface : colors.onSurfaceTertiary, fontWeight: bold ? "800" : "400" }}>{label}</Text>
      <Text testID={testID} style={{ fontSize: bold ? 16 : 14, color: colors.onSurface, fontWeight: bold ? "800" : "600" }}>{value}</Text>
    </View>
  );
}

type ToastFn = (msg: string, kind?: "success" | "error" | "info") => void;
const ToastCtx = createContext<ToastFn>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; kind: string; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const show = useCallback<ToastFn>((msg, kind = "info") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ msg, kind, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);
  const bg = toast?.kind === "error" ? colors.error : toast?.kind === "success" ? colors.success : colors.surfaceInverse;
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast ? (
        <Animated.View
          key={toast.id}
          entering={FadeInDown}
          pointerEvents="none"
          style={{ position: "absolute", left: space.lg, right: space.lg, bottom: insets.bottom + 90, backgroundColor: bg, borderRadius: radius.md, padding: space.lg }}
        >
          <Text testID="toast-message" style={{ color: colors.onSurfaceInverse, fontSize: 14, fontWeight: "600" }}>{toast.msg}</Text>
        </Animated.View>
      ) : null}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
