import { X } from "lucide-react-native";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { floatingShadow, theme } from "../../constants/theme";
import { SavoryIcon, type SavoryIconGlyph } from "./SavoryIcon";

type ImageLightboxProps = {
  caption?: string | null;
  imageUri: string | null;
  title?: string;
  visible: boolean;
  onClose: () => void;
};

const CloseIcon = X as SavoryIconGlyph;

export function ImageLightbox({ caption, imageUri, onClose, title, visible }: ImageLightboxProps) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible && Boolean(imageUri)}>
      <View style={styles.overlay}>
        <Pressable accessibilityLabel="Cerrar foto" onPress={onClose} style={styles.backdrop} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text numberOfLines={1} style={styles.title}>
              {title ?? "Foto"}
            </Text>
            <Pressable accessibilityRole="button" hitSlop={10} onPress={onClose} style={styles.closeButton}>
              <SavoryIcon color={theme.colors.text} glyph={CloseIcon} size={20} strokeWidth={2.4} />
            </Pressable>
          </View>

          {imageUri ? <Image resizeMode="contain" source={{ uri: imageUri }} style={styles.image} /> : null}

          {caption ? (
            <ScrollView style={styles.captionScroll}>
              <Text style={styles.caption}>{caption}</Text>
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    paddingHorizontal: 18,
    position: "absolute",
    right: 0,
    top: 0,
  },
  backdrop: {
    backgroundColor: "rgba(17, 18, 20, 0.5)",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  sheet: {
    ...floatingShadow,
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    maxHeight: "88%",
    maxWidth: 760,
    overflow: "hidden",
    padding: 14,
    width: "100%",
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    marginBottom: 10,
  },
  title: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 21,
  },
  closeButton: {
    alignItems: "center",
    borderRadius: theme.radius.pill,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  image: {
    alignSelf: "center",
    backgroundColor: theme.colors.surfaceSoft,
    borderRadius: theme.radius.lg,
    height: 420,
    maxHeight: "72%",
    width: "100%",
  },
  captionScroll: {
    maxHeight: 120,
  },
  caption: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    marginTop: 12,
  },
});
