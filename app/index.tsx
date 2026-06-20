import { StyleSheet, View } from "react-native";

import SavoryMap from "../components/map/SavoryMap";

export default function HomeScreen() {
  return (
    <View style={styles.screen}>
      <SavoryMap />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
});
