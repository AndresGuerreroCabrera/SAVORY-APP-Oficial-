import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { Pressable, StyleSheet, Text } from "react-native";

import { theme } from "../../constants/theme";
import { SavoryIcon, type SavoryIconGlyph } from "../ui/SavoryIcon";

const ArrowLeftIcon = ArrowLeft as SavoryIconGlyph;

type ListBackButtonProps = {
  width: number;
};

export function ListBackButton({ width }: ListBackButtonProps) {
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.back()}
      style={({ pressed }) => [styles.button, { width }, pressed && styles.pressed]}
    >
      <SavoryIcon color={theme.colors.coral} glyph={ArrowLeftIcon} size={18} strokeWidth={2.2} />
      <Text style={styles.text}>Volver</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: theme.colors.coralSoft,
    borderColor: "#FFDAD5",
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    height: 48,
    justifyContent: "center",
  },
  text: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.99 }],
  },
});
