import { useRouter } from "expo-router";
import { ChevronRight, Edit3, Plus, Trash2, X } from "lucide-react-native";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { GestureResponderEvent, ViewProps } from "react-native";

import { floatingShadow, theme } from "../../constants/theme";
import { trackAppEvent } from "../../services/appAnalytics";
import { deleteGroupRestaurant, getGroupRestaurants } from "../../services/groups";
import { getGoogleMapsUrl, getPhoneUrl, getWebsiteUrl, openExternalUrl } from "../../services/restaurantLinks";
import {
  deleteSavedRestaurant,
  getCommunitySummaries,
  getCommunityVisitors,
  getCurrentUserSavedRestaurants,
  getPublicUserVisitedRestaurants,
} from "../../services/savedRestaurants";
import { recordRestaurantScoreEvent } from "../../services/savoryScore";
import type { SavoryPlace } from "../../types/place";
import type {
  RestaurantCommunitySummary,
  RestaurantCommunityVisitor,
  RestaurantFilters,
  RestaurantPhoto,
  RestaurantVisitSnapshot,
  SavedRestaurantRecord,
  SavedRestaurantStatus,
} from "../../types/restaurant";
import { ImageLightbox } from "../ui/ImageLightbox";
import { SavoryIcon, type SavoryIconGlyph } from "../ui/SavoryIcon";
import { RestaurantSaveSheet } from "./RestaurantSaveSheet";

type SavedRestaurantListProps = {
  contentWidth: number;
  filters?: RestaurantFilters;
  groupId?: string;
  publicUserId?: string;
  status: SavedRestaurantStatus;
};

type SelectedRestaurant = {
  record: SavedRestaurantRecord;
  summary?: RestaurantCommunitySummary;
  visitors?: RestaurantCommunityVisitor[];
};

const CloseIcon = X as SavoryIconGlyph;
const EditIcon = Edit3 as SavoryIconGlyph;
const NextIcon = ChevronRight as SavoryIconGlyph;
const PlusIcon = Plus as SavoryIconGlyph;
const TrashIcon = Trash2 as SavoryIconGlyph;

export function SavedRestaurantList({ contentWidth, filters, groupId, publicUserId, status }: SavedRestaurantListProps) {
  const router = useRouter();
  const [records, setRecords] = useState<SavedRestaurantRecord[]>([]);
  const [summaries, setSummaries] = useState<Map<string, RestaurantCommunitySummary>>(new Map());
  const [communityVisitors, setCommunityVisitors] = useState<Map<string, RestaurantCommunityVisitor[]>>(new Map());
  const [selectedRestaurant, setSelectedRestaurant] = useState<SelectedRestaurant | null>(null);
  const [visibleVisitorList, setVisibleVisitorList] = useState<RestaurantCommunityVisitor[] | null>(null);
  const [editingRestaurant, setEditingRestaurant] = useState<SavedRestaurantRecord | null>(null);
  const [markingVisitedRestaurant, setMarkingVisitedRestaurant] = useState<SavedRestaurantRecord | null>(null);
  const [savingProfileRestaurant, setSavingProfileRestaurant] = useState<SavedRestaurantRecord | null>(null);
  const [sharingRestaurant, setSharingRestaurant] = useState<SavedRestaurantRecord | null>(null);
  const [deletingRestaurantId, setDeletingRestaurantId] = useState<string | null>(null);
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

    try {
      const { data, error: loadError } = publicUserId
        ? await getPublicUserVisitedRestaurants(publicUserId)
        : groupId
          ? await getGroupRestaurants(groupId, status)
        : await getCurrentUserSavedRestaurants(status);

      if (loadError) {
        setRecords([]);
        setError(loadError.message);
        return;
      }

      setRecords(data);

      if (status === "want_to_go") {
        const placeIds = data.map((record) => record.google_place_id);
        const [nextSummaries, nextVisitors] = await Promise.all([
          getCommunitySummaries(placeIds),
          getCommunityVisitors(placeIds),
        ]);

        setSummaries(nextSummaries);
        setCommunityVisitors(nextVisitors);
      } else {
        setSummaries(new Map());
        setCommunityVisitors(new Map());
      }
    } catch {
      setRecords([]);
      setError("No se pudieron cargar los restaurantes.");
    } finally {
      setLoading(false);
    }
  }, [groupId, publicUserId, status]);

  useEffect(() => {
    void loadRestaurants();
  }, [loadRestaurants]);

  const handleDeleteRestaurant = useCallback(
    async (record: SavedRestaurantRecord) => {
      if (!confirmRestaurantDeletion(record, isWishlist)) {
        return;
      }

      setDeletingRestaurantId(record.id);
      setError(null);
      const { error: deleteError } = groupId
        ? await deleteGroupRestaurant(record.id, groupId)
        : await deleteSavedRestaurant(record.id);
      setDeletingRestaurantId(null);

      if (deleteError) {
        setError(deleteError.message);
        return;
      }

      setSelectedRestaurant((selected) => (selected?.record.id === record.id ? null : selected));
      await loadRestaurants();
    },
    [groupId, isWishlist, loadRestaurants],
  );

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
    const emptyMessage = getEmptyListMessage({
      isGroupList: Boolean(groupId),
      isPublicProfile: Boolean(publicUserId),
      isWishlist,
    });

    return (
      <View style={[styles.stateBlock, { width: contentWidth }]}>
        <Text style={styles.stateText}>{emptyMessage}</Text>
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
        const visitors = communityVisitors.get(record.google_place_id) ?? [];

        return (
          <RestaurantFoldedCard
            deleting={deletingRestaurantId === record.id}
            key={record.id}
            onDelete={!publicUserId ? () => void handleDeleteRestaurant(record) : undefined}
            onEdit={!isWishlist && !publicUserId ? () => setEditingRestaurant(record) : undefined}
            onAddToShared={!publicUserId && !groupId ? () => setSharingRestaurant(record) : undefined}
            onMarkVisited={isWishlist && !publicUserId ? () => setMarkingVisitedRestaurant(record) : undefined}
            onSaveFromProfile={publicUserId ? () => setSavingProfileRestaurant(record) : undefined}
            onPress={() => {
              void trackAppEvent({
                entityId: record.google_place_id,
                entityType: "restaurant",
                eventName: "saved_restaurant_detail_opened",
                metadata: {
                  list_scope: groupId ? "group" : publicUserId ? "public_profile" : "personal",
                  saved_at: record.saved_at,
                  status: record.status,
                  time_since_saved_hours: getHoursSince(record.saved_at),
                },
              });
              setSelectedRestaurant({ record, summary, visitors });
            }}
            onShowVisitors={visitors.length > 0 ? () => setVisibleVisitorList(visitors) : undefined}
            record={record}
            summary={summary}
            showVisibility={!isWishlist && !publicUserId}
            useCommunitySummary={isWishlist}
            visitors={visitors}
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
            deleting={deletingRestaurantId === selectedRestaurant.record.id}
            onClose={() => setSelectedRestaurant(null)}
            onDelete={!publicUserId ? () => void handleDeleteRestaurant(selectedRestaurant.record) : undefined}
            onAddToShared={
              !publicUserId && !groupId
                ? () => {
                    setSharingRestaurant(selectedRestaurant.record);
                    setSelectedRestaurant(null);
                  }
                : undefined
            }
            onEdit={
              !isWishlist && !publicUserId
                ? () => {
                    setEditingRestaurant(selectedRestaurant.record);
                    setSelectedRestaurant(null);
                  }
                : undefined
            }
            onMarkVisited={
              isWishlist && !publicUserId
                ? () => {
                    setMarkingVisitedRestaurant(selectedRestaurant.record);
                    setSelectedRestaurant(null);
                  }
                : undefined
            }
            onSaveFromProfile={publicUserId ? () => setSavingProfileRestaurant(selectedRestaurant.record) : undefined}
            record={selectedRestaurant.record}
            summary={selectedRestaurant.summary}
            visitors={selectedRestaurant.visitors ?? []}
            onShowVisitors={
              (selectedRestaurant.visitors?.length ?? 0) > 0
                ? () => setVisibleVisitorList(selectedRestaurant.visitors ?? [])
                : undefined
            }
            useCommunitySummary={isWishlist}
            width={contentWidth}
          />
        ) : null}
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setVisibleVisitorList(null)}
        transparent
        visible={Boolean(visibleVisitorList)}
      >
        {visibleVisitorList ? (
          <CommunityVisitorsOverlay
            onClose={() => setVisibleVisitorList(null)}
            onSelectVisitor={(visitor) => {
              setVisibleVisitorList(null);
              setSelectedRestaurant(null);
              router.push(`/users/${visitor.userId}` as never);
            }}
            visitors={visibleVisitorList}
            width={contentWidth}
          />
        ) : null}
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setEditingRestaurant(null)}
        transparent
        visible={Boolean(editingRestaurant)}
      >
        {editingRestaurant ? (
          <RestaurantSaveSheet
            historyMode="replace_latest"
            groupId={groupId}
            initialRecord={editingRestaurant}
            initialTarget={groupId ? "group" : "personal"}
            initialStatus="visited"
            lockTarget={Boolean(groupId)}
            lockStatus
            onClose={() => setEditingRestaurant(null)}
            onSaved={loadRestaurants}
            place={recordToPlace(editingRestaurant)}
            width={contentWidth}
          />
        ) : null}
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setMarkingVisitedRestaurant(null)}
        transparent
        visible={Boolean(markingVisitedRestaurant)}
      >
        {markingVisitedRestaurant ? (
          <RestaurantSaveSheet
            initialStatus="visited"
            groupId={groupId}
            initialTarget={groupId ? "group" : "personal"}
            lockTarget={Boolean(groupId)}
            lockStatus
            onClose={() => setMarkingVisitedRestaurant(null)}
            onSaved={async () => {
              if (groupId) {
                await deleteGroupRestaurant(markingVisitedRestaurant.id, groupId);
              } else {
                await deleteSavedRestaurant(markingVisitedRestaurant.id);
              }
              await loadRestaurants();
            }}
            place={recordToPlace(markingVisitedRestaurant)}
            width={contentWidth}
          />
        ) : null}
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setSharingRestaurant(null)}
        transparent
        visible={Boolean(sharingRestaurant)}
      >
        {sharingRestaurant ? (
          <RestaurantSaveSheet
            initialRecord={sharingRestaurant}
            initialStatus={sharingRestaurant.status}
            initialTarget="group"
            startWithGroupPickerOnly
            onClose={() => setSharingRestaurant(null)}
            onSaved={loadRestaurants}
            place={recordToPlace(sharingRestaurant)}
            width={contentWidth}
          />
        ) : null}
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setSavingProfileRestaurant(null)}
        transparent
        visible={Boolean(savingProfileRestaurant)}
      >
        {savingProfileRestaurant ? (
          <RestaurantSaveSheet
            onClose={() => setSavingProfileRestaurant(null)}
            onSaved={async () => {
              await trackAppEvent({
                entityId: savingProfileRestaurant.google_place_id,
                entityType: "restaurant",
                eventName: "save_from_profile",
                metadata: {
                  owner_user_id: publicUserId,
                  source: "public_profile",
                },
              });
              await recordRestaurantScoreEvent({
                eventName: "save_from_profile",
                googlePlaceId: savingProfileRestaurant.google_place_id,
                metadata: {
                  source: "public_profile",
                },
                ownerUserIds: publicUserId ? [publicUserId] : [],
                restaurantRecordId: savingProfileRestaurant.id,
                source: "public_profile",
              });
              await loadRestaurants();
            }}
            place={recordToPlace(savingProfileRestaurant)}
            width={contentWidth}
          />
        ) : null}
      </Modal>
    </View>
  );
}

type RestaurantFoldedCardProps = {
  deleting: boolean;
  record: SavedRestaurantRecord;
  showVisibility: boolean;
  summary?: RestaurantCommunitySummary;
  useCommunitySummary: boolean;
  visitors: RestaurantCommunityVisitor[];
  onDelete?: () => void;
  onAddToShared?: () => void;
  onEdit?: () => void;
  onMarkVisited?: () => void;
  onPress: () => void;
  onSaveFromProfile?: () => void;
  onShowVisitors?: () => void;
};

function RestaurantFoldedCard({
  deleting,
  onAddToShared,
  onDelete,
  onEdit,
  onMarkVisited,
  onPress,
  onSaveFromProfile,
  onShowVisitors,
  record,
  showVisibility,
  summary,
  useCommunitySummary,
  visitors,
}: RestaurantFoldedCardProps) {
  const rating = useCommunitySummary ? summary?.medianRating ?? null : record.food_rating;
  const priceRange = useCommunitySummary ? summary?.priceRangeMode ?? null : record.price_range;
  const cuisineTypes = useCommunitySummary ? summary?.cuisineTypes ?? [] : record.cuisine_types;
  const hasInfo = !useCommunitySummary || Boolean(rating || priceRange || cuisineTypes.length);

  return (
    <View {...getCardPressProps(onPress)} style={styles.card}>
      <View style={styles.cardMainButton}>
        <Text numberOfLines={1} style={styles.cardTitle}>
          {record.name}
        </Text>
      </View>
      {record.address ? (
        <Pressable
          accessibilityRole="link"
          onPress={(event) => {
            stopPressPropagation(event);
            openExternalUrl(
              getGoogleMapsUrl({
                address: record.address,
                lat: record.location_lat,
                lng: record.location_lng,
                name: record.name,
                placeId: record.google_place_id,
              }),
            );
          }}
        >
          <Text numberOfLines={1} style={styles.cardAddressLink}>
            {record.address}
          </Text>
        </Pressable>
      ) : null}
      <View style={styles.metaGrid}>
        <MetaPill label={formatRestaurantDateSummary(record)} />
        {showVisibility ? <MetaPill label={record.visibility === "public" ? "Público" : "Privado"} /> : null}
        {hasInfo ? <MetaPill label={`Nota ${formatRating(rating)}`} /> : null}
        {hasInfo && priceRange ? <MetaPill label={priceRange} /> : null}
      </View>
      {hasInfo && cuisineTypes.length > 0 ? (
        <Text numberOfLines={2} style={styles.cuisineLine}>
          {cuisineTypes.join(", ")}
        </Text>
      ) : null}
      {onAddToShared || onEdit || onMarkVisited || onDelete || onSaveFromProfile ? (
        <View style={styles.cardActions}>
          {onAddToShared ? <ActionButton icon={PlusIcon} label="Grupo" success onPress={onAddToShared} /> : null}
          {onSaveFromProfile ? <ActionButton label="Guardar" onPress={onSaveFromProfile} /> : null}
          {onEdit ? <ActionButton icon={EditIcon} label="Editar" onPress={onEdit} /> : null}
          {onMarkVisited ? <ActionButton label="Ya he ido" onPress={onMarkVisited} /> : null}
          {onDelete ? (
            <ActionButton danger disabled={deleting} icon={TrashIcon} label={deleting ? "Eliminando" : "Eliminar"} onPress={onDelete} />
          ) : null}
          {useCommunitySummary ? <CommunityVisitorsButton visitors={visitors} onPress={onShowVisitors} /> : null}
        </View>
      ) : null}
    </View>
  );
}

type RestaurantDetailOverlayProps = {
  deleting: boolean;
  record: SavedRestaurantRecord;
  summary?: RestaurantCommunitySummary;
  useCommunitySummary: boolean;
  visitors: RestaurantCommunityVisitor[];
  width: number;
  onClose: () => void;
  onAddToShared?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onMarkVisited?: () => void;
  onSaveFromProfile?: () => void;
  onShowVisitors?: () => void;
};

function RestaurantDetailOverlay({
  deleting,
  onAddToShared,
  onClose,
  onDelete,
  onEdit,
  onMarkVisited,
  onSaveFromProfile,
  onShowVisitors,
  record,
  summary,
  useCommunitySummary,
  visitors,
  width,
}: RestaurantDetailOverlayProps) {
  const visits = getVisitSnapshots(record);
  const [visitIndex, setVisitIndex] = useState(0);
  const activeVisit = visits[visitIndex] ?? buildSnapshotFromRecord(record);
  const rating = useCommunitySummary ? summary?.medianRating ?? null : activeVisit.food_rating;
  const priceRange = useCommunitySummary ? summary?.priceRangeMode ?? null : activeVisit.price_range;
  const cuisineTypes = useCommunitySummary ? summary?.cuisineTypes ?? [] : activeVisit.cuisine_types;
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

        {onAddToShared || onEdit || onMarkVisited || onDelete || onSaveFromProfile ? (
          <View style={styles.detailActions}>
            {onAddToShared ? <ActionButton icon={PlusIcon} label="Grupo" success onPress={onAddToShared} /> : null}
            {onSaveFromProfile ? <ActionButton label="Guardar" onPress={onSaveFromProfile} /> : null}
            {onEdit ? <ActionButton icon={EditIcon} label="Editar" onPress={onEdit} /> : null}
            {onMarkVisited ? <ActionButton label="Ya he ido" onPress={onMarkVisited} /> : null}
            {onDelete ? (
              <ActionButton danger disabled={deleting} icon={TrashIcon} label={deleting ? "Eliminando" : "Eliminar"} onPress={onDelete} />
            ) : null}
            {useCommunitySummary ? <CommunityVisitorsButton visitors={visitors} onPress={onShowVisitors} /> : null}
          </View>
        ) : null}

        <ScrollView showsVerticalScrollIndicator={false} style={styles.detailScroll}>
          {!useCommunitySummary && visits.length > 1 ? (
            <View style={styles.visitNavigator}>
              <View style={styles.visitNavigatorText}>
                <Text style={styles.visitNavigatorTitle}>
                  Visita {visitIndex + 1} de {visits.length}
                </Text>
                <Text style={styles.visitNavigatorDate}>{formatSavedDate(activeVisit.saved_at)}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => setVisitIndex((index) => (index + 1) % visits.length)}
                style={({ pressed }) => [styles.visitNextButton, pressed && styles.pressed]}
              >
                <Text style={styles.visitNextText}>Siguiente</Text>
                <SavoryIcon color={theme.colors.text} glyph={NextIcon} size={17} strokeWidth={2.4} />
              </Pressable>
            </View>
          ) : null}

          <View style={styles.heroSummary}>
            <MetricTile label="Puntuación" value={useCommunitySummary && !hasCommunityInfo ? "Sin datos" : formatRating(rating)} />
            <MetricTile label="Precio" value={priceRange ?? "Sin datos"} />
            <MetricTile label="Guardado" value={formatSavedDate(activeVisit.saved_at)} />
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
                {!useCommunitySummary ? <PhotoStrip photos={activeVisit.dish_photos} /> : null}
              </>
            )}
          </DetailSection>

          {!useCommunitySummary ? (
            <>
              <DetailSection title="Local">
                <DetailLine label="Ocasión" value={activeVisit.occasion_types.join(", ") || "Sin información"} />
                <DetailLine label="Precio por persona" value={priceRange ?? "Sin información"} />
                <PhotoStrip photos={activeVisit.local_photos} />
              </DetailSection>

              <DetailSection title="Servicio">
                <DetailLine label="Servicio" value={activeVisit.service_comment ?? "Sin información"} />
                <DetailLine label="Comentario general" value={activeVisit.general_comment ?? "Sin información"} />
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

type ActionButtonProps = {
  danger?: boolean;
  disabled?: boolean;
  icon?: SavoryIconGlyph;
  label: string;
  success?: boolean;
  onPress: () => void;
};

type CommunityVisitorsButtonProps = {
  visitors: RestaurantCommunityVisitor[];
  onPress?: () => void;
};

function CommunityVisitorsButton({ onPress, visitors }: CommunityVisitorsButtonProps) {
  const latestVisitor = visitors[0];

  if (!latestVisitor || !onPress) {
    return null;
  }

  const remainingCount = Math.max(0, visitors.length - 1);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={(event) => {
        stopPressPropagation(event);
        onPress();
      }}
      style={({ pressed }) => [styles.visitorsButton, pressed && styles.pressed]}
    >
      <Text numberOfLines={1} style={styles.visitorsButtonText}>
        {latestVisitor.username}
      </Text>
      {remainingCount > 0 ? <Text style={styles.visitorsButtonMore}>+{remainingCount}</Text> : null}
    </Pressable>
  );
}

type CommunityVisitorsOverlayProps = {
  visitors: RestaurantCommunityVisitor[];
  width: number;
  onClose: () => void;
  onSelectVisitor: (visitor: RestaurantCommunityVisitor) => void;
};

function CommunityVisitorsOverlay({ onClose, onSelectVisitor, visitors, width }: CommunityVisitorsOverlayProps) {
  return (
    <View style={styles.overlay}>
      <Pressable accessibilityLabel="Cerrar usuarios" onPress={onClose} style={styles.backdrop} />
      <View style={[styles.visitorsSheet, { width }]}>
        <View style={styles.visitorsHeader}>
          <Text style={styles.visitorsTitle}>Usuarios que han ido</Text>
          <Pressable accessibilityRole="button" hitSlop={10} onPress={onClose} style={styles.closeButton}>
            <SavoryIcon color={theme.colors.text} glyph={CloseIcon} size={20} strokeWidth={2.3} />
          </Pressable>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} style={styles.visitorsScroll}>
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
                  <Text style={styles.visitorAvatarInitial}>{visitor.username.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.visitorTextBlock}>
                <Text numberOfLines={1} style={styles.visitorName}>
                  {visitor.username}
                </Text>
                <Text style={styles.visitorMeta}>Última visita: {formatSavedDate(visitor.lastVisitedAt)}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

function ActionButton({ danger, disabled, icon, label, onPress, success }: ActionButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={(event) => {
        stopPressPropagation(event);
        onPress();
      }}
      style={({ pressed }) => [
        styles.actionButton,
        danger && styles.actionButtonDanger,
        success && styles.actionButtonSuccess,
        disabled && styles.actionButtonDisabled,
        pressed && styles.pressed,
      ]}
    >
      {icon ? <SavoryIcon color={danger ? theme.colors.danger : success ? "#15803D" : theme.colors.text} glyph={icon} size={16} strokeWidth={2.4} /> : null}
      <Text style={[styles.actionButtonText, danger && styles.actionButtonTextDanger, success && styles.actionButtonTextSuccess]}>{label}</Text>
    </Pressable>
  );
}

function stopPressPropagation(event: GestureResponderEvent) {
  event.stopPropagation?.();
  (event.nativeEvent as { stopPropagation?: () => void }).stopPropagation?.();
}

function getCardPressProps(onPress: () => void): ViewProps {
  if (Platform.OS !== "web") {
    return {
      onTouchEnd: onPress,
    };
  }

  return {
    onClick: onPress,
  } as unknown as ViewProps;
}

function recordToPlace(record: SavedRestaurantRecord): SavoryPlace {
  return {
    address: record.address ?? undefined,
    id: record.google_place_id,
    location:
      record.location_lat !== null && record.location_lng !== null
        ? {
            lat: record.location_lat,
            lng: record.location_lng,
          }
        : undefined,
    name: record.name,
    phone: record.phone ?? undefined,
    placeId: record.google_place_id,
    types: record.google_types,
    website: record.website ?? undefined,
  };
}

function confirmRestaurantDeletion(record: SavedRestaurantRecord, isWishlist: boolean) {
  if (typeof window === "undefined" || typeof window.confirm !== "function") {
    return true;
  }

  const listName = isWishlist ? "Deseados" : "restaurantes visitados";
  return window.confirm(`¿Seguro que quieres eliminar "${record.name}" de tu lista de ${listName}?`);
}

function getVisitSnapshots(record: SavedRestaurantRecord) {
  const visits = record.visit_history.length > 0 ? record.visit_history : [buildSnapshotFromRecord(record)];

  return [...visits].sort((a, b) => new Date(b.saved_at).getTime() - new Date(a.saved_at).getTime());
}

function buildSnapshotFromRecord(record: SavedRestaurantRecord): RestaurantVisitSnapshot {
  return {
    cuisine_types: record.cuisine_types,
    dish_photos: record.dish_photos,
    food_rating: record.food_rating,
    general_comment: record.general_comment,
    local_photos: record.local_photos,
    occasion_types: record.occasion_types,
    price_range: record.price_range,
    saved_at: record.saved_at,
    service_comment: record.service_comment,
    visibility: record.visibility,
  };
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
    <View style={styles.linkLine}>
      <Text style={styles.detailLineLabel}>{label}</Text>
      <Pressable accessibilityRole="link" onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
        <Text style={styles.linkLineValue}>{value}</Text>
      </Pressable>
    </View>
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
  const [selectedPhoto, setSelectedPhoto] = useState<RestaurantPhoto | null>(null);

  if (photos.length === 0) {
    return <Text style={styles.emptyText}>Sin fotos</Text>;
  }

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
        <View style={styles.photoStrip}>
          {photos.map((photo, index) => (
            <View key={`${photo.fileName}-${index}`} style={styles.photoItem}>
              {photo.dataUrl ? (
                <Pressable accessibilityRole="imagebutton" onPress={() => setSelectedPhoto(photo)} style={({ pressed }) => pressed && styles.pressed}>
                  <Image source={{ uri: photo.dataUrl }} style={styles.photoImage} />
                </Pressable>
              ) : null}
              {photo.caption?.trim() ? (
                <Text numberOfLines={2} style={styles.photoCaption}>
                  {photo.caption.trim()}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      </ScrollView>
      <ImageLightbox
        caption={selectedPhoto?.caption?.trim() || null}
        imageUri={selectedPhoto?.dataUrl ?? null}
        onClose={() => setSelectedPhoto(null)}
        title={selectedPhoto?.caption?.trim() || "Foto"}
        visible={Boolean(selectedPhoto?.dataUrl)}
      />
    </>
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

function formatRestaurantDateSummary(record: SavedRestaurantRecord) {
  if (record.status !== "visited") {
    return formatSavedDate(record.saved_at);
  }

  const dates = getVisitSnapshots(record).map((visit) => formatSavedDate(visit.saved_at));

  if (dates.length <= 1) {
    return dates[0] ?? formatSavedDate(record.saved_at);
  }

  return `Fechas: ${dates.slice(0, 2).join(" · ")}${dates.length > 2 ? ` +${dates.length - 2}` : ""}`;
}

function formatRating(value: number | null) {
  if (!value) {
    return "0/10";
  }

  return `${value.toLocaleString("es-ES", { maximumFractionDigits: 1 })}/10`;
}

function getEmptyListMessage({
  isGroupList,
  isPublicProfile,
  isWishlist,
}: {
  isGroupList: boolean;
  isPublicProfile: boolean;
  isWishlist: boolean;
}) {
  if (isPublicProfile) {
    return "Este usuario todavia no ha guardado restaurantes publicos.";
  }

  if (isGroupList && isWishlist) {
    return "Esta lista compartida aun no tiene deseados. Guardad restaurantes que os apetezca probar juntos 😋";
  }

  if (isGroupList) {
    return "Esta lista compartida aun no tiene visitados. Guardad restaurantes cuando descubrais sitios que os gusten 😋";
  }

  if (isWishlist) {
    return "Aun no tienes deseados. Guarda restaurantes que quieras probar y empieza tu lista 😋";
  }

  return "Aun no has guardado restaurantes visitados. Anade sitios que te hayan gustado para recordarlos y compartirlos 😋";
}

function getHoursSince(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return Math.max(0, Math.round((Date.now() - date.getTime()) / 36_000) / 10);
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
    (filters.priceRanges.length === 0 || (priceRange ? filters.priceRanges.includes(priceRange) : false)) &&
    (filters.visibilities.length === 0 || filters.visibilities.includes(record.visibility))
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
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  cardMainButton: {
    borderRadius: theme.radius.md,
  },
  cardActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  detailActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actionButton: {
    alignItems: "center",
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  actionButtonDanger: {
    backgroundColor: "#FFF1F0",
    borderColor: "#FFD1CC",
  },
  actionButtonSuccess: {
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  actionButtonText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 16,
  },
  actionButtonTextDanger: {
    color: theme.colors.danger,
  },
  actionButtonTextSuccess: {
    color: "#15803D",
  },
  visitorsButton: {
    alignItems: "center",
    backgroundColor: theme.colors.coralSoft,
    borderColor: "#FFDAD5",
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    minHeight: 36,
    maxWidth: "100%",
    paddingHorizontal: 12,
  },
  visitorsButtonText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 16,
    maxWidth: 116,
  },
  visitorsButtonMore: {
    color: theme.colors.coral,
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
  visitorsSheet: {
    ...floatingShadow,
    backgroundColor: theme.colors.surfaceGlass,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    gap: 12,
    maxHeight: "72%",
    padding: 16,
  },
  visitorsHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  visitorsTitle: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 20,
    fontWeight: "900",
    lineHeight: 25,
  },
  visitorsScroll: {
    maxHeight: 360,
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
  visitorAvatarInitial: {
    color: theme.colors.coral,
    fontSize: 16,
    fontWeight: "900",
  },
  visitorTextBlock: {
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
  heroSummary: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: 12,
  },
  visitNavigator: {
    alignItems: "center",
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    marginBottom: 10,
    padding: 11,
  },
  visitNavigatorText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  visitNavigatorTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 17,
  },
  visitNavigatorDate: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
  },
  visitNextButton: {
    alignItems: "center",
    backgroundColor: theme.colors.coralSoft,
    borderColor: "#FFDAD5",
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    height: 34,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  visitNextText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 16,
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
