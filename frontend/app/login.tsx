import {Linking} from "react-native";
import { Image } from "react-native";
import { LinearGradient } from "@/src/components/linear-gradient";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { Button, Input, radius, space } from "@/src/components/ui";
import { BrandIcon } from "@/src/components/brand-icon";
import { makeStyles, useTheme } from "@/src/theme";

const HERO = "https://images.unsplash.com/photo-1586781383963-8e66f88077ec?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200";

export default function Login() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { loginEmail, registerEmail, loginGoogle, resetPassword, resendVerification, completeVerification, logout } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [verification, setVerification] = useState(false);
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [gBusy, setGBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (busy || gBusy) return;
    setError("");
    if (!email.trim() || !password || (mode === "register" && !name.trim())) {
      setError("Please fill all fields");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") await loginEmail(email.trim(), password);
      else { await registerEmail(name.trim(), email.trim(), password); setVerification(true); setMessage("Verification email sent. Check your inbox and spam folder."); }
    } catch (e: any) {
      setError(e.message);
      if (e.message?.includes("verify your email")) setVerification(true);
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    if (busy || gBusy) return;
    setGBusy(true);
    setError("");
    try {
      await loginGoogle();
    } catch (e: any) {
      setError(e.message || "Google sign-in failed. Please try again.");
    } finally {
      setGBusy(false);
    }
  };

  async function run(action: () => Promise<void>) {
    if (busy || gBusy) return;
    setBusy(true); setError(""); setMessage("");
    try { await action(); } catch (e: any) { setError(e.message || "Please try again."); } finally { setBusy(false); }
  }

  return (
    <View style={s.root}>
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}>
        <View style={s.hero}>
          <Image source={{ uri: HERO }} style={{ position: "absolute", width: "100%", height: "100%" }} resizeMode="cover" />
          <LinearGradient colors={["transparent", colors.scrim]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "80%" }} />
          <View style={{ padding: space.xl, paddingTop: insets.top + space.xl }}>
            <BrandIcon size={72} style={{marginBottom: space.md}} />
            <Text style={s.brand}>LuggEase</Text>
            <Text style={s.tag}>Shift anything, anywhere in India. Fair prices, only 5% platform fee.</Text>
          </View>
        </View>

        <View style={s.sheet}>
          <View style={s.segment}>
            {(["login", "register"] as const).map((m) => (
              <Pressable accessibilityRole="button" key={m} testID={`auth-mode-${m}`} disabled={busy || gBusy} onPress={() => { setMode(m); setError(""); setMessage(""); }} style={[s.segBtn, mode === m && s.segActive]}>
                <Text style={[s.segText, mode === m && { color: colors.onSurface }]}>{m === "login" ? "Sign in" : "Create account"}</Text>
              </Pressable>
            ))}
          </View>

          {!verification ? <View style={{ gap: space.md }}>
            {mode === "register" ? <Input testID="register-name-input" label="Full name" value={name} onChangeText={setName} autoComplete="name" /> : null}
            <Input testID="auth-email-input" label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
            <Input testID="auth-password-input" label="Password" value={password} onChangeText={setPassword} placeholder={mode === "register" ? "Minimum 8 characters" : "Your password"} secureTextEntry={!showPassword} autoComplete={mode === "register" ? "new-password" : "current-password"} />
            <Pressable accessibilityRole="button" onPress={() => setShowPassword(!showPassword)}><Text>{showPassword ? "Hide password" : "Show password"}</Text></Pressable>
            {error ? <Text testID="auth-error" style={{ color: colors.error, fontSize: 13 }}>{error}</Text> : null}
            <Button testID="auth-submit-button" title={mode === "login" ? "Sign in" : "Create account"} onPress={submit} loading={busy} disabled={gBusy} />
          </View> : <View style={{gap:space.md}}>
            <Text>Open the verification link in your email, then continue.</Text>
            <Button title="Continue after verification" loading={busy} onPress={() => run(completeVerification)} />
            <Button title="Resend verification email" disabled={busy} onPress={() => run(async () => { await resendVerification(); setMessage("Verification email sent."); })} />
            <Button title="Back to sign in" disabled={busy} onPress={() => run(async () => { await logout(); setVerification(false); setMode("login"); })} />
          </View>}
          {!!message && <Text accessibilityRole="alert">{message}</Text>}
          {verification && !!error && <Text accessibilityRole="alert" style={{color:colors.error}}>{error}</Text>}
          {!verification && <Button title="Forgot password?" variant="outline" disabled={busy || gBusy} onPress={() => run(async () => { await resetPassword(email); setMessage("If an account exists, a password reset link has been sent. Check your inbox and spam folder."); })} />}

          {!verification && <><View style={s.orRow}><View style={s.line} /><Text style={s.or}>or</Text><View style={s.line} /></View>
          <Button testID="google-login-button" variant="outline" icon="google" title="Continue with Google" onPress={google} loading={gBusy} disabled={busy} /></>}
          <Text style={s.legal}><Text accessibilityRole="link" onPress={() => Linking.openURL("https://luggease.innovease-ai.in/terms.html")}>Terms of Use</Text> · <Text accessibilityRole="link" onPress={() => Linking.openURL("https://luggease.innovease-ai.in/privacy.html")}>Privacy Policy</Text>{"\n"}By continuing you agree to LuggEase terms. Prices include applicable GST.</Text>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  hero: { height: 340, justifyContent: "flex-end", backgroundColor: c.surfaceInverse, overflow: "hidden" },
  brand: { fontSize: 34, fontWeight: "800", color: c.onSurfaceInverse, letterSpacing: -0.5 },
  tag: { fontSize: 15, color: c.onSurfaceInverse, opacity: 0.9, marginTop: space.xs, lineHeight: 21 },
  sheet: { marginTop: -space.xl, backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.xl, gap: space.lg },
  segment: { flexDirection: "row", backgroundColor: c.surfaceTertiary, borderRadius: radius.md, padding: 4 },
  segBtn: { flex: 1, height: 40, borderRadius: radius.sm + 2, alignItems: "center", justifyContent: "center" },
  segActive: { backgroundColor: c.surfaceSecondary },
  segText: { fontSize: 14, fontWeight: "700", color: c.muted },
  orRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  line: { flex: 1, height: 1, backgroundColor: c.divider },
  or: { color: c.muted, fontSize: 13 },
  legal: { fontSize: 12, color: c.muted, textAlign: "center" },
}));
