import { useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BottomNav } from "../navigation/BottomNav";
import { PlacesSearch } from "../search/PlacesSearch";
import { theme } from "../../constants/theme";
import type { SavoryPlace } from "../../types/place";

export default function SavoryMap() {
  const [query, setQuery] = useState("");
  const { width: viewportWidth } = useWindowDimensions();
  const emptyResults: SavoryPlace[] = [];
  const overlayWidth = Math.max(280, viewportWidth - 36);
  const controlWidth = Math.min(overlayWidth, 430);

  return (
    <View style={styles.container}>
      {/* Next step: replace this surface with react-native-maps while keeping the same overlay UI. */}
      <View style={styles.nativeMapSurface}>
        <View style={styles.streetLinePrimary} />
        <View style={styles.streetLineSecondary} />
        <View style={styles.streetLineTertiary} />
      </View>

      <SafeAreaView pointerEvents="box-none" style={styles.topOverlay}>
        <PlacesSearch
          disabled
          loading={false}
          onChangeText={setQuery}
          onSelectPlace={() => undefined}
          results={emptyResults}
          value={query}
          width={controlWidth}
        />
      </SafeAreaView>

      <View pointerEvents="box-none" style={styles.bottomOverlay}>
        <BottomNav width={controlWidth} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.mapCanvas,
    flex: 1,
    overflow: "hidden",
  },
  nativeMapSurface: {
    backgroundColor: theme.colors.mapCanvas,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  streetLinePrimary: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.pill,
    height: 18,
    left: "-15%",
    position: "absolute",
    top: "42%",
    transform: [{ rotate: "-18deg" }],
    width: "130%",
  },
  streetLineSecondary: {
    backgroundColor: "#E6E6DF",
    borderRadius: theme.radius.pill,
    height: 12,
    left: "8%",
    position: "absolute",
    top: "23%",
    transform: [{ rotate: "52deg" }],
    width: "92%",
  },
  streetLineTertiary: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.pill,
    height: 10,
    left: "-8%",
    position: "absolute",
    top: "64%",
    transform: [{ rotate: "22deg" }],
    width: "116%",
  },
  topOverlay: {
    alignItems: "center",
    left: 0,
    paddingHorizontal: 18,
    position: "absolute",
    right: 0,
    top: 0,
  },
  bottomOverlay: {
    alignItems: "center",
    bottom: 22,
    left: 18,
    position: "absolute",
    right: 18,
  },
});
