import { useRouter } from "expo-router";
import { Plus, Search, Users } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { TextStyle } from "react-native";

import { floatingShadow, theme } from "../../constants/theme";
import { getCurrentUserGroups, type GroupSummary } from "../../services/groups";
import { SavoryIcon, type SavoryIconGlyph } from "../ui/SavoryIcon";
import { ListBackButton } from "./ListBackButton";
import { ListPageShell } from "./ListPageShell";

const PlusIcon = Plus as SavoryIconGlyph;
const SearchIcon = Search as SavoryIconGlyph;
const UsersIcon = Users as SavoryIconGlyph;
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

export function GroupsScreen() {
  const router = useRouter();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const normalizedQuery = normalizeText(query);
  const visibleGroups = useMemo(
    () => groups.filter((group) => normalizeText(group.name).includes(normalizedQuery)),
    [groups, normalizedQuery],
  );

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: loadError } = await getCurrentUserGroups();

    if (loadError) {
      setGroups([]);
      setError(loadError.message);
    } else {
      setGroups(data);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  return (
    <ListPageShell title="Grupos">
      {({ contentWidth }) => (
        <View style={[styles.contentBlock, { width: contentWidth }]}>
          <ListBackButton width={contentWidth} />

          <View style={styles.toolbar}>
            <Pressable
              accessibilityLabel="Crear grupo"
              accessibilityRole="button"
              onPress={() => router.push("/create-group" as never)}
              style={({ pressed }) => [styles.createButton, pressed && styles.pressed]}
            >
              <SavoryIcon color={theme.colors.white} glyph={PlusIcon} size={24} strokeWidth={2.5} />
            </Pressable>
            <View style={styles.searchShell}>
              <SavoryIcon color={theme.colors.muted} glyph={SearchIcon} size={18} strokeWidth={2.2} />
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setQuery}
                placeholder="Buscar grupos"
                placeholderTextColor={theme.colors.faint}
                selectionColor={theme.colors.text}
                style={[styles.searchInput, inputPlatformStyle]}
                value={query}
              />
            </View>
          </View>

          {loading ? (
            <View style={styles.stateBlock}>
              <ActivityIndicator color={theme.colors.coral} />
              <Text style={styles.stateText}>Cargando grupos</Text>
            </View>
          ) : error ? (
            <View style={styles.stateBlock}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : visibleGroups.length === 0 ? (
            <View style={styles.stateBlock}>
              <Text style={styles.stateText}>{groups.length === 0 ? "Todavia no tienes grupos." : "No hay grupos con ese nombre."}</Text>
            </View>
          ) : (
            <View style={styles.groupList}>
              {visibleGroups.map((group) => (
                <GroupCard
                  group={group}
                  key={group.id}
                  onPress={() => router.push(`/group/${group.id}` as never)}
                />
              ))}
            </View>
          )}
        </View>
      )}
    </ListPageShell>
  );
}

type GroupCardProps = {
  group: GroupSummary;
  onPress: () => void;
};

function GroupCard({ group, onPress }: GroupCardProps) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.groupCard, pressed && styles.pressed]}>
      {group.avatar_url ? (
        <Image source={{ uri: group.avatar_url }} style={styles.groupAvatar} />
      ) : (
        <View style={styles.groupAvatarFallback}>
          <SavoryIcon color={theme.colors.coral} glyph={UsersIcon} size={24} strokeWidth={2.2} />
        </View>
      )}
      <View style={styles.groupTextBlock}>
        <Text numberOfLines={1} style={styles.groupName}>
          {group.name}
        </Text>
        <Text style={styles.groupMeta}>{group.member_count} usuarios</Text>
      </View>
    </Pressable>
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
  toolbar: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  createButton: {
    alignItems: "center",
    backgroundColor: theme.colors.coral,
    borderRadius: theme.radius.sm,
    height: 54,
    justifyContent: "center",
    width: 54,
  },
  searchShell: {
    ...floatingShadow,
    alignItems: "center",
    backgroundColor: theme.colors.surfaceGlass,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 9,
    height: 54,
    paddingHorizontal: 14,
  },
  searchInput: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    height: "100%",
    minWidth: 0,
  },
  groupList: {
    gap: 10,
  },
  groupCard: {
    ...floatingShadow,
    alignItems: "center",
    backgroundColor: theme.colors.surfaceGlass,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: 13,
    minHeight: 82,
    padding: 14,
  },
  groupAvatar: {
    backgroundColor: theme.colors.surfaceSoft,
    borderRadius: theme.radius.pill,
    height: 54,
    width: 54,
  },
  groupAvatarFallback: {
    alignItems: "center",
    backgroundColor: theme.colors.coralSoft,
    borderRadius: theme.radius.pill,
    height: 54,
    justifyContent: "center",
    width: 54,
  },
  groupTextBlock: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  groupName: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 22,
  },
  groupMeta: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17,
  },
  stateBlock: {
    backgroundColor: theme.colors.surfaceGlass,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  stateText: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 19,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 19,
  },
  pressed: {
    opacity: 0.74,
    transform: [{ scale: 0.99 }],
  },
});
