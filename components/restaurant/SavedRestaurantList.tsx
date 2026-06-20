import { X } from "lucide-react-native";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { floatingShadow, theme } from "../../constants/theme";
import { getGoogleMapsUrl, getPhoneUrl, getWebsiteUrl, openExternalUrl } from "../../services/restaurantLinks";
import { getCommunitySummaries, getCurrentUserSavedRestaurants } from "../../services/savedRestaurants";
import type {
  RestaurantCommunitySummary,
  RestaurantFilters,
  RestaurantPhoto,
  SavedRestaurantRecord,
  SavedRestaurantStatus,
} from "../../types/restaurant";
import { SavoryIcon, type SavoryIconGlyph } from "../ui/SavoryIcon";

type SavedRestaurantListProps = {
  contentWidth: number;
  filters?: RestaurantFilters;
  status: SavedRestaurantStatus;
};

type SelectedRestaurant = {
  record: SavedRestaurantRecord;
  summary?: RestaurantCommunitySummary;
};

const CloseIcon = X as SavoryIconGlyph;

export function SavedRestaurantList({ contentWidth, filters, status }: SavedRestaurantListProps) {
  const [records, setRecords] = useState<SavedRestaurantRecord[]>([]);
  const [summaries, setSummaries] = useState<Map<string, RestaurantCommunitySummary>>(new Map());
  const [selectedRestaurant, setSelectedRestaurant] = useState<SelectedRestaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isWishlist = status === "want_to_go";
  const visibleRecords = useMemo(
    () =>
      records.filter((record) =>
        matchesRestaurantFilters(record, summaries.get(record.google_place_id), isWishlist, filters),
      ),
    [filters, isWishlist, records, summaries],
  );

  const loadRestaurants = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: loadError } = await getCurrentUserSavedRestaurants(status);

    if (loadError) {
      setRecords([]);
      setLoading(false);
      setError(loadError.message);
      return;
    }

    setRecords(data);

    if (status === "want_to_go") {
      setSummaries(await getCommunitySummaries(data.map((record) => record.google_place_id)));
    }

    setLoading(false);
  }, [status]);

  useEffect(() => {
    void loadRestaurants();
  }, [loadRestaurants]);

  if (loading) {
    return (
      <View style={[styles.stateBlock, { width: contentWidth }]}>
        <ActivityIndicator color={theme.colors.coral} />
        <Text style={styles.stateText}>Cargando restaurantes</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.stateBlock, { width: contentWidth }]}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (records.length === 0) {
    return (
      <View style={[styles.stateBlock, { width: contentWidth }]}>
        <Text style={styles.stateText}>{isWishlist ? "Todavía no tienes deseados." : "Todavía no has guardado restaurantes visitados."}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.list, { width: contentWidth }]}>
      {visibleRecords.length === 0 ? (
        <View style={styles.stateBlock}>
          <Text style={styles.stateText}>No hay restaurantes con esos filtros.</Text>
        </View>
      ) : null}

      {visibleRecords.map((record) => {
        const summary = summaries.get(record.google_place_id);

        return (
          <RestaurantFoldedCard
            key={record.id}
            onPress={() => setSelectedRestaurant({ record, summary })}
            record={record}
            summary={summary}
            useCommunitySummary={isWishlist}
          />
        );
      })}

      <Modal
        animationType="fade"
        onRequestClose={() => setSelectedRestaurant(null)}
        transparent
        visible={Boolean(selectedRestaurant)}
      >
        {selectedRestaurant ? (
          <RestaurantDetailOverlay
            onClose={() => setSelectedRestaurant(null)}
            record={selectedRestaurant.record}
            summary={selectedRestaurant.summary}
            useCommunitySummary={isWishlist}
            width={contentWidth}
          />
        ) : null}
      </Modal>
    </View>
  );
}

type RestaurantFoldedCardProps = {
  record: SavedRestaurantRecord;
  summary?: RestaurantCommunitySummary;
  useCommunitySummary: boolean;
  onPress: () => void;
};

function RestaurantFoldedCard({ onPress, record, summary, useCommunitySummary }: RestaurantFoldedCardProps) {
  const rating = useCommunitySummary ? summary?.medianRating ?? null : record.food_rating;
  const priceRange = useCommunitySummary ? summary?.priceRangeMode ?? null : record.price_range;
  const cuisineTypes = useCommunitySummary ? summary?.cuisineTypes ?? [] : record.cuisine_types;
  const hasInfo = !useCommunitySummary || Boolean(rating || priceRange || cuisineTypes.length);

  return (
    <View style={styles.card}>
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.cardMainButton, pressed && styles.pressed]}>
        <Text numberOfLines={1} style={styles.cardTitle}>
          {record.name}
        </Text>
      </Pressable>
      {record.address ? (
        <Pressable
          accessibilityRole="link"
          onPress={() =>
            openExternalUrl(
              getGoogleMapsUrl({
                address: record.address,
                lat: record.location_lat,
                lng: record.location_lng,
                name: record.name,
                placeId: record.google_place_id,
              }),
            )
          }
        >
          <Text numberOfLines={1} style={styles.cardAddressLink}>
            {record.address}
          </Text>
        </Pressable>
      ) : null}
      <View style={styles.metaGrid}>
        <MetaPill label={formatSavedDate(record.saved_at)} />
        {hasInfo ? <MetaPill label={`Nota ${formatRating(rating)}`} /> : null}
        {hasInfo && priceRange ? <MetaPill label={priceRange} /> : null}
      </View>
      {hasInfo && cuisineTypes.length > 0 ? (
        <Text numberOfLines={2} style={styles.cuisineLine}>
          {cuisineTypes.join(", ")}
        </Text>
      ) : null}
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.expandButton, pressed && styles.pressed]}>
        <Text style={styles.expandButtonText}>Ver detalles</Text>
      </Pressable>
    </View>
  );
}

type RestaurantDetailOverlayProps = {
  record: SavedRestaurantRecord;
  summary?: RestaurantCommunitySummary;
  useCommunitySummary: boolean;
  width: number;
  onClose: () => void;
};

function RestaurantDetailOverlay({ onClose, record, summary, useCommunitySummary, width }: RestaurantDetailOverlayProps) {
  const rating = useCommunitySummary ? summary?.medianRating ?? null : record.food_rating;
  const priceRange = useCommunitySummary ? summary?.priceRangeMode ?? null : record.price_range;
  const cuisineTypes = useCommunitySummary ? summary?.cuisineTypes ?? [] : record.cuisine_types;
  const hasCommunityInfo = Boolean(summary && summary.reviewCount > 0);
  const googleMapsUrl = getGoogleMapsUrl({
    address: record.address,
    lat: record.location_lat,
    lng: record.location_lng,
    name: record.name,
    placeId: record.google_place_id,
  });

  return (
    <View style={styles.overlay}>
      <Pressable accessibilityLabel="Cerrar restaurante guardado" onPress={onClose} style={styles.backdrop} />
      <View style={[styles.detailSheet, { width }]}>
        <View style={styles.detailHeader}>
          <View style={styles.detailTitleBlock}>
            <Text numberOfLines={2} style={styles.detailTitle}>
              {record.name}
            </Text>
            {record.address ? (
              <Pressable accessibilityRole="link" onPress={() => openExternalUrl(googleMapsUrl)}>
                <Text numberOfLines={2} style={styles.detailAddressLink}>
                  {record.address}
                </Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable accessibilityRole="button" hitSlop={10} onPress={onClose} style={styles.closeButton}>
            <SavoryIcon color={theme.colors.text} glyph={CloseIcon} size={20} strokeWidth={2.3} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} style={styles.detailScroll}>
          <View style={styles.heroSummary}>
            <MetricTile label="Puntuación" value={useCommunitySummary && !hasCommunityInfo ? "Sin datos" : formatRating(rating)} />
            <MetricTile label="Precio" value={priceRange ?? "Sin datos"} />
            <MetricTile label="Guardado" value={formatSavedDate(record.saved_at)} />
          </View>

          <DetailSection title="Información">
            {record.address ? (
              <LinkLine label="Dirección" value={record.address} onPress={() => openExternalUrl(googleMapsUrl)} />
            ) : null}
            {record.phone ? (
              <LinkLine label="Teléfono" value={record.phone} onPress={() => openExternalUrl(getPhoneUrl(record.phone ?? ""))} />
            ) : null}
            {record.website ? (
              <LinkLine label="Web" value={record.website} onPress={() => openExternalUrl(getWebsiteUrl(record.website ?? ""))} />
            ) : null}
          </DetailSection>

          <DetailSection title={useCommunitySummary ? "Información de la comunidad" : "Comida"}>
            {useCommunitySummary && !hasCommunityInfo ? (
              <Text style={styles.emptyText}>Sin información</Text>
            ) : (
              <>
                <DetailLine label="Puntuación" value={formatRating(rating)} />
                <DetailLine label="Tipo de comida" value={cuisineTypes.join(", ") || "Sin información"} />
                {!useCommunitySummary ? <PhotoStrip photos={record.dish_photos} /> : null}
              </>
            )}
          </DetailSection>

          {!useCommunitySummary ? (
            <>
              <DetailSection title="Local">
                <DetailLine label="Ocasión" value={record.occasion_types.join(", ") || "Sin información"} />
                <DetailLine label="Precio por persona" value={priceRange ?? "Sin información"} />
                <PhotoStrip photos={record.local_photos} />
              </DetailSection>

              <DetailSection title="Servicio">
                <DetailLine label="Servicio" value={record.service_comment ?? "Sin información"} />
                <DetailLine label="Comentario general" value={record.general_comment ?? "Sin información"} />
              </DetailSection>

              <DetailSection title="Visibilidad">
                <DetailLine label="Estado" value={record.visibility === "public" ? "Público" : "Privado"} />
              </DetailSection>
            </>
          ) : (
            <DetailSection title="Local">
              {hasCommunityInfo ? (
                <>
                  <DetailLine label="Ocasión" value={summary?.occasionTypes.join(", ") || "Sin información"} />
                  <DetailLine label="Precio más repetido" value={priceRange ?? "Sin información"} />
                </>
              ) : (
                <Text style={styles.emptyText}>Sin información</Text>
              )}
            </DetailSection>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

type DetailSectionProps = {
  children: ReactNode;
  title: string;
};

function DetailSection({ children, title }: DetailSectionProps) {
  return (
    <View style={styles.detailSection}>
      <Text style={styles.detailSectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

type DetailLineProps = {
  label: string;
  value: string;
};

function DetailLine({ label, value }: DetailLineProps) {
  return (
    <View style={styles.detailLine}>
      <Text style={styles.detailLineLabel}>{label}</Text>
      <Text style={styles.detailLineValue}>{value}</Text>
    </View>
  );
}

type LinkLineProps = DetailLineProps & {
  onPress: () => void;
};

function LinkLine({ label, onPress, value }: LinkLineProps) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={({ pressed }) => [styles.linkLine, pressed && styles.pressed]}>
      <Text style={styles.detailLineLabel}>{label}</Text>
      <Text style={styles.linkLineValue}>{value}</Text>
    </Pressable>
  );
}

type MetricTileProps = {
  label: string;
  value: string;
};

function MetricTile({ label, value }: MetricTileProps) {
  return (
    <View style={styles.metricTile}>
      <Text numberOfLines={1} style={styles.metricValue}>
        {value}
      </Text>
      <Text numberOfLines={1} style={styles.metricLabel}>
        {label}
      </Text>
    </View>
  );
}

type MetaPillProps = {
  label: string;
};

function MetaPill({ label }: MetaPillProps) {
  return (
    <View style={styles.metaPill}>
      <Text numberOfLines={1} style={styles.metaPillText}>
        {label}
      </Text>
    </View>
  );
}

type PhotoStripProps = {
  photos: RestaurantPhoto[];
};

function PhotoStrip({ photos }: PhotoStripProps) {
  if (photos.length === 0) {
    return <Text style={styles.emptyText}>Sin fotos</Text>;
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
      <View style={styles.photoStrip}>
        {photos.map((photo, index) => (
          <View key={`${photo.fileName}-${index}`} style={styles.photoItem}>
            {photo.dataUrl ? <Image source={{ uri: photo.dataUrl }} style={styles.photoImage} /> : null}
            <Text numberOfLines={2} style={styles.photoCaption}>
              {photo.caption || photo.fileName || "Foto"}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function formatSavedDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Fecha no disponible";
  }

  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatRating(value: number | null) {
  if (!value) {
    return "0/10";
  }

  return `${value.toLocaleString("es-ES", { maximumFractionDigits: 1 })}/10`;
}

function matchesRestaurantFilters(
  record: SavedRestaurantRecord,
  summary: RestaurantCommunitySummary | undefined,
  useCommunitySummary: boolean,
  filters?: RestaurantFilters,
) {
  if (!filters) {
    return true;
  }

  const cuisineTypes = useCommunitySummary ? summary?.cuisineTypes ?? [] : record.cuisine_types;
  const occasionTypes = useCommunitySummary ? summary?.occasionTypes ?? [] : record.occasion_types;
  const priceRange = useCommunitySummary ? summary?.priceRangeMode ?? null : record.price_range;

  return (
    overlapsFilter(cuisineTypes, filters.cuisineTypes) &&
    overlapsFilter(occasionTypes, filters.occasionTypes) &&
    (filters.priceRanges.length === 0 || (priceRange ? filters.priceRanges.includes(priceRange) : false))
  );
}

function overlapsFilter(values: string[], selectedValues: string[]) {
  if (selectedValues.length === 0) {
    return true;
  }

  return values.some((value) => selectedValues.includes(value));
}

const styles = StyleSheet.create({
  list: {
    gap: 12,
  },
  stateBlock: {
    backgroundColor: theme.colors.surfaceGlass,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  stateText: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 19,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 19,
  },
  card: {
    ...floatingShadow,
    backgroundColor: theme.colors.surfaceGlass,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderTopColor: theme.colors.coral,
    borderTopWidth: 2,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  cardMainButton: {
    borderRadius: theme.radius.md,
  },
  expandButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: theme.colors.text,
    borderRadius: theme.radius.pill,
    height: 34,
    justifyContent: "center",
    marginTop: 2,
    paddingHorizontal: 13,
  },
  expandButtonText: {
    color: theme.colors.white,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 16,
  },
  pressed: {
    opacity: 0.74,
    transform: [{ scale: 0.99 }],
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 22,
  },
  cardAddressLink: {
    color: theme.colors.coral,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
    textDecorationLine: "underline",
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  metaPill: {
    backgroundColor: theme.colors.coralSoft,
    borderColor: "#FFDAD5",
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    maxWidth: "100%",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  metaPillText: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 14,
  },
  cuisineLine: {
    color: theme.colors.textSoft,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
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
    backgroundColor: "rgba(17, 18, 20, 0.25)",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  detailSheet: {
    ...floatingShadow,
    backgroundColor: theme.colors.surfaceGlass,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    gap: 14,
    maxHeight: "82%",
    padding: 18,
  },
  detailHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
  },
  detailTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  detailTitle: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 27,
  },
  detailAddressLink: {
    color: theme.colors.coral,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
    marginTop: 4,
    textDecorationLine: "underline",
  },
  closeButton: {
    alignItems: "center",
    borderRadius: theme.radius.pill,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  detailScroll: {
    maxHeight: 560,
  },
  heroSummary: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: 12,
  },
  metricTile: {
    backgroundColor: theme.colors.coralSoft,
    borderColor: "#FFDAD5",
    borderRadius: theme.radius.md,
    borderWidth: 1,
    flex: 1,
    gap: 3,
    minHeight: 64,
    justifyContent: "center",
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  metricValue: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 18,
    textAlign: "center",
  },
  metricLabel: {
    color: theme.colors.muted,
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 13,
    textAlign: "center",
    textTransform: "uppercase",
  },
  detailSection: {
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    gap: 9,
    marginBottom: 10,
    padding: 13,
  },
  detailSectionTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 21,
  },
  detailLine: {
    gap: 3,
  },
  linkLine: {
    backgroundColor: theme.colors.surfaceSoft,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    gap: 3,
    padding: 10,
  },
  detailLineLabel: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 14,
    textTransform: "uppercase",
  },
  detailLineValue: {
    color: theme.colors.textSoft,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  linkLineValue: {
    color: theme.colors.coral,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
    textDecorationLine: "underline",
  },
  emptyText: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  photoScroll: {
    marginTop: 2,
  },
  photoStrip: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 2,
  },
  photoItem: {
    backgroundColor: theme.colors.surfaceSoft,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    gap: 7,
    padding: 8,
    width: 142,
  },
  photoImage: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.md,
    height: 112,
    width: "100%",
  },
  photoCaption: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
  },
});
