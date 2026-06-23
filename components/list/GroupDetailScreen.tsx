import { useLocalSearchParams, useRouter } from "expo-router";
import { Camera, Check, LogOut, Search, Trash2, UserPlus, UserRound, Users } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { TextStyle } from "react-native";

import { floatingShadow, theme } from "../../constants/theme";
import { compressImageFile } from "../../services/imageCompression";
import {
  addGroupMembers,
  getCurrentUserFriendsForGroups,
  getGroupDetail,
  leaveGroup,
  removeGroupMember,
  updateGroup,
  type GroupMember,
  type GroupSummary,
  type SocialProfile,
} from "../../services/groups";
import { supabase } from "../../services/supabase";
import type { SavoryPlace } from "../../types/place";
import type { RestaurantFilters, SavedRestaurantStatus } from "../../types/restaurant";
import { SavedRestaurantList } from "../restaurant/SavedRestaurantList";
import { RestaurantSaveSheet } from "../restaurant/RestaurantSaveSheet";
import { StandalonePlacesSearch } from "../search/StandalonePlacesSearch";
import { SavoryIcon, type SavoryIconGlyph } from "../ui/SavoryIcon";
import { SlidingSegmentedControl } from "../ui/SlidingSegmentedControl";
import { emptyRestaurantFilters, FiltersDropdown } from "./FiltersDropdown";
import { ListBackButton } from "./ListBackButton";
import { ListPageShell } from "./ListPageShell";

const CameraIcon = Camera as SavoryIconGlyph;
const CheckIcon = Check as SavoryIconGlyph;
const LogOutIcon = LogOut as SavoryIconGlyph;
const SearchIcon = Search as SavoryIconGlyph;
const TrashIcon = Trash2 as SavoryIconGlyph;
const UserAddIcon = UserPlus as SavoryIconGlyph;
const UserIcon = UserRound as SavoryIconGlyph;
const UsersIcon = Users as SavoryIconGlyph;
const MAX_GROUP_PHOTO_BYTES = 6 * 1024 * 1024;
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

export function GroupDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const groupId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [group, setGroup] = useState<GroupSummary | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [status, setStatus] = useState<SavedRestaurantStatus>("visited");
  const [filters, setFilters] = useState<RestaurantFilters>(emptyRestaurantFilters);
  const [selectedPlace, setSelectedPlace] = useState<SavoryPlace | null>(null);
  const [listVersion, setListVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isOwner = Boolean(group && currentUserId && group.owner_id === currentUserId);
  const canManageGroup = Boolean(currentUserId && members.some((member) => member.id === currentUserId));

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

  useEffect(() => {
    let active = true;

    supabase?.auth.getSession().then(({ data }) => {
      if (active) {
        setCurrentUserId(data.session?.user.id ?? null);
      }
    });

    return () => {
      active = false;
    };
  }, []);

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
              <Pressable
                accessibilityRole="button"
                onPress={() => setSettingsOpen(true)}
                style={({ pressed }) => [styles.groupHeader, pressed && styles.pressed]}
              >
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
              </Pressable>

              <SlidingSegmentedControl
                buttonStyle={styles.segmentButton}
                onChange={(nextStatus) => {
                  setStatus(nextStatus);
                  setFilters(emptyRestaurantFilters());
                }}
                options={[
                  { label: "Visitados", value: "visited" },
                  { label: "Deseados", value: "want_to_go" },
                ]}
                style={styles.segmented}
                textStyle={styles.segmentText}
                value={status}
              />

              <FiltersDropdown
                filters={filters}
                headerContent={<StandalonePlacesSearch onSelectPlace={setSelectedPlace} width={Math.max(220, contentWidth - 76)} />}
                includeVisibility={status === "visited"}
                onChange={setFilters}
                width={contentWidth}
              />

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

              <Modal
                animationType="fade"
                onRequestClose={() => setSettingsOpen(false)}
                transparent
                visible={settingsOpen}
              >
                <GroupSettingsSheet
                  currentUserId={currentUserId}
                  canManageGroup={canManageGroup}
                  group={group}
                  isOwner={isOwner}
                  members={members}
                  onClose={() => setSettingsOpen(false)}
                  onLeave={() => router.replace("/groups" as never)}
                  onRefresh={() => void loadGroup()}
                  width={contentWidth}
                />
              </Modal>
            </>
          ) : null}
        </View>
      )}
    </ListPageShell>
  );
}

type GroupSettingsSheetProps = {
  canManageGroup: boolean;
  currentUserId: string | null;
  group: GroupSummary;
  isOwner: boolean;
  members: GroupMember[];
  width: number;
  onClose: () => void;
  onLeave: () => void;
  onRefresh: () => void;
};

function GroupSettingsSheet({
  canManageGroup,
  currentUserId,
  group,
  isOwner,
  members,
  onClose,
  onLeave,
  onRefresh,
  width,
}: GroupSettingsSheetProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState(group.name);
  const [friends, setFriends] = useState<SocialProfile[]>([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [friendQuery, setFriendQuery] = useState("");
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const memberIds = useMemo(() => new Set(members.map((member) => member.id)), [members]);
  const visibleFriends = useMemo(() => {
    const normalizedQuery = normalizeText(friendQuery);

    return friends.filter(
      (friend) => !memberIds.has(friend.id) && normalizeText(friend.username).includes(normalizedQuery),
    );
  }, [friendQuery, friends, memberIds]);

  useEffect(() => {
    if (!canManageGroup) {
      return;
    }

    let active = true;
    setLoadingFriends(true);

    getCurrentUserFriendsForGroups()
      .then(({ data, error: loadError }) => {
        if (!active) {
          return;
        }

        setFriends(data);
        if (loadError) {
          setError(loadError.message);
        }
      })
      .catch(() => {
        if (active) {
          setError("No se pudieron cargar tus amigos.");
        }
      })
      .finally(() => {
        if (active) {
          setLoadingFriends(false);
        }
      });

    return () => {
      active = false;
    };
  }, [canManageGroup]);

  const handleSaveName = async () => {
    const cleanName = name.trim();

    if (!cleanName) {
      setError("Ponle un nombre al grupo.");
      return;
    }

    setSaving(true);
    setError(null);
    const { error: updateError } = await updateGroup({ groupId: group.id, name: cleanName });
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    onRefresh();
  };

  const handlePhotoPick = async (fileList: FileList | null) => {
    const file = fileList?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/") || file.size > MAX_GROUP_PHOTO_BYTES) {
      setError("Usa una imagen menor de 6 MB.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const avatarUrl = await compressImageFile(file, {
        maxHeight: 640,
        maxWidth: 640,
        quality: 0.78,
      });
      const { error: updateError } = await updateGroup({ avatarUrl, groupId: group.id });

      if (updateError) {
        setError(updateError.message);
      } else {
        onRefresh();
      }
    } catch {
      setError("No se pudo comprimir la foto del grupo.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePhoto = async () => {
    setSaving(true);
    setError(null);
    const { error: updateError } = await updateGroup({ avatarUrl: null, groupId: group.id });
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    onRefresh();
  };

  const toggleFriend = (friendId: string) => {
    setSelectedFriendIds((current) =>
      current.includes(friendId) ? current.filter((id) => id !== friendId) : [...current, friendId],
    );
  };

  const handleAddMembers = async () => {
    if (selectedFriendIds.length === 0) {
      return;
    }

    setSaving(true);
    setError(null);
    const { error: addError } = await addGroupMembers(group.id, selectedFriendIds);
    setSaving(false);

    if (addError) {
      setError(addError.message);
      return;
    }

    setSelectedFriendIds([]);
    setFriendQuery("");
    onRefresh();
  };

  const handleRemoveMember = async (member: GroupMember) => {
    if (!confirm(`Eliminar a ${member.username} del grupo?`)) {
      return;
    }

    setSaving(true);
    setError(null);
    const { error: removeError } = await removeGroupMember(group.id, member.id);
    setSaving(false);

    if (removeError) {
      setError(removeError.message);
      return;
    }

    onRefresh();
  };

  const handleLeaveGroup = async () => {
    if (!confirm("Quieres salir de este grupo?")) {
      return;
    }

    setSaving(true);
    setError(null);
    const { error: leaveError } = await leaveGroup(group.id);
    setSaving(false);

    if (leaveError) {
      setError(leaveError.message);
      return;
    }

    onClose();
    onLeave();
  };

  return (
    <View style={styles.modalBackdrop}>
      <Pressable accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFill} />
      <View style={[styles.settingsSheet, { width }]}>
        <ScrollView contentContainerStyle={styles.settingsContent} showsVerticalScrollIndicator={false}>
          <input
            accept="image/*"
            ref={fileInputRef}
            style={{ display: "none" }}
            type="file"
            onChange={(event) => {
              void handlePhotoPick(event.currentTarget.files);
              event.currentTarget.value = "";
            }}
          />

          <View style={styles.settingsHeader}>
            <Pressable
              accessibilityRole={group.avatar_url ? "imagebutton" : "button"}
              disabled={!canManageGroup || saving}
              onPress={() => fileInputRef.current?.click()}
              style={({ pressed }) => [styles.settingsAvatarButton, pressed && styles.pressed]}
            >
              {group.avatar_url ? (
                <Image source={{ uri: group.avatar_url }} style={styles.settingsAvatarImage} />
              ) : (
                <SavoryIcon color={theme.colors.coral} glyph={CameraIcon} size={28} strokeWidth={2.3} />
              )}
            </Pressable>
            <View style={styles.settingsTitleBlock}>
              <Text numberOfLines={2} style={styles.settingsTitle}>
                {group.name}
              </Text>
              <Text style={styles.settingsMeta}>{members.length} miembros</Text>
            </View>
          </View>

          {canManageGroup ? (
            <View style={styles.photoActions}>
              <Pressable
                accessibilityRole="button"
                disabled={saving}
                onPress={() => fileInputRef.current?.click()}
                style={({ pressed }) => [styles.lightActionButton, pressed && styles.pressed]}
              >
                <Text style={styles.lightActionText}>{group.avatar_url ? "Cambiar foto" : "Anadir foto"}</Text>
              </Pressable>
              {group.avatar_url ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={saving}
                  onPress={handleDeletePhoto}
                  style={({ pressed }) => [styles.dangerOutlineButton, pressed && styles.pressed]}
                >
                  <Text style={styles.dangerOutlineText}>Eliminar foto</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <View style={styles.settingsSection}>
            <Text style={styles.settingsSectionTitle}>Nombre</Text>
            {canManageGroup ? (
              <View style={styles.nameEditRow}>
                <TextInput
                  onChangeText={setName}
                  placeholder="Nombre del grupo"
                  placeholderTextColor={theme.colors.faint}
                  selectionColor={theme.colors.text}
                  style={[styles.nameInput, inputPlatformStyle]}
                  value={name}
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={saving || name.trim() === group.name}
                  onPress={handleSaveName}
                  style={({ pressed }) => [styles.saveMiniButton, pressed && styles.pressed]}
                >
                  {saving ? <ActivityIndicator color={theme.colors.white} /> : <SavoryIcon color={theme.colors.white} glyph={CheckIcon} size={18} strokeWidth={2.5} />}
                </Pressable>
              </View>
            ) : (
              <Text style={styles.readOnlyName}>{group.name}</Text>
            )}
          </View>

          <View style={styles.settingsSection}>
            <Text style={styles.settingsSectionTitle}>Miembros</Text>
            <View style={styles.membersList}>
              {members.map((member) => (
                <View key={member.id} style={styles.memberRow}>
                  {member.avatar_url ? (
                    <Image source={{ uri: member.avatar_url }} style={styles.memberAvatar} />
                  ) : (
                    <View style={styles.memberAvatarFallback}>
                      <SavoryIcon color={theme.colors.coral} glyph={UserIcon} size={17} strokeWidth={2.2} />
                    </View>
                  )}
                  <View style={styles.memberTextBlock}>
                    <Text numberOfLines={1} style={styles.memberName}>
                      {member.username}
                    </Text>
                    <Text style={styles.memberRole}>{member.role === "owner" ? "Creador" : "Miembro"}</Text>
                  </View>
                  {isOwner && member.id !== currentUserId ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={saving}
                      onPress={() => void handleRemoveMember(member)}
                      style={({ pressed }) => [styles.memberRemoveButton, pressed && styles.pressed]}
                    >
                      <SavoryIcon color={theme.colors.danger} glyph={TrashIcon} size={17} strokeWidth={2.3} />
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
          </View>

          {canManageGroup ? (
            <View style={styles.settingsSection}>
              <Text style={styles.settingsSectionTitle}>Anadir miembros</Text>
              <View style={styles.friendSearchShell}>
                <SavoryIcon color={theme.colors.muted} glyph={SearchIcon} size={18} strokeWidth={2.1} />
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={setFriendQuery}
                  placeholder="Buscar amigos"
                  placeholderTextColor={theme.colors.faint}
                  selectionColor={theme.colors.text}
                  style={[styles.friendSearchInput, inputPlatformStyle]}
                  value={friendQuery}
                />
              </View>
              {loadingFriends ? (
                <View style={styles.inlineState}>
                  <ActivityIndicator color={theme.colors.coral} />
                  <Text style={styles.inlineStateText}>Cargando amigos</Text>
                </View>
              ) : visibleFriends.length === 0 ? (
                <Text style={styles.inlineStateText}>
                  {friends.length === members.length - 1 ? "No tienes mas amigos para anadir." : "No hay amigos con ese nombre."}
                </Text>
              ) : (
                <ScrollView nestedScrollEnabled style={styles.addFriendsList}>
                  {visibleFriends.map((friend) => {
                    const selected = selectedFriendIds.includes(friend.id);

                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        key={friend.id}
                        onPress={() => toggleFriend(friend.id)}
                        style={({ pressed }) => [styles.addFriendRow, selected && styles.addFriendRowSelected, pressed && styles.pressed]}
                      >
                        {friend.avatar_url ? (
                          <Image source={{ uri: friend.avatar_url }} style={styles.memberAvatar} />
                        ) : (
                          <View style={styles.memberAvatarFallback}>
                            <SavoryIcon color={theme.colors.coral} glyph={UserIcon} size={17} strokeWidth={2.2} />
                          </View>
                        )}
                        <Text numberOfLines={1} style={styles.memberName}>
                          {friend.username}
                        </Text>
                        {selected ? (
                          <View style={styles.selectedBadge}>
                            <SavoryIcon color={theme.colors.white} glyph={CheckIcon} size={14} strokeWidth={2.5} />
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
              <Pressable
                accessibilityRole="button"
                disabled={saving || selectedFriendIds.length === 0}
                onPress={handleAddMembers}
                style={({ pressed }) => [
                  styles.addMembersButton,
                  selectedFriendIds.length === 0 && styles.disabledButton,
                  pressed && styles.pressed,
                ]}
              >
                <SavoryIcon color={theme.colors.white} glyph={UserAddIcon} size={18} strokeWidth={2.4} />
                <Text style={styles.addMembersText}>Anadir seleccionados</Text>
              </Pressable>
            </View>
          ) : null}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={handleLeaveGroup}
            style={({ pressed }) => [styles.leaveButton, pressed && styles.pressed]}
          >
            <SavoryIcon color={theme.colors.danger} glyph={LogOutIcon} size={19} strokeWidth={2.4} />
            <Text style={styles.leaveButtonText}>Salir del grupo</Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
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
  modalBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(18, 19, 20, 0.32)",
    flex: 1,
    justifyContent: "center",
    padding: 18,
  },
  settingsSheet: {
    ...floatingShadow,
    backgroundColor: theme.colors.surfaceGlass,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    maxHeight: "86%",
    overflow: "hidden",
  },
  settingsContent: {
    gap: 14,
    padding: 16,
  },
  settingsHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 13,
  },
  settingsAvatarButton: {
    alignItems: "center",
    backgroundColor: theme.colors.coralSoft,
    borderColor: "#FFDAD5",
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 70,
    justifyContent: "center",
    overflow: "hidden",
    width: 70,
  },
  settingsAvatarImage: {
    height: "100%",
    width: "100%",
  },
  settingsTitleBlock: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  settingsTitle: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 29,
  },
  settingsMeta: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17,
  },
  photoActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  lightActionButton: {
    alignItems: "center",
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    minHeight: 38,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  lightActionText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 17,
  },
  dangerOutlineButton: {
    alignItems: "center",
    backgroundColor: theme.colors.coralSoft,
    borderColor: "#FFDAD5",
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    minHeight: 38,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  dangerOutlineText: {
    color: theme.colors.danger,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 17,
  },
  settingsSection: {
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  settingsSectionTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 21,
  },
  nameEditRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  nameInput: {
    backgroundColor: theme.colors.surfaceSoft,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    color: theme.colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    height: 46,
    minWidth: 0,
    paddingHorizontal: 12,
  },
  saveMiniButton: {
    alignItems: "center",
    backgroundColor: theme.colors.coral,
    borderRadius: theme.radius.pill,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  readOnlyName: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20,
  },
  membersList: {
    gap: 8,
  },
  memberRow: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceSoft,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 54,
    padding: 8,
  },
  memberAvatar: {
    backgroundColor: theme.colors.coralSoft,
    borderRadius: theme.radius.pill,
    height: 36,
    width: 36,
  },
  memberAvatarFallback: {
    alignItems: "center",
    backgroundColor: theme.colors.coralSoft,
    borderRadius: theme.radius.pill,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  memberTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  memberName: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 18,
    minWidth: 0,
  },
  memberRole: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 15,
    textTransform: "uppercase",
  },
  memberRemoveButton: {
    alignItems: "center",
    backgroundColor: theme.colors.coralSoft,
    borderColor: "#FFDAD5",
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  friendSearchShell: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceSoft,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    height: 48,
    paddingHorizontal: 13,
  },
  friendSearchInput: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
    minWidth: 0,
  },
  inlineState: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  inlineStateText: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
  addFriendsList: {
    gap: 8,
    maxHeight: 190,
    overflow: "hidden",
  },
  addFriendRow: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceSoft,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 52,
    padding: 8,
  },
  addFriendRowSelected: {
    backgroundColor: theme.colors.coralSoft,
    borderColor: "#FFDAD5",
  },
  selectedBadge: {
    alignItems: "center",
    backgroundColor: theme.colors.coral,
    borderRadius: theme.radius.pill,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  addMembersButton: {
    alignItems: "center",
    backgroundColor: theme.colors.coral,
    borderRadius: theme.radius.pill,
    flexDirection: "row",
    gap: 8,
    height: 44,
    justifyContent: "center",
  },
  addMembersText: {
    color: theme.colors.white,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 18,
  },
  disabledButton: {
    opacity: 0.5,
  },
  leaveButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: theme.colors.coralSoft,
    borderColor: "#FFDAD5",
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 14,
  },
  leaveButtonText: {
    color: theme.colors.danger,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 18,
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
