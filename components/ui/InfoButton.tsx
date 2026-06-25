import { Info, X } from "lucide-react-native";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { GestureResponderEvent } from "react-native";

import { floatingShadow, theme } from "../../constants/theme";
import { SavoryIcon, type SavoryIconGlyph } from "./SavoryIcon";

type InfoButtonProps = {
  body: string;
  title: string;
};

const CloseIcon = X as SavoryIconGlyph;
const InfoIcon = Info as SavoryIconGlyph;

export function InfoButton({ body, title }: InfoButtonProps) {
  const [open, setOpen] = useState(false);

  const stopPropagation = (event: GestureResponderEvent) => {
    event.stopPropagation?.();
    (event.nativeEvent as { stopPropagation?: () => void }).stopPropagation?.();
  };

  return (
    <>
      <Pressable
        accessibilityLabel={`Información sobre ${title}`}
        accessibilityRole="button"
        hitSlop={8}
        onPress={(event) => {
          stopPropagation(event);
          setOpen(true);
        }}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <SavoryIcon color={theme.colors.coral} glyph={InfoIcon} size={15} strokeWidth={2.4} />
      </Pressable>
      <Modal animationType="fade" onRequestClose={() => setOpen(false)} transparent visible={open}>
        <View style={styles.overlay}>
          <Pressable
            accessibilityLabel="Cerrar información"
            onPress={() => setOpen(false)}
            style={styles.backdrop}
          />
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <Pressable accessibilityRole="button" hitSlop={10} onPress={() => setOpen(false)} style={styles.closeButton}>
                <SavoryIcon color={theme.colors.text} glyph={CloseIcon} size={18} strokeWidth={2.4} />
              </Pressable>
            </View>
            <Text style={styles.body}>{body}</Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    backgroundColor: theme.colors.coralSoft,
    borderColor: "#FFDAD5",
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 26,
    justifyContent: "center",
    width: 26,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.96 }],
  },
  overlay: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    padding: 18,
    position: "absolute",
    right: 0,
    top: 0,
  },
  backdrop: {
    backgroundColor: "rgba(17, 18, 20, 0.28)",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  sheet: {
    ...floatingShadow,
    backgroundColor: theme.colors.surfaceGlass,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    gap: 10,
    maxWidth: 420,
    padding: 16,
    width: "100%",
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  title: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 23,
  },
  closeButton: {
    alignItems: "center",
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  body: {
    color: theme.colors.textSoft,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },
});
