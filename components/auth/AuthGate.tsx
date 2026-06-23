import type { Session } from "@supabase/supabase-js";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";

import { theme } from "../../constants/theme";
import { isSupabaseConfigured, supabase } from "../../services/supabase";
import { ProfileScreen } from "../profile/ProfileScreen";

const splashImage = require("../../assets/splash.jpeg");

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
        <Image resizeMode="contain" source={splashImage} style={styles.loadingImage} />
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
    backgroundColor: theme.colors.coral,
    flex: 1,
    justifyContent: "center",
  },
  loadingImage: {
    height: "100%",
    width: "100%",
  },
});
