// App level error boundary, mounted once in app/_layout.tsx. A render crash
// shows a reload screen instead of a blank app; the error is also logged so
// it shows up in the Metro output. Do not mount additional boundaries.


import { Component, type ErrorInfo, type PropsWithChildren } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import { makeStyles } from "@/src/theme";

type ErrorBoundaryState = { error: Error | null };

export class ErrorBoundary extends Component<PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary] render crash:", error, info.componentStack ?? "");
  }

  resetError = (): void => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return <ErrorFallback resetError={this.resetError} />;
    }
    return this.props.children;
  }
}

function ErrorFallback({ resetError }: { resetError: () => void }) {
  const styles = useStyles();

  const handleReload = async () => {
    try {
      if (Platform.OS === "web") window.location.reload();
      else resetError();
    } catch {
      // Reload is unavailable in some environments; retry the render instead.
      resetError();
    }
  };

  return (
    <View style={styles.container} testID="error-fallback">
      <View style={styles.content}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.message}>Please reload the app to continue.</Text>
        <Pressable
          onPress={handleReload}
          testID="error-fallback-reload"
          accessibilityRole="button"
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonText}>Reload app</Text>
        </Pressable>
      </View>

    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    justifyContent: "center",
    padding: 24,
  },
  content: {
    alignItems: "center",
    gap: 12,
  },
  title: {
    color: colors.onSurface,
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  message: {
    color: colors.muted,
    fontSize: 15,
    textAlign: "center",
  },
  button: {
    marginTop: 8,
    backgroundColor: colors.brandPrimary,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 14,
    minWidth: 180,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: colors.onBrandPrimary,
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
}));
