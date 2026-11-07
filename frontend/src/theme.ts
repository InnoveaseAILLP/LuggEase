// Design tokens for LuggEase. Light theme only. Keys match the "color" block of /app/design_guidelines.json.
import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#FAFAFA",
  onSurface: "#1A1A1A",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#1A1A1A",
  surfaceTertiary: "#F0F0F0",
  onSurfaceTertiary: "#4A4A4A",
  surfaceInverse: "#1A1A1A",
  onSurfaceInverse: "#FFFFFF",
  muted: "#757575",

  brand: "#CC5500",
  onBrand: "#FFFFFF",
  brandPrimary: "#CC5500",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#F7E5D4",
  onBrandSecondary: "#CC5500",
  brandTertiary: "#FDECE1",
  onBrandTertiary: "#CC5500",

  success: "#2E7D32",
  onSuccess: "#FFFFFF",
  warning: "#F57F17",
  onWarning: "#FFFFFF",
  error: "#D32F2F",
  onError: "#FFFFFF",
  info: "#424242",
  onInfo: "#FFFFFF",

  border: "#E0E0E0",
  borderStrong: "#BDBDBD",
  divider: "#EEEEEE",
  scrim: "rgba(0,0,0,0.7)",
};

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

setColorScheme?.(themes.dark ? null : defaultScheme);

export const colors = light;

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = (system === "light" || system === "dark") && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
