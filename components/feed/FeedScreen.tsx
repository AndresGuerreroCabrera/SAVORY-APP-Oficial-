import { useRouter } from "expo-router";
import { Bookmark, Users, X } from "lucide-react-native";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { floatingShadow, theme } from "../../constants/theme";
import { trackAppEvent } from "../../services/appAnalytics";
import { getRestaurantFeed, type RestaurantFeedPost } from "../../services/feed";
import { getGoogleMapsUrl, getPhoneUrl, getWebsiteUrl, openExternalUrl } from "../../services/restaurantLinks";
import type { SocialProfile } from "../../services/groups";
import { recordRestaurantScoreEvent } from "../../services/savoryScore";
import type { SavoryPlace } from "../../types/place";
import type { RestaurantPhoto, SavedRestaurantRecord } from "../../types/restaurant";
import { BottomNav } from "../navigation/BottomNav";
import { RestaurantSaveSheet } from "../restaurant/RestaurantSaveSheet";
import { ImageLightbox } from "../ui/ImageLightbox";
import { SavoryIcon, type SavoryIconGlyph } from "../ui/SavoryIcon";

const BookmarkIcon = Bookmark as SavoryIconGlyph;
const CloseIcon = X as SavoryIconGlyph;
const GroupIcon = Users as SavoryIconGlyph;

export function FeedScreen() {
  const router = useRouter();
  const { width: viewportWidth } = useWindowDimensions();
  const overlayWidth = Math.max(280, viewportWidth - 36);
  const contentWidth = Math.min(overlayWidth, 520);
  const navWidth = Math.min(overlayWidth, 430);
  const [posts, setPosts] = useState<RestaurantFeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<RestaurantFeedPost | null>(null);
  const [savingPost, setSavingPost] = useState<RestaurantFeedPost | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<RestaurantPhoto | null>(null);
  const seenImpressionPostIdsRef = useRef(new Set<string>());

  const loadFeed = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: loadError } = await getRestaurantFeed();

    if (loadError) {
      setPosts([]);
      setError(loadError.message);
    } else {
      setPosts(data);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    for (const post of posts.slice(0, 30)) {
      if (seenImpressionPostIdsRef.current.has(post.id)) {
        continue;
      }

      seenImpressionPostIdsRef.current.add(post.id);
      void trackAppEvent({
        entityId: post.restaurant.google_place_id,
        entityType: "restaurant",
        eventName: "feed_impression",
        metadata: {
          feed_source: post.source,
          owner_user_id: getPostOwnerUserId(post),
        },
        route: "/feed",
      });
      void recordRestaurantScoreEvent({
        eventName: "feed_impression",
        googlePlaceId: post.restaurant.google_place_id,
        metadata: {
          feed_source: post.source,
        },
        ownerUserIds: [getPostOwnerUserId(post)],
        restaurantRecordId: post.restaurant.id,
        source: "feed",
      });
    }
  }, [posts]);

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.header, { width: contentWidth }]}>
            <Text style={styles.title}>Savory</Text>
          </View>

          {loading ? (
            <StateBlock width={contentWidth}>
              <ActivityIndicator color={theme.colors.coral} />
              <Text style={styles.stateText}>Cargando restaurantes de tus amigos</Text>
            </StateBlock>
          ) : error ? (
            <StateBlock width={contentWidth}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable accessibilityRole="button" onPress={() => void loadFeed()} style={styles.retryButton}>
                <Text style={styles.retryButtonText}>Reintentar</Text>
              </Pressable>
            </StateBlock>
          ) : posts.length === 0 ? (
            <StateBlock width={contentWidth}>
              <Text style={styles.stateText}>Todavia no hay visitas publicas de tus amigos.</Text>
            </StateBlock>
          ) : (
            <View style={[styles.postList, { width: contentWidth }]}>
              {posts.map((post) => (
                <FeedPostCard
                  key={post.id}
                  post={post}
                  onOpenDetail={setSelectedPost}
                  onOpenGroup={(groupId) => router.push(`/group/${groupId}` as never)}
                  onOpenProfile={(userId) => router.push(`/users/${userId}` as never)}
                  onPreviewPhoto={setPreviewPhoto}
                  onSave={setSavingPost}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      <View pointerEvents="box-none" style={styles.bottomNav}>
        <BottomNav width={navWidth} />
      </View>

      <Modal animationType="fade" onRequestClose={() => setSelectedPost(null)} transparent visible={Boolean(selectedPost)}>
        {selectedPost ? (
          <FeedPostDetail
            onClose={() => setSelectedPost(null)}
            onOpenGroup={(groupId) => {
              setSelectedPost(null);
              router.push(`/group/${groupId}` as never);
            }}
            onOpenProfile={(userId) => {
              setSelectedPost(null);
              router.push(`/users/${userId}` as never);
            }}
            onPreviewPhoto={setPreviewPhoto}
            onSave={setSavingPost}
            post={selectedPost}
            width={contentWidth}
          />
        ) : null}
      </Modal>

      <Modal animationType="fade" onRequestClose={() => setSavingPost(null)} transparent visible={Boolean(savingPost)}>
        {savingPost ? (
          <RestaurantSaveSheet
            onClose={() => setSavingPost(null)}
            onSaved={async () => {
              await recordRestaurantScoreEvent({
                eventName: "save_from_feed",
                googlePlaceId: savingPost.restaurant.google_place_id,
                metadata: {
                  feed_source: savingPost.source,
                },
                ownerUserIds: [getPostOwnerUserId(savingPost)],
                restaurantRecordId: savingPost.restaurant.id,
                source: "feed",
              });
              await trackAppEvent({
                entityId: savingPost.restaurant.google_place_id,
                entityType: "restaurant",
                eventName: "restaurant_saved_from_friend",
                metadata: {
                  feed_source: savingPost.source,
                  owner_user_id: getPostOwnerUserId(savingPost),
                },
                route: "/feed",
              });
              await loadFeed();
            }}
            place={restaurantToPlace(savingPost.restaurant)}
            width={contentWidth}
          />
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

function FeedPostCard({
  onOpenDetail,
  onOpenGroup,
  onOpenProfile,
  onPreviewPhoto,
  onSave,
  post,
}: {
  post: RestaurantFeedPost;
  onOpenDetail: (post: RestaurantFeedPost) => void;
  onOpenGroup: (groupId: string) => void;
  onOpenProfile: (userId: string) => void;
  onPreviewPhoto: (photo: RestaurantPhoto) => void;
  onSave: (post: RestaurantFeedPost) => void;
}) {
  return (
    <View style={styles.postCard}>
      <PostHeader post={post} onOpenGroup={onOpenGroup} onOpenProfile={onOpenProfile} />
      <RestaurantSummary
        compact
        onOpenDetail={() => onOpenDetail(post)}
        onPreviewPhoto={onPreviewPhoto}
        restaurant={post.restaurant}
      />
      <Pressable
        accessibilityRole="button"
        onPress={() => onSave(post)}
        style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}
      >
        <SavoryIcon color={theme.colors.white} glyph={BookmarkIcon} size={18} strokeWidth={2.4} />
        <Text style={styles.saveButtonText}>Guardar</Text>
      </Pressable>
    </View>
  );
}

function PostHeader({
  onOpenGroup,
  onOpenProfile,
  post,
}: {
  post: RestaurantFeedPost;
  onOpenGroup: (groupId: string) => void;
  onOpenProfile: (userId: string) => void;
}) {
  if (post.source === "group" && post.group) {
    const participantText = getParticipantText(post.members);

    return (
      <View style={styles.postHeader}>
        <Pressable accessibilityRole="button" onPress={() => onOpenGroup(post.group?.id ?? "")} style={styles.avatarButton}>
          {post.group.avatar_url ? (
            <Image source={{ uri: post.group.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={styles.groupAvatarFallback}>
              <SavoryIcon color={theme.colors.coral} glyph={GroupIcon} size={20} strokeWidth={2.2} />
            </View>
          )}
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => onOpenGroup(post.group?.id ?? "")} style={styles.headerTextBlock}>
          <Text numberOfLines={1} style={styles.headerName}>{post.group.name}</Text>
          <Text numberOfLines={1} style={styles.headerMeta}>{participantText}</Text>
        </Pressable>
      </View>
    );
  }

  const author = post.author ?? post.addedBy;

  return (
    <View style={styles.postHeader}>
      <Pressable
        accessibilityRole="button"
        disabled={!author}
        onPress={() => (author ? onOpenProfile(author.id) : undefined)}
        style={styles.avatarButton}
      >
        {author?.avatar_url ? (
          <Image source={{ uri: author.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarInitial}>{(author?.username ?? "U").charAt(0).toUpperCase()}</Text>
          </View>
        )}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={!author}
        onPress={() => (author ? onOpenProfile(author.id) : undefined)}
        style={styles.headerTextBlock}
      >
        <Text numberOfLines={1} style={styles.headerName}>{author?.username ?? "Usuario"}</Text>
        <Text numberOfLines={1} style={styles.headerMeta}>Visita publica</Text>
      </Pressable>
    </View>
  );
}

function RestaurantSummary({
  compact,
  onOpenDetail,
  onPreviewPhoto,
  restaurant,
}: {
  compact?: boolean;
  restaurant: SavedRestaurantRecord;
  onOpenDetail: () => void;
  onPreviewPhoto: (photo: RestaurantPhoto) => void;
}) {
  const photos = useMemo(() => [...restaurant.dish_photos, ...restaurant.local_photos].slice(0, compact ? 4 : 10), [compact, restaurant]);
  const mapsUrl = getGoogleMapsUrl({
    address: restaurant.address,
    lat: restaurant.location_lat,
    lng: restaurant.location_lng,
    name: restaurant.name,
    placeId: restaurant.google_place_id,
  });

  return (
    <View style={styles.restaurantBlock}>
      <Pressable accessibilityRole="button" onPress={onOpenDetail} style={({ pressed }) => pressed && styles.pressed}>
        <Text numberOfLines={compact ? 2 : 3} style={styles.restaurantName}>{restaurant.name}</Text>
      </Pressable>

      {restaurant.address ? (
        <Pressable accessibilityRole="link" onPress={() => openExternalUrl(mapsUrl)}>
          <Text numberOfLines={2} style={styles.addressLink}>{restaurant.address}</Text>
        </Pressable>
      ) : null}

      <View style={styles.linkRow}>
        {restaurant.phone ? (
          <Pressable accessibilityRole="link" onPress={() => openExternalUrl(getPhoneUrl(restaurant.phone ?? ""))} style={styles.linkPill}>
            <Text numberOfLines={1} style={styles.linkPillText}>{restaurant.phone}</Text>
          </Pressable>
        ) : null}
        {restaurant.website ? (
          <Pressable accessibilityRole="link" onPress={() => openExternalUrl(getWebsiteUrl(restaurant.website ?? ""))} style={styles.linkPill}>
            <Text numberOfLines={1} style={styles.linkPillText}>Web</Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable accessibilityRole="button" onPress={onOpenDetail} style={({ pressed }) => pressed && styles.pressed}>
        <View style={styles.metricGrid}>
          <MetricTile label="Puntuacion" value={formatRating(restaurant.food_rating)} />
          {restaurant.price_range ? <MetricTile label="Precio" value={restaurant.price_range} /> : null}
          <MetricTile label="Fecha" value={formatDate(restaurant.saved_at)} />
        </View>
        <TagSection tags={restaurant.cuisine_types.slice(0, compact ? 3 : undefined)} title="Comida" />
        <TagSection tags={restaurant.occasion_types.slice(0, compact ? 3 : undefined)} title="Ocasion" />
        {restaurant.general_comment ? (
          <Text numberOfLines={compact ? 3 : undefined} style={styles.commentText}>{restaurant.general_comment}</Text>
        ) : null}
      </Pressable>

      {photos.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
          <View style={styles.photoStrip}>
            {photos.map((photo, index) => (
              <Pressable
                accessibilityRole="imagebutton"
                key={`${photo.fileName}-${index}`}
                onPress={() => onPreviewPhoto(photo)}
                style={({ pressed }) => [styles.photoItem, pressed && styles.pressed]}
              >
                {photo.dataUrl ? <Image source={{ uri: photo.dataUrl }} style={styles.photoImage} /> : null}
                {photo.caption?.trim() ? <Text numberOfLines={1} style={styles.photoCaption}>{photo.caption.trim()}</Text> : null}
              </Pressable>
            ))}
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

function FeedPostDetail({
  onClose,
  onOpenGroup,
  onOpenProfile,
  onPreviewPhoto,
  onSave,
  post,
  width,
}: {
  post: RestaurantFeedPost;
  width: number;
  onClose: () => void;
  onOpenGroup: (groupId: string) => void;
  onOpenProfile: (userId: string) => void;
  onPreviewPhoto: (photo: RestaurantPhoto) => void;
  onSave: (post: RestaurantFeedPost) => void;
}) {
  return (
    <View style={styles.overlay}>
      <Pressable accessibilityLabel="Cerrar feed" onPress={onClose} style={styles.backdrop} />
      <View style={[styles.detailSheet, { width }]}>
        <View style={styles.sheetHeader}>
          <Text numberOfLines={1} style={styles.sheetTitle}>Detalle</Text>
          <Pressable accessibilityRole="button" hitSlop={10} onPress={onClose} style={styles.closeButton}>
            <SavoryIcon color={theme.colors.text} glyph={CloseIcon} size={20} strokeWidth={2.3} />
          </Pressable>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} style={styles.detailScroll}>
          <PostHeader post={post} onOpenGroup={onOpenGroup} onOpenProfile={onOpenProfile} />
          <RestaurantSummary
            onOpenDetail={() => undefined}
            onPreviewPhoto={onPreviewPhoto}
            restaurant={post.restaurant}
          />
          {post.restaurant.service_comment ? (
            <DetailSection title="Servicio" value={post.restaurant.service_comment} />
          ) : null}
          {post.restaurant.general_comment ? (
            <DetailSection title="Comentario general" value={post.restaurant.general_comment} />
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => onSave(post)}
            style={({ pressed }) => [styles.saveButton, styles.detailSaveButton, pressed && styles.pressed]}
          >
            <SavoryIcon color={theme.colors.white} glyph={BookmarkIcon} size={18} strokeWidth={2.4} />
            <Text style={styles.saveButtonText}>Guardar</Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
}

function DetailSection({ title, value }: { title: string; value: string }) {
  return (
    <View style={styles.detailSection}>
      <Text style={styles.detailSectionTitle}>{title}</Text>
      <Text style={styles.detailSectionText}>{value}</Text>
    </View>
  );
}

function StateBlock({ children, width }: { children: ReactNode; width: number }) {
  return <View style={[styles.stateBlock, { width }]}>{children}</View>;
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

function getParticipantText(members: SocialProfile[]) {
  const firstMember = members[0];

  if (!firstMember) {
    return "Grupo";
  }

  const remaining = Math.max(0, members.length - 1);
  return remaining > 0 ? `${firstMember.username} +${remaining} participantes` : firstMember.username;
}

function getPostOwnerUserId(post: RestaurantFeedPost) {
  return post.author?.id ?? post.addedBy?.id ?? post.restaurant.user_id;
}

function restaurantToPlace(restaurant: SavedRestaurantRecord): SavoryPlace {
  return {
    address: restaurant.address ?? undefined,
    id: restaurant.google_place_id,
    location:
      restaurant.location_lat != null && restaurant.location_lng != null
        ? { lat: restaurant.location_lat, lng: restaurant.location_lng }
        : undefined,
    name: restaurant.name,
    phone: restaurant.phone ?? undefined,
    placeId: restaurant.google_place_id,
    types: restaurant.google_types,
    website: restaurant.website ?? undefined,
  };
}

function formatRating(value: number) {
  if (!value) {
    return "0/10";
  }

  return `${value.toLocaleString("es-ES", { maximumFractionDigits: 1 })}/10`;
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
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
  header: {
    gap: 8,
    marginBottom: 18,
  },
  title: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 34,
  },
  postList: {
    gap: 14,
  },
  postCard: {
    ...floatingShadow,
    backgroundColor: theme.colors.surfaceGlass,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    gap: 13,
    padding: 16,
  },
  postHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 11,
  },
  avatarButton: {
    borderRadius: theme.radius.pill,
  },
  avatar: {
    backgroundColor: theme.colors.surfaceSoft,
    borderRadius: theme.radius.pill,
    height: 46,
    width: 46,
  },
  avatarFallback: {
    alignItems: "center",
    backgroundColor: theme.colors.coralSoft,
    borderRadius: theme.radius.pill,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  groupAvatarFallback: {
    alignItems: "center",
    backgroundColor: theme.colors.coralSoft,
    borderRadius: theme.radius.pill,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  avatarInitial: {
    color: theme.colors.coral,
    fontSize: 17,
    fontWeight: "900",
  },
  headerTextBlock: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  headerName: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 21,
  },
  headerMeta: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
  },
  restaurantBlock: {
    gap: 9,
  },
  restaurantName: {
    color: theme.colors.text,
    fontSize: 23,
    fontWeight: "900",
    lineHeight: 28,
  },
  addressLink: {
    color: theme.colors.coral,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 18,
    textDecorationLine: "underline",
  },
  linkRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  linkPill: {
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 34,
    paddingHorizontal: 12,
  },
  linkPillText: {
    color: theme.colors.coral,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 16,
  },
  metricGrid: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  metricTile: {
    backgroundColor: theme.colors.coralSoft,
    borderColor: "#FFDAD5",
    borderRadius: theme.radius.md,
    borderWidth: 1,
    flex: 1,
    gap: 3,
    justifyContent: "center",
    minHeight: 58,
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
    marginTop: 10,
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
  commentText: {
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    color: theme.colors.textSoft,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 10,
    padding: 12,
  },
  photoScroll: {
    marginTop: 2,
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
  saveButton: {
    alignItems: "center",
    backgroundColor: theme.colors.text,
    borderRadius: theme.radius.pill,
    flexDirection: "row",
    gap: 7,
    height: 46,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  detailSaveButton: {
    marginTop: 14,
  },
  saveButtonText: {
    color: theme.colors.white,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 18,
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
  retryButton: {
    alignItems: "center",
    backgroundColor: theme.colors.text,
    borderRadius: theme.radius.pill,
    height: 42,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  retryButtonText: {
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
  detailScroll: {
    maxHeight: 680,
  },
  detailSection: {
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    gap: 6,
    marginTop: 10,
    padding: 13,
  },
  detailSectionTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 20,
  },
  detailSectionText: {
    color: theme.colors.textSoft,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
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
