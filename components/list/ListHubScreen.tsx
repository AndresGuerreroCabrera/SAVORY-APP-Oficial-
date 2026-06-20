import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { theme } from "../../constants/theme";
import { FiltersDropdown } from "./FiltersDropdown";
import { ListPageShell } from "./ListPageShell";

export function ListHubScreen() {
  const router = useRouter();

  return (
    <ListPageShell title="Lista">
      {({ contentWidth }) => (
        <View style={[styles.contentBlock, { width: contentWidth }]}>
          <View style={styles.buttonRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/wishlist" as never)}
              style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
            >
              <Text style={styles.actionText}>Deseados</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/groups" as never)}
              style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
            >
              <Text style={styles.actionText}>Grupos</Text>
            </Pressable>
          </View>

          <FiltersDropdown width={contentWidth} />
        </View>
      )}
    </ListPageShell>
  );
}

const styles = StyleSheet.create({
  contentBlock: {
    gap: 12,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
  },
  actionButton: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceGlass,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderTopColor: theme.colors.coral,
    borderTopWidth: 2,
    borderWidth: 1,
    flex: 1,
    height: 58,
    justifyContent: "center",
  },
  actionText: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 21,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.99 }],
  },
});
