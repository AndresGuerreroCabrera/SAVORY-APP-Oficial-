import { useRouter } from "expo-router";
import { Camera, Check, Search, UserRound } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { TextStyle } from "react-native";

import { floatingShadow, theme } from "../../constants/theme";
import { createGroup, getCurrentUserFriendsForGroups, type SocialProfile } from "../../services/groups";
import { compressImageFile } from "../../services/imageCompression";
import { SavoryIcon, type SavoryIconGlyph } from "../ui/SavoryIcon";
import { ListBackButton } from "./ListBackButton";
import { ListPageShell } from "./ListPageShell";

const CameraIcon = Camera as SavoryIconGlyph;
const CheckIcon = Check as SavoryIconGlyph;
const SearchIcon = Search as SavoryIconGlyph;
const UserIcon = UserRound as SavoryIconGlyph;
const MAX_GROUP_PHOTO_BYTES = 6 * 1024 * 1024;
const webInputReset: TextStyle & {
  boxShadow?: string;
  caretColor?: string;
  cursor?: string;
  outline?: string;
  outlineColor?: string;
  outlineWidth?: number;
} = {
  boxShadow: "none",
  caretColor: theme.colors.text,
  cursor: "text",
  outline: "none",
  outlineColor: "transparent",
  outlineWidth: 0,
};
const inputPlatformStyle = Platform.OS === "web" ? webInputReset : null;

export function CreateGroupScreen() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [friends, setFriends] = useState<SocialProfile[]>([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visibleFriends = useMemo(() => {
    const normalizedQuery = normalizeText(query);

    return friends.filter((friend) => normalizeText(friend.username).includes(normalizedQuery));
  }, [friends, query]);

  useEffect(() => {
    let active = true;

    getCurrentUserFriendsForGroups()
      .then(({ data, error: loadError }) => {
        if (!active) {
          return;
        }

        setFriends(data);
        if (loadError) {
          setError(loadError.message);
        }
      })
      .catch(() => {
        if (active) {
          setError("No se pudieron cargar tus amigos.");
        }
      })
      .finally(() => {
        if (active) {
          setLoadingFriends(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const handlePhotoPick = async (fileList: FileList | null) => {
    const file = fileList?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/") || file.size > MAX_GROUP_PHOTO_BYTES) {
      setError("Usa una imagen menor de 6 MB.");
      return;
    }

    try {
      setAvatarUrl(
        await compressImageFile(file, {
          maxHeight: 640,
          maxWidth: 640,
          quality: 0.78,
        }),
      );
    } catch {
      setError("No se pudo comprimir la foto del grupo.");
    }
  };

  const toggleFriend = (friendId: string) => {
    setSelectedFriendIds((current) =>
      current.includes(friendId) ? current.filter((id) => id !== friendId) : [...current, friendId],
    );
  };

  const handleCreateGroup = async () => {
    const cleanName = name.trim();

    if (!cleanName) {
      setError("Ponle un nombre al grupo.");
      return;
    }

    setSaving(true);
    setError(null);

    const { data, error: createError } = await createGroup({
      avatarUrl,
      friendIds: selectedFriendIds,
      name: cleanName,
    });

    setSaving(false);

    if (createError || !data) {
      setError(createError?.message ?? "No se pudo crear el grupo.");
      return;
    }

    router.replace(`/group/${data.id}` as never);
  };

  return (
    <ListPageShell title="Crear grupo">
      {({ contentWidth }) => (
        <View style={[styles.contentBlock, { width: contentWidth }]}>
          <ListBackButton width={contentWidth} />

          <View style={styles.panel}>
            <input
              accept="image/*"
              ref={fileInputRef}
              style={{ display: "none" }}
              type="file"
              onChange={(event) => {
                void handlePhotoPick(event.currentTarget.files);
                event.currentTarget.value = "";
              }}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => fileInputRef.current?.click()}
              style={({ pressed }) => [styles.avatarPicker, pressed && styles.pressed]}
            >
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarPreview} />
              ) : (
                <SavoryIcon color={theme.colors.coral} glyph={CameraIcon} size={28} strokeWidth={2.3} />
              )}
            </Pressable>

            <TextInput
              onChangeText={setName}
              placeholder="Nombre del grupo"
              placeholderTextColor={theme.colors.faint}
              selectionColor={theme.colors.text}
              style={[styles.nameInput, inputPlatformStyle]}
              value={name}
            />

            <View style={styles.searchShell}>
              <SavoryIcon color={theme.colors.muted} glyph={SearchIcon} size={18} strokeWidth={2.1} />
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setQuery}
                placeholder="Buscar amigos"
                placeholderTextColor={theme.colors.faint}
                selectionColor={theme.colors.text}
                style={[styles.searchInput, inputPlatformStyle]}
                value={query}
              />
            </View>

            <Text style={styles.sectionTitle}>Tus amigos</Text>
            {loadingFriends ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={theme.colors.coral} />
                <Text style={styles.helperText}>Cargando amigos</Text>
              </View>
            ) : visibleFriends.length === 0 ? (
              <Text style={styles.helperText}>{friends.length === 0 ? "Todavia no tienes amigos para añadir." : "No hay amigos con ese nombre."}</Text>
            ) : (
              <View style={styles.friendsList}>
                {visibleFriends.map((friend) => {
                  const selected = selectedFriendIds.includes(friend.id);

                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      key={friend.id}
                      onPress={() => toggleFriend(friend.id)}
                      style={({ pressed }) => [styles.friendRow, selected && styles.friendRowSelected, pressed && styles.pressed]}
                    >
                      {friend.avatar_url ? (
                        <Image source={{ uri: friend.avatar_url }} style={styles.friendAvatar} />
                      ) : (
                        <View style={styles.friendAvatarFallback}>
                          <SavoryIcon color={theme.colors.coral} glyph={UserIcon} size={19} strokeWidth={2.2} />
                        </View>
                      )}
                      <Text numberOfLines={1} style={styles.friendName}>
                        {friend.username}
                      </Text>
                      {selected ? (
                        <View style={styles.selectedBadge}>
                          <SavoryIcon color={theme.colors.white} glyph={CheckIcon} size={15} strokeWidth={2.5} />
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            )}

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={handleCreateGroup}
              style={({ pressed }) => [styles.primaryButton, saving && styles.disabledButton, pressed && styles.pressed]}
            >
              {saving ? <ActivityIndicator color={theme.colors.white} /> : <Text style={styles.primaryButtonText}>Crear grupo</Text>}
            </Pressable>
          </View>
        </View>
      )}
    </ListPageShell>
  );
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const styles = StyleSheet.create({
  contentBlock: {
    gap: 12,
    width: "100%",
  },
  panel: {
    ...floatingShadow,
    backgroundColor: theme.colors.surfaceGlass,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  avatarPicker: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: theme.colors.coralSoft,
    borderColor: "#FFDAD5",
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 86,
    justifyContent: "center",
    overflow: "hidden",
    width: 86,
  },
  avatarPreview: {
    height: "100%",
    width: "100%",
  },
  nameInput: {
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "800",
    height: 52,
    paddingHorizontal: 14,
  },
  searchShell: {
    alignItems: "center",
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: 9,
    height: 48,
    paddingHorizontal: 12,
  },
  searchInput: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    height: "100%",
    minWidth: 0,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 20,
  },
  friendsList: {
    gap: 8,
  },
  friendRow: {
    alignItems: "center",
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 54,
    paddingHorizontal: 10,
  },
  friendRowSelected: {
    backgroundColor: theme.colors.coralSoft,
    borderColor: theme.colors.coral,
  },
  friendAvatar: {
    backgroundColor: theme.colors.surfaceSoft,
    borderRadius: theme.radius.pill,
    height: 34,
    width: 34,
  },
  friendAvatarFallback: {
    alignItems: "center",
    backgroundColor: theme.colors.coralSoft,
    borderRadius: theme.radius.pill,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  friendName: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 19,
  },
  selectedBadge: {
    alignItems: "center",
    backgroundColor: theme.colors.coral,
    borderRadius: theme.radius.pill,
    height: 26,
    justifyContent: "center",
    width: 26,
  },
  loadingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
  },
  helperText: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: theme.colors.text,
    borderRadius: theme.radius.pill,
    height: 50,
    justifyContent: "center",
  },
  primaryButtonText: {
    color: theme.colors.white,
    fontSize: 14,
    fontWeight: "900",
  },
  disabledButton: {
    opacity: 0.62,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.74,
    transform: [{ scale: 0.99 }],
  },
});
