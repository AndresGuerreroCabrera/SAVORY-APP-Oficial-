import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { theme } from "../../constants/theme";
import type { RestaurantFilters } from "../../types/restaurant";
import { emptyRestaurantFilters, FiltersDropdown } from "./FiltersDropdown";
import { ListPageShell } from "./ListPageShell";
import { SavedRestaurantList } from "../restaurant/SavedRestaurantList";

export function ListHubScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ openPlaceId?: string | string[] }>();
  const openPlaceId = Array.isArray(params.openPlaceId) ? params.openPlaceId[0] : params.openPlaceId;
  const [filters, setFilters] = useState<RestaurantFilters>(emptyRestaurantFilters);

  return (
    <ListPageShell hideHeader title="Lista">
      {({ contentWidth }) => (
        <View style={[styles.contentBlock, { width: contentWidth }]}>
          <FiltersDropdown
            filters={filters}
            headerContent={
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
            }
            includeVisibility
            onChange={setFilters}
            width={contentWidth}
          />
          <SavedRestaurantList contentWidth={contentWidth} filters={filters} openPlaceId={openPlaceId} status="visited" />
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
    gap: 8,
  },
  actionButton: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceGlass,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    flex: 1,
    height: 54,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  actionText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 21,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.99 }],
  },
});
