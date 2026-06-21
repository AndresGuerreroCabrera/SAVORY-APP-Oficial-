import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { theme } from "../../constants/theme";
import { BottomNav } from "../navigation/BottomNav";

type ListPageShellProps = {
  children?: (layout: { contentWidth: number }) => ReactNode;
  hideHeader?: boolean;
  title: string;
};

export function ListPageShell({ children, hideHeader, title }: ListPageShellProps) {
  const { width: viewportWidth } = useWindowDimensions();
  const overlayWidth = Math.max(280, viewportWidth - 36);
  const contentWidth = Math.min(overlayWidth, 430);

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {hideHeader ? null : (
            <View style={[styles.header, { width: contentWidth }]}>
              <View style={styles.titleAccent} />
              <Text style={styles.title}>{title}</Text>
            </View>
          )}

          {children?.({ contentWidth })}
        </ScrollView>
      </SafeAreaView>

      <View pointerEvents="box-none" style={styles.bottomNav}>
        <BottomNav width={contentWidth} />
      </View>
    </View>
  );
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
    gap: 8,
    marginBottom: 18,
  },
  titleAccent: {
    backgroundColor: theme.colors.coral,
    borderRadius: theme.radius.pill,
    height: 4,
    width: 34,
  },
  title: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 34,
  },
  bottomNav: {
    alignItems: "center",
    bottom: 22,
    left: 18,
    position: "absolute",
    right: 18,
  },
});
