import { StyleSheet, View } from "react-native";

import { ListBackButton } from "./ListBackButton";
import { ListPageShell } from "./ListPageShell";

export function GroupsScreen() {
  return (
    <ListPageShell title="Grupos">
      {({ contentWidth }) => (
        <View style={[styles.contentBlock, { width: contentWidth }]}>
          <ListBackButton width={contentWidth} />
        </View>
      )}
    </ListPageShell>
  );
}

const styles = StyleSheet.create({
  contentBlock: {
    width: "100%",
  },
});
