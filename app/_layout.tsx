import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { VercelAnalytics } from "../components/analytics/VercelAnalytics";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
      <VercelAnalytics />
    </SafeAreaProvider>
  );
}
