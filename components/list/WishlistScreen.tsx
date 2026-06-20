import { StyleSheet, View } from "react-native";

import { FiltersDropdown } from "./FiltersDropdown";
import { ListBackButton } from "./ListBackButton";
import { ListPageShell } from "./ListPageShell";

export function WishlistScreen() {
  return (
    <ListPageShell title="Deseados">
      {({ contentWidth }) => (
        <View style={[styles.contentBlock, { width: contentWidth }]}>
          <ListBackButton width={contentWidth} />
          <FiltersDropdown width={contentWidth} />
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
