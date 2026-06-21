import { useLocalSearchParams } from "expo-router";
import { Users } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { floatingShadow, theme } from "../../constants/theme";
import { getGroupDetail, type GroupMember, type GroupSummary } from "../../services/groups";
import type { SavoryPlace } from "../../types/place";
import type { RestaurantFilters, SavedRestaurantStatus } from "../../types/restaurant";
import { SavedRestaurantList } from "../restaurant/SavedRestaurantList";
import { RestaurantSaveSheet } from "../restaurant/RestaurantSaveSheet";
import { StandalonePlacesSearch } from "../search/StandalonePlacesSearch";
import { SavoryIcon, type SavoryIconGlyph } from "../ui/SavoryIcon";
import { emptyRestaurantFilters, FiltersDropdown } from "./FiltersDropdown";
import { ListBackButton } from "./ListBackButton";
import { ListPageShell } from "./ListPageShell";

const UsersIcon = Users as SavoryIconGlyph;

export function GroupDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const groupId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [group, setGroup] = useState<GroupSummary | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [status, setStatus] = useState<SavedRestaurantStatus>("visited");
  const [filters, setFilters] = useState<RestaurantFilters>(emptyRestaurantFilters);
  const [selectedPlace, setSelectedPlace] = useState<SavoryPlace | null>(null);
  const [listVersion, setListVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadGroup = useCallback(async () => {
    if (!groupId) {
      setError("No se pudo identificar el grupo.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error: loadError } = await getGroupDetail(groupId);

    if (loadError || !data) {
      setError(loadError?.message ?? "No se pudo cargar el grupo.");
    } else {
      setGroup(data.group);
      setMembers(data.members);
    }

    setLoading(false);
  }, [groupId]);

  useEffect(() => {
    void loadGroup();
  }, [loadGroup]);

  return (
    <ListPageShell title={group?.name ?? "Grupo"}>
      {({ contentWidth }) => (
        <View style={[styles.contentBlock, { width: contentWidth }]}>
          <ListBackButton width={contentWidth} />

          {loading ? (
            <View style={styles.stateBlock}>
              <ActivityIndicator color={theme.colors.coral} />
              <Text style={styles.stateText}>Cargando grupo</Text>
            </View>
          ) : error ? (
            <View style={styles.stateBlock}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : group && groupId ? (
            <>
              <View style={styles.groupHeader}>
                {group.avatar_url ? (
                  <Image source={{ uri: group.avatar_url }} style={styles.groupAvatar} />
                ) : (
                  <View style={styles.groupAvatarFallback}>
                    <SavoryIcon color={theme.colors.coral} glyph={UsersIcon} size={25} strokeWidth={2.2} />
                  </View>
                )}
                <View style={styles.groupHeaderText}>
                  <Text numberOfLines={1} style={styles.groupName}>
                    {group.name}
                  </Text>
                  <Text style={styles.groupMeta}>{members.length} usuarios</Text>
                </View>
              </View>

              <View style={styles.segmented}>
                <SegmentButton
                  active={status === "visited"}
                  label="Visitados"
                  onPress={() => {
                    setStatus("visited");
                    setFilters(emptyRestaurantFilters());
                  }}
                />
                <SegmentButton
                  active={status === "want_to_go"}
                  label="Deseados"
                  onPress={() => {
                    setStatus("want_to_go");
                    setFilters(emptyRestaurantFilters());
                  }}
                />
              </View>

              <FiltersDropdown
                filters={filters}
                includeVisibility={status === "visited"}
                onChange={setFilters}
                width={contentWidth}
              />

              <StandalonePlacesSearch onSelectPlace={setSelectedPlace} width={contentWidth} />

              <SavedRestaurantList
                contentWidth={contentWidth}
                filters={filters}
                groupId={groupId}
                key={`${groupId}-${status}-${listVersion}`}
                status={status}
              />

              <Modal
                animationType="fade"
                onRequestClose={() => setSelectedPlace(null)}
                transparent
                visible={Boolean(selectedPlace)}
              >
                {selectedPlace ? (
                  <RestaurantSaveSheet
                    groupId={groupId}
                    initialStatus={status}
                    initialTarget="group"
                    lockTarget
                    onClose={() => setSelectedPlace(null)}
                    onSaved={() => setListVersion((version) => version + 1)}
                    place={selectedPlace}
                    width={contentWidth}
                  />
                ) : null}
              </Modal>
            </>
          ) : null}
        </View>
      )}
    </ListPageShell>
  );
}

type SegmentButtonProps = {
  active: boolean;
  label: string;
  onPress: () => void;
};

function SegmentButton({ active, label, onPress }: SegmentButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.segmentButton, active && styles.segmentButtonActive, pressed && styles.pressed]}
    >
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  contentBlock: {
    gap: 12,
    width: "100%",
  },
  groupHeader: {
    ...floatingShadow,
    alignItems: "center",
    backgroundColor: theme.colors.surfaceGlass,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: 13,
    padding: 14,
  },
  groupAvatar: {
    backgroundColor: theme.colors.surfaceSoft,
    borderRadius: theme.radius.pill,
    height: 58,
    width: 58,
  },
  groupAvatarFallback: {
    alignItems: "center",
    backgroundColor: theme.colors.coralSoft,
    borderRadius: theme.radius.pill,
    height: 58,
    justifyContent: "center",
    width: 58,
  },
  groupHeaderText: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  groupName: {
    color: theme.colors.text,
    fontSize: 19,
    fontWeight: "900",
    lineHeight: 24,
  },
  groupMeta: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17,
  },
  segmented: {
    backgroundColor: theme.colors.surfaceGlass,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    padding: 5,
  },
  segmentButton: {
    alignItems: "center",
    borderRadius: theme.radius.pill,
    flex: 1,
    height: 40,
    justifyContent: "center",
  },
  segmentButtonActive: {
    backgroundColor: theme.colors.coral,
  },
  segmentText: {
    color: theme.colors.textSoft,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 17,
  },
  segmentTextActive: {
    color: theme.colors.white,
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
  pressed: {
    opacity: 0.74,
    transform: [{ scale: 0.99 }],
  },
});
