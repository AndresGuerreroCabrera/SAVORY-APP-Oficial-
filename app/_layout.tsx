import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { VercelAnalytics } from "../components/analytics/VercelAnalytics";
import { VercelSpeedInsights } from "../components/analytics/VercelSpeedInsights";
import { ProductAnalyticsTracker } from "../components/analytics/ProductAnalyticsTracker";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
      <ProductAnalyticsTracker />
      <VercelAnalytics />
      <VercelSpeedInsights />
    </SafeAreaProvider>
  );
}
