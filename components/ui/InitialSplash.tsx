import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { theme } from "../../constants/theme";

const SPLASH_DURATION_MS = 900;

export function InitialSplash() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => setVisible(false), SPLASH_DURATION_MS);

    return () => clearTimeout(timeout);
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <View pointerEvents="none" style={styles.overlay}>
      <Text style={styles.title}>Savory</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: "center",
    backgroundColor: theme.colors.coral,
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 9999,
  },
  title: {
    color: theme.colors.white,
    fontSize: 42,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 50,
  },
});
