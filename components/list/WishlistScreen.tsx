import { StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";

import type { RestaurantFilters } from "../../types/restaurant";
import { emptyRestaurantFilters, FiltersDropdown } from "./FiltersDropdown";
import { ListBackButton } from "./ListBackButton";
import { ListPageShell } from "./ListPageShell";
import { SavedRestaurantList } from "../restaurant/SavedRestaurantList";

export function WishlistScreen() {
  const params = useLocalSearchParams<{ openPlaceId?: string | string[] }>();
  const openPlaceId = Array.isArray(params.openPlaceId) ? params.openPlaceId[0] : params.openPlaceId;
  const [filters, setFilters] = useState<RestaurantFilters>(emptyRestaurantFilters);

  return (
    <ListPageShell title="Deseados">
      {({ contentWidth }) => (
        <View style={[styles.contentBlock, { width: contentWidth }]}>
          <FiltersDropdown
            filters={filters}
            headerContent={<ListBackButton width={Math.max(180, contentWidth - 64)} />}
            onChange={setFilters}
            width={contentWidth}
          />
          <SavedRestaurantList contentWidth={contentWidth} filters={filters} openPlaceId={openPlaceId} status="want_to_go" />
        </View>
      )}
    </ListPageShell>
  );
}

const styles = StyleSheet.create({
  contentBlock: {
    gap: 12,
    width: "100%",
  },
});
