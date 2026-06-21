import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { VercelAnalytics } from "../components/analytics/VercelAnalytics";
import { VercelSpeedInsights } from "../components/analytics/VercelSpeedInsights";
import { ProductAnalyticsTracker } from "../components/analytics/ProductAnalyticsTracker";
import { InitialSplash } from "../components/ui/InitialSplash";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
        <ProductAnalyticsTracker />
        <VercelAnalytics />
        <VercelSpeedInsights />
        <InitialSplash />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    position: "relative",
  },
});
