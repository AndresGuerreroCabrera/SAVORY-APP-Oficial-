import { ChevronDown } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { theme } from "../../constants/theme";
import { SavoryIcon, type SavoryIconGlyph } from "../ui/SavoryIcon";

const ChevronIcon = ChevronDown as SavoryIconGlyph;

type FiltersDropdownProps = {
  width: number;
};

export function FiltersDropdown({ width }: FiltersDropdownProps) {
  const [open, setOpen] = useState(false);

  return (
    <View style={[styles.container, { width }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
      >
        <Text style={styles.triggerText}>Filtros</Text>
        <SavoryIcon color={theme.colors.coral} glyph={ChevronIcon} size={19} strokeWidth={2.2} />
      </Pressable>

      {open ? <View accessibilityLabel="Filtros vacíos" style={styles.emptyOptions} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  trigger: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceGlass,
    borderColor: theme.colors.border,
    borderLeftColor: theme.colors.coral,
    borderLeftWidth: 3,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    flexDirection: "row",
    height: 56,
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  triggerText: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 21,
  },
  emptyOptions: {
    backgroundColor: theme.colors.surfaceGlass,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    minHeight: 64,
  },
  pressed: {
    opacity: 0.72,
  },
});
