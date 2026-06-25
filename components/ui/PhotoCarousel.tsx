import { useMemo } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { theme } from "../../constants/theme";
import type { RestaurantPhoto } from "../../types/restaurant";

type PhotoCarouselProps = {
  compact?: boolean;
  maxPhotos?: number;
  photos: RestaurantPhoto[];
  onPreview: (photo: RestaurantPhoto) => void;
};

export function PhotoCarousel({ compact = false, maxPhotos = 12, photos, onPreview }: PhotoCarouselProps) {
  const visiblePhotos = useMemo(
    () => photos.filter((photo) => Boolean(photo.dataUrl)).slice(0, maxPhotos),
    [maxPhotos, photos],
  );

  if (visiblePhotos.length === 0) {
    return null;
  }

  return (
    <View style={styles.carousel}>
      <ScrollView
        horizontal
        contentContainerStyle={styles.track}
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
      >
        {visiblePhotos.map((photo, index) => (
          <Pressable
            accessibilityRole="imagebutton"
            key={`${photo.fileName ?? "photo"}-${index}`}
            onPress={() => onPreview(photo)}
            style={({ pressed }) => [styles.item, compact && styles.itemCompact, pressed && styles.pressed]}
          >
            <View style={[styles.imageFrame, compact && styles.imageFrameCompact]}>
              <Image source={{ uri: photo.dataUrl }} style={styles.image} />
            </View>
            {photo.caption?.trim() ? (
              <Text numberOfLines={2} style={styles.caption}>
                {photo.caption.trim()}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  carousel: {
    width: "100%",
  },
  scroll: {
    width: "100%",
  },
  track: {
    gap: 5,
    paddingRight: 2,
    paddingVertical: 2,
  },
  item: {
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    gap: 5,
    padding: 4,
    width: 152,
  },
  itemCompact: {
    width: 128,
  },
  imageFrame: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceSoft,
    borderRadius: theme.radius.sm,
    height: 138,
    justifyContent: "center",
    overflow: "hidden",
    width: "100%",
  },
  imageFrameCompact: {
    height: 114,
  },
  image: {
    height: "100%",
    resizeMode: "contain",
    width: "100%",
  },
  caption: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
    minHeight: 14,
  },
  pressed: {
    opacity: 0.9,
  },
});
