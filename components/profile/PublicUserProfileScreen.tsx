import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, UserRound } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { floatingShadow, theme } from "../../constants/theme";
import { supabase } from "../../services/supabase";
import { BottomNav } from "../navigation/BottomNav";
import { SavedRestaurantList } from "../restaurant/SavedRestaurantList";
import { ImageLightbox } from "../ui/ImageLightbox";
import { SavoryIcon, type SavoryIconGlyph } from "../ui/SavoryIcon";

type PublicProfile = {
  avatar_url: string | null;
  display_name: string | null;
  id: string;
  username: string;
};

const BackIcon = ArrowLeft as SavoryIconGlyph;
const UserIcon = UserRound as SavoryIconGlyph;

export function PublicUserProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { width: viewportWidth } = useWindowDimensions();
  const overlayWidth = Math.max(280, viewportWidth - 36);
  const contentWidth = Math.min(overlayWidth, 520);
  const navWidth = Math.min(overlayWidth, 430);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<{ caption: string; uri: string } | null>(null);

  useEffect(() => {
    if (!supabase || !id) {
      setLoading(false);
      setError("No se pudo cargar el perfil.");
      return;
    }

    const client = supabase;
    let active = true;

    async function loadProfile() {
      setLoading(true);
      const { data, error: profileError } = await client
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .eq("id", id)
        .maybeSingle();

      if (!active) {
        return;
      }

      setLoading(false);

      if (profileError || !data) {
        setError("No se encontró este usuario.");
        return;
      }

      setProfile(normalizePublicProfile(data));
    }

    void loadProfile();

    return () => {
      active = false;
    };
  }, [id]);

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={[styles.header, { width: contentWidth }]}>
            <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
              <SavoryIcon color={theme.colors.text} glyph={BackIcon} size={19} strokeWidth={2.2} />
            </Pressable>
            <Text style={styles.title}>Perfil</Text>
          </View>

          <View style={[styles.panel, { width: contentWidth }]}>
            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={theme.colors.coral} />
                <Text style={styles.helperText}>Cargando usuario</Text>
              </View>
            ) : error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : profile ? (
              <View style={styles.identityRow}>
                <Pressable
                  accessibilityRole={profile.avatar_url ? "imagebutton" : "button"}
                  onPress={() => {
                    if (profile.avatar_url) {
                      setPreviewPhoto({ caption: profile.username, uri: profile.avatar_url });
                    }
                  }}
                  style={styles.avatar}
                >
                  {profile.avatar_url ? (
                    <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
                  ) : (
                    <SavoryIcon color={theme.colors.coral} glyph={UserIcon} size={26} strokeWidth={2.3} />
                  )}
                </Pressable>
                <View style={styles.identityText}>
                  <Text numberOfLines={1} style={styles.username}>
                    {profile.username}
                  </Text>
                  {profile.display_name ? (
                    <Text numberOfLines={1} style={styles.displayName}>
                      {profile.display_name}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>

          {profile ? (
            <View style={[styles.section, { width: contentWidth }]}>
              <Text style={styles.sectionTitle}>Restaurantes públicos</Text>
              <SavedRestaurantList contentWidth={contentWidth} publicUserId={profile.id} status="visited" />
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>

      <View pointerEvents="box-none" style={styles.bottomNav}>
        <BottomNav width={navWidth} />
      </View>
      <ImageLightbox
        caption={previewPhoto?.caption ?? null}
        imageUri={previewPhoto?.uri ?? null}
        onClose={() => setPreviewPhoto(null)}
        title={previewPhoto?.caption ?? "Foto de perfil"}
        visible={Boolean(previewPhoto?.uri)}
      />
    </View>
  );
}

function normalizePublicProfile(value: unknown): PublicProfile {
  const record = value as Partial<PublicProfile>;

  return {
    avatar_url: typeof record.avatar_url === "string" ? record.avatar_url : null,
    display_name: typeof record.display_name === "string" ? record.display_name : null,
    id: String(record.id ?? ""),
    username: String(record.username ?? "usuario"),
  };
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    alignItems: "center",
    paddingBottom: 118,
    paddingHorizontal: 18,
    paddingTop: 22,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginBottom: 18,
  },
  backButton: {
    alignItems: "center",
    borderRadius: theme.radius.pill,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  title: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 34,
  },
  panel: {
    ...floatingShadow,
    backgroundColor: theme.colors.surfaceGlass,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    padding: 18,
  },
  identityRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: theme.colors.coralSoft,
    borderRadius: theme.radius.pill,
    height: 58,
    justifyContent: "center",
    overflow: "hidden",
    width: 58,
  },
  avatarImage: {
    height: "100%",
    width: "100%",
  },
  identityText: {
    flex: 1,
    minWidth: 0,
  },
  username: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 27,
  },
  displayName: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 2,
  },
  section: {
    gap: 12,
    marginTop: 14,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 23,
  },
  loadingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  helperText: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 19,
  },
  bottomNav: {
    alignItems: "center",
    bottom: 22,
    left: 18,
    position: "absolute",
    right: 18,
  },
});
