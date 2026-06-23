import { useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";

import { theme } from "../../constants/theme";

const SPLASH_DURATION_MS = 900;
const splashImage = require("../../assets/splash.jpeg");

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
      <Image resizeMode="contain" source={splashImage} style={styles.image} />
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
  image: {
    height: "100%",
    width: "100%",
  },
});
