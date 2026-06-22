import type { Session } from "@supabase/supabase-js";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { theme } from "../../constants/theme";
import { isSupabaseConfigured, supabase } from "../../services/supabase";
import { ProfileScreen } from "../profile/ProfileScreen";

type AuthGateProps = {
  children: ReactNode;
};

export function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (mounted) {
          setSession(data.session);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setSession(null);
          setLoading(false);
        }
      });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color={theme.colors.coral} />
        <Text style={styles.loadingText}>Cargando sesion</Text>
      </View>
    );
  }

  if (!isSupabaseConfigured || !session) {
    return <ProfileScreen authOnly />;
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  loadingScreen: {
    alignItems: "center",
    backgroundColor: theme.colors.background,
    flex: 1,
    gap: 10,
    justifyContent: "center",
  },
  loadingText: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 18,
  },
});
