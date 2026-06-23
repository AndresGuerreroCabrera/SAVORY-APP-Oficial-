import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { useRouter } from "expo-router";
import { MapPin, MessageCircle, Search, X } from "lucide-react-native";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import type { TextStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { floatingShadow, theme } from "../../constants/theme";
import { trackAppEvent } from "../../services/appAnalytics";
import { getGoogleMapsUrl, getPhoneUrl, getWebsiteUrl, openExternalUrl } from "../../services/restaurantLinks";
import {
  getRestaurantRecommendations,
  saveRecommendationToWishlist,
  type RecommendationLocationFilter,
} from "../../services/recommendations";
import { recordRestaurantScoreEvent } from "../../services/savoryScore";
import type {
  RestaurantCommunityVisitor,
  RestaurantFilters,
  RestaurantPhoto,
  RestaurantRecommendation,
  RestaurantRecommendationComment,
} from "../../types/restaurant";
import { BottomNav } from "../navigation/BottomNav";
import { ImageLightbox } from "../ui/ImageLightbox";
import { SavoryIcon, type SavoryIconGlyph } from "../ui/SavoryIcon";
import { emptyRestaurantFilters, FiltersDropdown } from "../list/FiltersDropdown";

const CloseIcon = X as SavoryIconGlyph;
const CommentIcon = MessageCircle as SavoryIconGlyph;
const MapPinIcon = MapPin as SavoryIconGlyph;
const SearchIcon = Search as SavoryIconGlyph;
const SWIPE_THRESHOLD = 115;

const webInputReset: TextStyle & {
  boxShadow?: string;
  caretColor?: string;
  cursor?: string;
  outline?: string;
  outlineColor?: string;
  outlineWidth?: number;
} = {
  boxShadow: "none",
  caretColor: theme.colors.text,
  cursor: "text",
  outline: "none",
  outlineColor: "transparent",
  outlineWidth: 0,
};
const inputPlatformStyle = Platform.OS === "web" ? webInputReset : null;

type LocationPrediction = {
  description: string;
  placeId: string;
};

export function RecommendationsScreen() {
  const router = useRouter();
  const { height: viewportHeight, width: viewportWidth } = useWindowDimensions();
  const overlayWidth = Math.max(280, viewportWidth - 36);
  const contentWidth = Math.min(overlayWidth, 520);
  const navWidth = Math.min(overlayWidth, 430);
  const cardMaxHeight = Math.max(420, viewportHeight - 300);
  const [filters, setFilters] = useState<RestaurantFilters>(emptyRestaurantFilters);
  const [locationFilter, setLocationFilter] = useState<RecommendationLocationFilter>(null);
  const [recommendations, setRecommendations] = useState<RestaurantRecommendation[]>([]);
  const [dismissedPlaceIds, setDismissedPlaceIds] = useState<Set<string>>(new Set());
  const [savedPlaceIds, setSavedPlaceIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedRecommendation, setSelectedRecommendation] = useState<RestaurantRecommendation | null>(null);
  const [visibleVisitors, setVisibleVisitors] = useState<RestaurantCommunityVisitor[] | null>(null);
  const [visibleComments, setVisibleComments] = useState<RestaurantRecommendationComment[] | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<RestaurantPhoto | null>(null);

  const visibleRecommendations = useMemo(
    () =>
      recommendations.filter(
        (recommendation) =>
          !dismissedPlaceIds.has(recommendation.googlePlaceId) && !savedPlaceIds.has(recommendation.googlePlaceId),
      ),
    [dismissedPlaceIds, recommendations, savedPlaceIds],
  );
  const activeRecommendation = visibleRecommendations[0] ?? null;

  const loadRecommendations = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMessage(null);

    const { data, error: loadError } = await getRestaurantRecommendations({ filters, locationFilter });

    if (loadError) {
      setRecommendations([]);
      setError(loadError.message);
    } else {
      setRecommendations(data);
    }

    setLoading(false);
  }, [filters, locationFilter]);

  useEffect(() => {
    void loadRecommendations();
  }, [loadRecommendations]);

  useEffect(() => {
    if (!activeRecommendation) {
      return;
    }

    void trackAppEvent({
      entityId: activeRecommendation.googlePlaceId,
      entityType: "restaurant",
      eventName: "recommendation_impression",
      metadata: {
        owner_count: activeRecommendation.ownerUserIds.length,
        recommendation_score: activeRecommendation.score,
        review_count: activeRecommendation.reviewCount,
      },
      route: "/recommendations",
    });
    void recordRestaurantScoreEvent({
      eventName: "recommendation_impression",
      googlePlaceId: activeRecommendation.googlePlaceId,
      metadata: {
        source: "recommendations",
      },
      ownerUserIds: activeRecommendation.ownerUserIds,
      source: "recommendations",
    });
  }, [activeRecommendation]);

  const handleSwipe = useCallback(
    async (direction: "left" | "right", recommendation: RestaurantRecommendation) => {
      setMessage(null);

      void trackAppEvent({
        entityId: recommendation.googlePlaceId,
        entityType: "restaurant",
        eventName: direction === "right" ? "recommendation_swiped_right" : "recommendation_swiped_left",
        metadata: {
          score: recommendation.score,
          source: "recommendations",
        },
      });

      if (direction === "left") {
        setDismissedPlaceIds((current) => new Set(current).add(recommendation.googlePlaceId));
        return;
      }

      void recordRestaurantScoreEvent({
        eventName: "swipe_right",
        googlePlaceId: recommendation.googlePlaceId,
        metadata: {
          source: "recommendations",
        },
        ownerUserIds: recommendation.ownerUserIds,
        source: "recommendations",
      });

      setSaving(true);
      const { alreadyExists, error: saveError } = await saveRecommendationToWishlist(recommendation);
      setSaving(false);

      if (saveError) {
        setError(saveError.message);
        return;
      }

      setSavedPlaceIds((current) => new Set(current).add(recommendation.googlePlaceId));
      void trackAppEvent({
        entityId: recommendation.googlePlaceId,
        entityType: "restaurant",
        eventName: "recommendation_saved",
        metadata: {
          already_exists: alreadyExists,
          owner_count: recommendation.ownerUserIds.length,
          source: "recommendations",
        },
        route: "/recommendations",
      });
      setMessage(alreadyExists ? "Ya estaba en Deseados." : "Añadido a Deseados.");
    },
    [],
  );

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.filtersBlock, { width: contentWidth }]}>
            <FiltersDropdown
              filters={filters}
              headerContent={<Text numberOfLines={1} style={styles.title}>Recomendaciones</Text>}
              onChange={setFilters}
              width={contentWidth}
            >
              <LocationSearchInput
                locationFilter={locationFilter}
                onChange={setLocationFilter}
              />
            </FiltersDropdown>
          </View>

          {loading ? (
            <StateBlock width={contentWidth}>
              <ActivityIndicator color={theme.colors.coral} />
              <Text style={styles.stateText}>Buscando recomendaciones</Text>
            </StateBlock>
          ) : error ? (
            <StateBlock width={contentWidth}>
              <Text style={styles.errorText}>{error}</Text>
            </StateBlock>
          ) : activeRecommendation ? (
            <View style={[styles.deck, { width: contentWidth }]}>
              <View pointerEvents="none" style={styles.deckUnderlay} />
              <SwipeableRecommendationCard
                key={activeRecommendation.googlePlaceId}
                maxHeight={cardMaxHeight}
                recommendation={activeRecommendation}
                saving={saving}
                onOpenComments={setVisibleComments}
                onOpenDetail={setSelectedRecommendation}
                onOpenVisitors={setVisibleVisitors}
                onPreviewPhoto={setPreviewPhoto}
                onSwipe={handleSwipe}
              />
            </View>
          ) : (
            <StateBlock width={contentWidth}>
              <Text style={styles.stateText}>No hay más recomendaciones con estos filtros.</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setDismissedPlaceIds(new Set());
                  setSavedPlaceIds(new Set());
                  void loadRecommendations();
                }}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Reiniciar pila</Text>
              </Pressable>
            </StateBlock>
          )}

          {message ? (
            <View style={[styles.messageBlock, { width: contentWidth }]}>
              <Text style={styles.successText}>{message}</Text>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>

      <View pointerEvents="box-none" style={styles.bottomNav}>
        <BottomNav width={navWidth} />
      </View>

      <Modal animationType="fade" onRequestClose={() => setSelectedRecommendation(null)} transparent visible={Boolean(selectedRecommendation)}>
        {selectedRecommendation ? (
          <RecommendationDetailOverlay
            onClose={() => setSelectedRecommendation(null)}
            onOpenComments={setVisibleComments}
            onOpenVisitors={setVisibleVisitors}
            onPreviewPhoto={setPreviewPhoto}
            recommendation={selectedRecommendation}
            width={contentWidth}
          />
        ) : null}
      </Modal>

      <Modal animationType="fade" onRequestClose={() => setVisibleVisitors(null)} transparent visible={Boolean(visibleVisitors)}>
        {visibleVisitors ? (
          <VisitorsOverlay
            onClose={() => setVisibleVisitors(null)}
            onSelectVisitor={(visitor) => {
              setVisibleVisitors(null);
              setSelectedRecommendation(null);
              router.push(`/users/${visitor.userId}` as never);
            }}
            visitors={visibleVisitors}
            width={contentWidth}
          />
        ) : null}
      </Modal>

      <Modal animationType="fade" onRequestClose={() => setVisibleComments(null)} transparent visible={Boolean(visibleComments)}>
        {visibleComments ? (
          <CommentsOverlay comments={visibleComments} onClose={() => setVisibleComments(null)} width={contentWidth} />
        ) : null}
      </Modal>

      <ImageLightbox
        caption={previewPhoto?.caption?.trim() || null}
        imageUri={previewPhoto?.dataUrl ?? null}
        onClose={() => setPreviewPhoto(null)}
        title={previewPhoto?.caption?.trim() || "Foto"}
        visible={Boolean(previewPhoto?.dataUrl)}
      />
    </View>
  );
}

type StateBlockProps = {
  children: ReactNode;
  width: number;
};

function StateBlock({ children, width }: StateBlockProps) {
  return <View style={[styles.stateBlock, { width }]}>{children}</View>;
}

type SwipeableRecommendationCardProps = {
  maxHeight: number;
  recommendation: RestaurantRecommendation;
  saving: boolean;
  onOpenComments: (comments: RestaurantRecommendationComment[]) => void;
  onOpenDetail: (recommendation: RestaurantRecommendation) => void;
  onOpenVisitors: (visitors: RestaurantCommunityVisitor[]) => void;
  onPreviewPhoto: (photo: RestaurantPhoto) => void;
  onSwipe: (direction: "left" | "right", recommendation: RestaurantRecommendation) => void;
};

function SwipeableRecommendationCard({
  maxHeight,
  onOpenComments,
  onOpenDetail,
  onOpenVisitors,
  onPreviewPhoto,
  onSwipe,
  recommendation,
  saving,
}: SwipeableRecommendationCardProps) {
  const position = useRef(new Animated.ValueXY()).current;
  const rotate = position.x.interpolate({
    inputRange: [-220, 0, 220],
    outputRange: ["-7deg", "0deg", "7deg"],
  });
  const leftTintOpacity = position.x.interpolate({
    extrapolate: "clamp",
    inputRange: [-240, -60, 0],
    outputRange: [0.42, 0.12, 0],
  });
  const rightTintOpacity = position.x.interpolate({
    extrapolate: "clamp",
    inputRange: [0, 60, 240],
    outputRange: [0, 0.12, 0.42],
  });
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderMove: (_event, gesture) => {
        position.setValue({ x: gesture.dx, y: 0 });
      },
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD) {
          Animated.timing(position, {
            duration: 180,
            toValue: { x: 620, y: 0 },
            useNativeDriver: false,
          }).start(() => onSwipe("right", recommendation));
          return;
        }

        if (gesture.dx < -SWIPE_THRESHOLD) {
          Animated.timing(position, {
            duration: 180,
            toValue: { x: -620, y: 0 },
            useNativeDriver: false,
          }).start(() => onSwipe("left", recommendation));
          return;
        }

        Animated.spring(position, {
          friction: 7,
          tension: 70,
          toValue: { x: 0, y: 0 },
          useNativeDriver: false,
        }).start();
      },
    }),
  ).current;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.swipeCard,
        {
          transform: [{ translateX: position.x }, { rotate }],
        },
      ]}
    >
      <Animated.View pointerEvents="none" style={[styles.swipeGlow, styles.swipeGlowLeft, { opacity: leftTintOpacity }]} />
      <Animated.View pointerEvents="none" style={[styles.swipeGlow, styles.swipeGlowRight, { opacity: rightTintOpacity }]} />
      <RecommendationCard
        maxHeight={maxHeight}
        recommendation={recommendation}
        saving={saving}
        onOpenComments={onOpenComments}
        onOpenDetail={onOpenDetail}
        onOpenVisitors={onOpenVisitors}
        onPreviewPhoto={onPreviewPhoto}
      />
    </Animated.View>
  );
}

type RecommendationCardProps = {
  maxHeight: number;
  recommendation: RestaurantRecommendation;
  saving?: boolean;
  onOpenComments: (comments: RestaurantRecommendationComment[]) => void;
  onOpenDetail: (recommendation: RestaurantRecommendation) => void;
  onOpenVisitors: (visitors: RestaurantCommunityVisitor[]) => void;
  onPreviewPhoto: (photo: RestaurantPhoto) => void;
};

function RecommendationCard({
  maxHeight,
  onOpenComments,
  onOpenDetail,
  onOpenVisitors,
  onPreviewPhoto,
  recommendation,
  saving,
}: RecommendationCardProps) {
  const mapsUrl = getGoogleMapsUrl({
    address: recommendation.address,
    lat: recommendation.locationLat,
    lng: recommendation.locationLng,
    name: recommendation.name,
    placeId: recommendation.googlePlaceId,
  });

  return (
    <View style={[styles.card, { maxHeight }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void trackAppEvent({
              entityId: recommendation.googlePlaceId,
              entityType: "restaurant",
              eventName: "recommendation_clicked",
              metadata: {
                owner_count: recommendation.ownerUserIds.length,
                source: "recommendations",
              },
              route: "/recommendations",
            });
            onOpenDetail(recommendation);
          }}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Text numberOfLines={2} style={styles.cardTitle}>
            {recommendation.name}
          </Text>
        </Pressable>
        {recommendation.address ? (
          <Pressable accessibilityRole="link" onPress={() => openExternalUrl(mapsUrl)}>
            <Text numberOfLines={2} style={styles.addressLink}>{recommendation.address}</Text>
          </Pressable>
        ) : null}

        <View style={styles.linkRow}>
          {recommendation.phone ? (
            <Pressable accessibilityRole="link" onPress={() => openExternalUrl(getPhoneUrl(recommendation.phone ?? ""))} style={styles.inlineLinkPill}>
              <Text numberOfLines={1} style={styles.inlineLinkText}>{recommendation.phone}</Text>
            </Pressable>
          ) : null}
          {recommendation.website ? (
            <Pressable accessibilityRole="link" onPress={() => openExternalUrl(getWebsiteUrl(recommendation.website ?? ""))} style={styles.inlineLinkPill}>
              <Text numberOfLines={1} style={styles.inlineLinkText}>Web</Text>
            </Pressable>
          ) : null}
          <CommunityVisitorsButton visitors={recommendation.visitors} onPress={() => onOpenVisitors(recommendation.visitors)} />
        </View>

        <View style={styles.metricGrid}>
          <MetricTile label="Puntuación" value={formatRating(recommendation.medianRating)} />
          <MetricTile label="Precio" value={recommendation.priceRangeMode ?? "Sin datos"} />
        </View>

        <TagSection title="Comida" tags={recommendation.cuisineTags} />
        <TagSection title="Ocasión" tags={recommendation.occasionTags} />

        <PhotoStrip
          dishPhotos={recommendation.dishPhotos}
          localPhotos={recommendation.localPhotos}
          onPreview={onPreviewPhoto}
        />

        {recommendation.lastGeneralComment ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => onOpenComments(recommendation.generalComments)}
            style={({ pressed }) => [styles.commentPreview, pressed && styles.pressed]}
          >
            <SavoryIcon color={theme.colors.coral} glyph={CommentIcon} size={17} strokeWidth={2.2} />
            <Text numberOfLines={3} style={styles.commentText}>{recommendation.lastGeneralComment.comment}</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {saving ? (
        <View style={styles.savingHint}>
          <ActivityIndicator color={theme.colors.coral} />
          <Text style={styles.savingHintText}>Guardando en Deseados</Text>
        </View>
      ) : null}
    </View>
  );
}

type RecommendationDetailOverlayProps = {
  recommendation: RestaurantRecommendation;
  width: number;
  onClose: () => void;
  onOpenComments: (comments: RestaurantRecommendationComment[]) => void;
  onOpenVisitors: (visitors: RestaurantCommunityVisitor[]) => void;
  onPreviewPhoto: (photo: RestaurantPhoto) => void;
};

function RecommendationDetailOverlay({
  onClose,
  onOpenComments,
  onOpenVisitors,
  onPreviewPhoto,
  recommendation,
  width,
}: RecommendationDetailOverlayProps) {
  return (
    <View style={styles.overlay}>
      <Pressable accessibilityLabel="Cerrar recomendación" onPress={onClose} style={styles.backdrop} />
      <View style={[styles.detailSheet, { width }]}>
        <View style={styles.detailHeader}>
          <Text numberOfLines={2} style={styles.detailTitle}>{recommendation.name}</Text>
          <Pressable accessibilityRole="button" hitSlop={10} onPress={onClose} style={styles.closeButton}>
            <SavoryIcon color={theme.colors.text} glyph={CloseIcon} size={20} strokeWidth={2.3} />
          </Pressable>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} style={styles.detailScroll}>
          <RecommendationCard
            maxHeight={900}
            recommendation={recommendation}
            onOpenComments={onOpenComments}
            onOpenDetail={() => undefined}
            onOpenVisitors={onOpenVisitors}
            onPreviewPhoto={onPreviewPhoto}
          />
        </ScrollView>
      </View>
    </View>
  );
}

type CommunityVisitorsButtonProps = {
  visitors: RestaurantCommunityVisitor[];
  onPress: () => void;
};

function CommunityVisitorsButton({ onPress, visitors }: CommunityVisitorsButtonProps) {
  const latestVisitor = visitors[0];

  if (!latestVisitor) {
    return null;
  }

  const remainingCount = Math.max(0, visitors.length - 1);

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.visitorsButton, pressed && styles.pressed]}>
      <Text numberOfLines={1} style={styles.visitorsButtonText}>{latestVisitor.username}</Text>
      {remainingCount > 0 ? <Text style={styles.visitorsButtonMore}>+{remainingCount}</Text> : null}
    </Pressable>
  );
}

function VisitorsOverlay({
  onClose,
  onSelectVisitor,
  visitors,
  width,
}: {
  visitors: RestaurantCommunityVisitor[];
  width: number;
  onClose: () => void;
  onSelectVisitor: (visitor: RestaurantCommunityVisitor) => void;
}) {
  return (
    <View style={styles.overlay}>
      <Pressable accessibilityLabel="Cerrar usuarios" onPress={onClose} style={styles.backdrop} />
      <View style={[styles.smallSheet, { width }]}>
        <SheetHeader onClose={onClose} title="Usuarios que han ido" />
        <ScrollView showsVerticalScrollIndicator={false} style={styles.smallSheetScroll}>
          {visitors.map((visitor) => (
            <Pressable
              accessibilityRole="button"
              key={visitor.userId}
              onPress={() => onSelectVisitor(visitor)}
              style={({ pressed }) => [styles.visitorRow, pressed && styles.pressed]}
            >
              {visitor.avatarUrl ? (
                <Image source={{ uri: visitor.avatarUrl }} style={styles.visitorAvatar} />
              ) : (
                <View style={styles.visitorAvatarFallback}>
                  <Text style={styles.visitorInitial}>{visitor.username.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.visitorText}>
                <Text numberOfLines={1} style={styles.visitorName}>{visitor.username}</Text>
                <Text style={styles.visitorMeta}>Última visita: {formatDate(visitor.lastVisitedAt)}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

function CommentsOverlay({
  comments,
  onClose,
  width,
}: {
  comments: RestaurantRecommendationComment[];
  width: number;
  onClose: () => void;
}) {
  return (
    <View style={styles.overlay}>
      <Pressable accessibilityLabel="Cerrar comentarios" onPress={onClose} style={styles.backdrop} />
      <View style={[styles.smallSheet, { width }]}>
        <SheetHeader onClose={onClose} title="Comentarios" />
        <ScrollView showsVerticalScrollIndicator={false} style={styles.smallSheetScroll}>
          {comments.map((comment, index) => (
            <View key={`${comment.user.userId}-${comment.savedAt}-${index}`} style={styles.commentRow}>
              <Text style={styles.commentAuthor}>{comment.user.username}</Text>
              <Text style={styles.commentDate}>{formatDate(comment.savedAt)}</Text>
              <Text style={styles.commentFullText}>{comment.comment}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

function SheetHeader({ onClose, title }: { title: string; onClose: () => void }) {
  return (
    <View style={styles.sheetHeader}>
      <Text style={styles.sheetTitle}>{title}</Text>
      <Pressable accessibilityRole="button" hitSlop={10} onPress={onClose} style={styles.closeButton}>
        <SavoryIcon color={theme.colors.text} glyph={CloseIcon} size={20} strokeWidth={2.3} />
      </Pressable>
    </View>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricTile}>
      <Text numberOfLines={1} style={styles.metricValue}>{value}</Text>
      <Text numberOfLines={1} style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function TagSection({ tags, title }: { tags: string[]; title: string }) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <View style={styles.tagSection}>
      <Text style={styles.tagTitle}>{title}</Text>
      <View style={styles.tagRow}>
        {tags.map((tag) => (
          <View key={tag} style={styles.tagPill}>
            <Text numberOfLines={1} style={styles.tagText}>{tag}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function PhotoStrip({
  dishPhotos,
  localPhotos,
  onPreview,
}: {
  dishPhotos: RestaurantPhoto[];
  localPhotos: RestaurantPhoto[];
  onPreview: (photo: RestaurantPhoto) => void;
}) {
  const photos = [...dishPhotos, ...localPhotos].slice(0, 8);

  if (photos.length === 0) {
    return null;
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
      <View style={styles.photoStrip}>
        {photos.map((photo, index) => (
          <Pressable
            accessibilityRole="imagebutton"
            key={`${photo.fileName}-${index}`}
            onPress={() => onPreview(photo)}
            style={({ pressed }) => [styles.photoItem, pressed && styles.pressed]}
          >
            {photo.dataUrl ? <Image source={{ uri: photo.dataUrl }} style={styles.photoImage} /> : null}
            {photo.caption?.trim() ? <Text numberOfLines={1} style={styles.photoCaption}>{photo.caption.trim()}</Text> : null}
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function LocationSearchInput({
  locationFilter,
  onChange,
}: {
  locationFilter: RecommendationLocationFilter;
  onChange: (location: RecommendationLocationFilter) => void;
}) {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  const autocompleteRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const detailsServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  const detailsElementRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState(locationFilter?.label ?? "");
  const [predictions, setPredictions] = useState<LocationPrediction[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPlaces() {
      if (!apiKey) {
        return;
      }

      try {
        setOptions({ key: apiKey, libraries: ["places"], v: "weekly" });
        const placesLibrary = (await importLibrary("places")) as google.maps.PlacesLibrary;

        if (cancelled) {
          return;
        }

        autocompleteRef.current = new placesLibrary.AutocompleteService();
        detailsServiceRef.current = new placesLibrary.PlacesService(detailsElementRef.current ?? document.createElement("div"));
      } catch {
        // The filter remains optional if Places cannot load.
      }
    }

    void loadPlaces();

    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  useEffect(() => {
    const normalizedQuery = query.trim();

    if (!autocompleteRef.current || normalizedQuery.length < 2 || normalizedQuery === locationFilter?.label) {
      setPredictions([]);
      return;
    }

    let active = true;
    setLoading(true);
    const timeout = window.setTimeout(() => {
      autocompleteRef.current?.getPlacePredictions(
        {
          input: normalizedQuery,
          types: ["geocode"],
        },
        (nextPredictions, status) => {
          if (!active) {
            return;
          }

          setLoading(false);

          if (status !== "OK" || !nextPredictions) {
            setPredictions([]);
            return;
          }

          setPredictions(nextPredictions.slice(0, 5).map((prediction) => ({
            description: prediction.description,
            placeId: prediction.place_id,
          })));
        },
      );
    }, 240);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [locationFilter?.label, query]);

  const selectPrediction = (prediction: LocationPrediction) => {
    const detailsService = detailsServiceRef.current;

    if (!detailsService) {
      return;
    }

    setLoading(true);
    detailsService.getDetails({ fields: ["geometry", "name"], placeId: prediction.placeId }, (details, status) => {
      setLoading(false);
      setPredictions([]);

      const location = details?.geometry?.location;
      const lat = location?.lat();
      const lng = location?.lng();

      if (status !== "OK" || typeof lat !== "number" || typeof lng !== "number") {
        return;
      }

      setQuery(prediction.description);
      onChange({ label: prediction.description, lat, lng });
    });
  };

  return (
    <View style={styles.locationSearch}>
      <div ref={detailsElementRef} style={{ display: "none" }} />
      {predictions.length > 0 ? (
        <View style={styles.locationDropdown}>
          {predictions.map((prediction) => (
            <Pressable
              accessibilityRole="button"
              key={prediction.placeId}
              onPress={() => selectPrediction(prediction)}
              style={({ pressed }) => [styles.locationPrediction, pressed && styles.pressed]}
            >
              <SavoryIcon color={theme.colors.coral} glyph={MapPinIcon} size={16} strokeWidth={2.2} />
              <Text numberOfLines={1} style={styles.locationPredictionText}>{prediction.description}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={styles.locationInputShell}>
        <SavoryIcon color={theme.colors.muted} glyph={SearchIcon} size={18} strokeWidth={2.1} />
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={(text) => {
            setQuery(text);
            if (!text.trim()) {
              onChange(null);
            }
          }}
          placeholder="Buscar zona, ciudad o país"
          placeholderTextColor={theme.colors.faint}
          selectionColor={theme.colors.text}
          style={[styles.locationInput, inputPlatformStyle]}
          value={query}
        />
        {loading ? <ActivityIndicator color={theme.colors.coral} size="small" /> : null}
        {locationFilter ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => {
              setQuery("");
              onChange(null);
            }}
            style={styles.clearLocationButton}
          >
            <SavoryIcon color={theme.colors.muted} glyph={CloseIcon} size={16} strokeWidth={2.3} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function formatRating(value: number | null) {
  if (!value) {
    return "0/10";
  }

  return `${value.toLocaleString("es-ES", { maximumFractionDigits: 1 })}/10`;
}

function formatDate(value: string) {
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
  title: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 34,
  },
  filtersBlock: {
    marginBottom: 14,
  },
  locationSearch: {
    gap: 8,
    zIndex: 2,
  },
  locationInputShell: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceGlass,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: 9,
    height: 52,
    paddingHorizontal: 14,
  },
  locationInput: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    height: "100%",
    minWidth: 0,
  },
  clearLocationButton: {
    alignItems: "center",
    borderRadius: theme.radius.pill,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  locationDropdown: {
    ...floatingShadow,
    backgroundColor: theme.colors.surfaceGlass,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    gap: 2,
    padding: 8,
  },
  locationPrediction: {
    alignItems: "center",
    borderRadius: theme.radius.md,
    flexDirection: "row",
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 9,
  },
  locationPredictionText: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
  },
  deck: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  deckUnderlay: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.xl,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 0,
  },
  swipeCard: {
    overflow: "visible",
    width: "100%",
    zIndex: 1,
  },
  swipeGlow: {
    borderRadius: theme.radius.xl,
    bottom: -20,
    left: -20,
    position: "absolute",
    right: -20,
    top: -20,
    zIndex: 0,
  },
  swipeGlowLeft: {
    backgroundColor: "rgba(239, 68, 68, 0.3)",
    boxShadow: "0 0 38px 28px rgba(239, 68, 68, 0.42)",
  },
  swipeGlowRight: {
    backgroundColor: "rgba(34, 197, 94, 0.28)",
    boxShadow: "0 0 38px 28px rgba(34, 197, 94, 0.38)",
  },
  card: {
    ...floatingShadow,
    backgroundColor: theme.colors.surfaceGlass,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    gap: 12,
    overflow: "hidden",
    padding: 16,
    zIndex: 2,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 29,
  },
  addressLink: {
    color: theme.colors.coral,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 18,
    marginTop: 4,
  },
  linkRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  inlineLinkPill: {
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  inlineLinkText: {
    color: theme.colors.coral,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 16,
  },
  visitorsButton: {
    alignItems: "center",
    backgroundColor: theme.colors.coralSoft,
    borderColor: "#FFDAD5",
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    minHeight: 34,
    paddingHorizontal: 12,
  },
  visitorsButtonText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 16,
    maxWidth: 120,
  },
  visitorsButtonMore: {
    color: theme.colors.coral,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 16,
  },
  metricGrid: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  metricTile: {
    backgroundColor: theme.colors.coralSoft,
    borderColor: "#FFDAD5",
    borderRadius: theme.radius.md,
    borderWidth: 1,
    flex: 1,
    gap: 3,
    minHeight: 62,
    justifyContent: "center",
    padding: 8,
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
  tagSection: {
    gap: 7,
    marginTop: 12,
  },
  tagTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 17,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  tagPill: {
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    maxWidth: "100%",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagText: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
  },
  photoScroll: {
    marginTop: 12,
  },
  photoStrip: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 2,
  },
  photoItem: {
    backgroundColor: theme.colors.surfaceSoft,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    gap: 5,
    padding: 7,
    width: 118,
  },
  photoImage: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.sm,
    height: 88,
    width: "100%",
  },
  photoCaption: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
  },
  commentPreview: {
    alignItems: "flex-start",
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    padding: 12,
  },
  commentText: {
    color: theme.colors.textSoft,
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  swipeActions: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 12,
  },
  savingHint: {
    alignItems: "center",
    backgroundColor: theme.colors.coralSoft,
    borderColor: "#FFDAD5",
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 42,
    marginTop: 12,
    paddingHorizontal: 14,
  },
  savingHintText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 18,
  },
  rejectButton: {
    alignItems: "center",
    backgroundColor: "#FFF1F0",
    borderColor: "#FFD1CC",
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 5,
    height: 46,
    justifyContent: "center",
  },
  rejectButtonText: {
    color: theme.colors.danger,
    fontSize: 13,
    fontWeight: "900",
  },
  saveButton: {
    alignItems: "center",
    backgroundColor: theme.colors.coral,
    borderRadius: theme.radius.pill,
    flex: 1,
    flexDirection: "row",
    gap: 5,
    height: 46,
    justifyContent: "center",
  },
  saveButtonText: {
    color: theme.colors.white,
    fontSize: 13,
    fontWeight: "900",
  },
  disabledButton: {
    opacity: 0.64,
  },
  stateBlock: {
    alignItems: "center",
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
    textAlign: "center",
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 19,
    textAlign: "center",
  },
  messageBlock: {
    backgroundColor: theme.colors.surfaceGlass,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    marginTop: 12,
    padding: 12,
  },
  successText: {
    color: "#167245",
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 18,
    textAlign: "center",
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: theme.colors.text,
    borderRadius: theme.radius.pill,
    height: 42,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: theme.colors.white,
    fontSize: 13,
    fontWeight: "900",
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
    gap: 12,
    maxHeight: "86%",
    padding: 16,
  },
  detailHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
  },
  detailTitle: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 27,
  },
  detailScroll: {
    maxHeight: 680,
  },
  smallSheet: {
    ...floatingShadow,
    backgroundColor: theme.colors.surfaceGlass,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    gap: 12,
    maxHeight: "74%",
    padding: 16,
  },
  sheetHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  sheetTitle: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 20,
    fontWeight: "900",
    lineHeight: 25,
  },
  closeButton: {
    alignItems: "center",
    borderRadius: theme.radius.pill,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  smallSheetScroll: {
    maxHeight: 430,
  },
  visitorRow: {
    alignItems: "center",
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: 11,
    marginBottom: 8,
    minHeight: 62,
    padding: 10,
  },
  visitorAvatar: {
    backgroundColor: theme.colors.surfaceSoft,
    borderRadius: theme.radius.pill,
    height: 42,
    width: 42,
  },
  visitorAvatarFallback: {
    alignItems: "center",
    backgroundColor: theme.colors.coralSoft,
    borderRadius: theme.radius.pill,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  visitorInitial: {
    color: theme.colors.coral,
    fontSize: 16,
    fontWeight: "900",
  },
  visitorText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  visitorName: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 20,
  },
  visitorMeta: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
  },
  commentRow: {
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    gap: 5,
    marginBottom: 9,
    padding: 12,
  },
  commentAuthor: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 19,
  },
  commentDate: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 15,
  },
  commentFullText: {
    color: theme.colors.textSoft,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  bottomNav: {
    alignItems: "center",
    bottom: 22,
    left: 18,
    position: "absolute",
    right: 18,
  },
  pressed: {
    opacity: 0.74,
    transform: [{ scale: 0.99 }],
  },
});
