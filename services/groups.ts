import { supabase } from "./supabase";
import { trackAppEvent } from "./appAnalytics";
import type { SavoryPlace } from "../types/place";
import type {
  RestaurantPhoto,
  RestaurantVisitSnapshot,
  SavedRestaurantRecord,
  SavedRestaurantStatus,
  SavedRestaurantVisibility,
} from "../types/restaurant";

type VisitHistoryMode = "append" | "replace_latest";

export type SocialProfile = {
  avatar_url: string | null;
  display_name: string | null;
  id: string;
  username: string;
};

export type GroupSummary = {
  avatar_url: string | null;
  created_at: string;
  id: string;
  member_count: number;
  name: string;
  owner_id: string;
  updated_at: string;
};

export type GroupMember = SocialProfile & {
  role: "owner" | "member";
};

export type GroupRestaurantPin = SavedRestaurantRecord & {
  group_id: string;
  group_name: string;
};

type SaveGroupRestaurantInput = {
  groupId: string;
  place: SavoryPlace;
  status: SavedRestaurantStatus;
  userId: string;
  historyMode?: VisitHistoryMode;
  savedAt?: string;
  visibility?: SavedRestaurantVisibility;
  cuisineTypes?: string[];
  dishPhotos?: RestaurantPhoto[];
  foodRating?: number;
  occasionTypes?: string[];
  localPhotos?: RestaurantPhoto[];
  priceRange?: string | null;
  serviceComment?: string | null;
  generalComment?: string | null;
};

export async function getCurrentUserGroups() {
  if (!supabase) {
    return { data: [] as GroupSummary[], error: new Error("Supabase no esta configurado.") };
  }

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !sessionData.session) {
      return {
        data: [] as GroupSummary[],
        error: normalizeSupabaseError(sessionError) ?? new Error("Inicia sesion para ver tus grupos."),
      };
    }

    const { data, error } = await supabase
      .from("group_members")
      .select("group:groups(id, owner_id, name, avatar_url, created_at, updated_at)")
      .eq("user_id", sessionData.session.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return { data: [] as GroupSummary[], error: normalizeSupabaseError(error) };
    }

    const groups = (data ?? [])
      .map((row) => normalizeGroupSummary((row as { group?: unknown }).group))
      .filter((group): group is GroupSummary => Boolean(group));
    const withCounts = await Promise.all(groups.map(withMemberCount));

    return { data: withCounts, error: null };
  } catch (error) {
    return { data: [] as GroupSummary[], error: normalizeSupabaseError(error) };
  }
}

export async function getGroupDetail(groupId: string) {
  if (!supabase) {
    return { data: null, error: new Error("Supabase no esta configurado.") };
  }

  try {
    const { data: groupData, error: groupError } = await supabase
      .from("groups")
      .select("id, owner_id, name, avatar_url, created_at, updated_at")
      .eq("id", groupId)
      .single();

    if (groupError) {
      return { data: null, error: normalizeSupabaseError(groupError) };
    }

    const group = await withMemberCount(normalizeGroupSummary(groupData));
    const { data: memberData, error: memberError } = await supabase
      .from("group_members")
      .select("role, profile:profiles(id, username, display_name, avatar_url)")
      .eq("group_id", groupId)
      .order("created_at", { ascending: true });

    if (memberError) {
      return { data: null, error: normalizeSupabaseError(memberError) };
    }

    const members = (memberData ?? [])
      .map((row) => normalizeGroupMember(row))
      .filter((member): member is GroupMember => Boolean(member));

    return { data: { group, members }, error: null };
  } catch (error) {
    return { data: null, error: normalizeSupabaseError(error) };
  }
}

export async function getCurrentUserFriendsForGroups() {
  if (!supabase) {
    return { data: [] as SocialProfile[], error: new Error("Supabase no esta configurado.") };
  }

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !sessionData.session) {
      return {
        data: [] as SocialProfile[],
        error: normalizeSupabaseError(sessionError) ?? new Error("Inicia sesion para cargar tus amigos."),
      };
    }

    const currentUserId = sessionData.session.user.id;
    const { data, error } = await supabase
      .from("friendships")
      .select(
        "requester_id, receiver_id, requester:profiles!friendships_requester_id_fkey(id, username, display_name, avatar_url), receiver:profiles!friendships_receiver_id_fkey(id, username, display_name, avatar_url)",
      )
      .eq("status", "accepted")
      .or(`requester_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`);

    if (error) {
      return { data: [] as SocialProfile[], error: normalizeSupabaseError(error) };
    }

    const friends = (data ?? [])
      .map((row) => {
        const record = row as { receiver?: unknown; receiver_id?: unknown; requester?: unknown; requester_id?: unknown };
        return record.requester_id === currentUserId
          ? normalizeSocialProfile(record.receiver)
          : normalizeSocialProfile(record.requester);
      })
      .filter((profile): profile is SocialProfile => Boolean(profile));

    return { data: dedupeProfiles(friends), error: null };
  } catch (error) {
    return { data: [] as SocialProfile[], error: normalizeSupabaseError(error) };
  }
}

export async function createGroup(input: { avatarUrl?: string | null; friendIds: string[]; name: string }) {
  if (!supabase) {
    return { data: null, error: new Error("Supabase no esta configurado.") };
  }

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !sessionData.session) {
      return { data: null, error: normalizeSupabaseError(sessionError) ?? new Error("Inicia sesion para crear grupos.") };
    }

    const userId = sessionData.session.user.id;
    const { data: groupData, error: groupError } = await supabase
      .from("groups")
      .insert({
        avatar_url: input.avatarUrl ?? null,
        name: input.name.trim(),
        owner_id: userId,
      })
      .select("id, owner_id, name, avatar_url, created_at, updated_at")
      .single();

    if (groupError) {
      return { data: null, error: normalizeSupabaseError(groupError) };
    }

    const group = normalizeGroupSummary(groupData);
    const memberRows = Array.from(new Set([userId, ...input.friendIds])).map((memberId) => ({
      group_id: group.id,
      role: memberId === userId ? "owner" : "member",
      user_id: memberId,
    }));
    const { error: membersError } = await supabase.from("group_members").insert(memberRows);

    if (membersError) {
      await supabase.from("groups").delete().eq("id", group.id).eq("owner_id", userId);
      return { data: null, error: normalizeSupabaseError(membersError) };
    }

    const groupWithCount = await withMemberCount(group);

    void trackAppEvent({
      entityId: group.id,
      entityType: "group",
      eventName: "group_created",
      metadata: {
        invited_friends_count: input.friendIds.length,
        member_count: groupWithCount.member_count,
      },
    });

    return { data: groupWithCount, error: null };
  } catch (error) {
    return { data: null, error: normalizeSupabaseError(error) };
  }
}

export async function getGroupRestaurants(groupId: string, status: SavedRestaurantStatus) {
  if (!supabase) {
    return { data: [] as SavedRestaurantRecord[], error: new Error("Supabase no esta configurado.") };
  }

  try {
    const { data, error } = await supabase
      .from("group_restaurants")
      .select("*")
      .eq("group_id", groupId)
      .eq("status", status)
      .order("saved_at", { ascending: false });

    if (error) {
      return { data: [] as SavedRestaurantRecord[], error: normalizeSupabaseError(error) };
    }

    return { data: (data ?? []).map(normalizeGroupRestaurant), error: null };
  } catch (error) {
    return { data: [] as SavedRestaurantRecord[], error: normalizeSupabaseError(error) };
  }
}

export async function getCurrentUserGroupRestaurantPins() {
  if (!supabase) {
    return { data: [] as GroupRestaurantPin[], error: new Error("Supabase no esta configurado.") };
  }

  try {
    const { data: groups, error: groupsError } = await getCurrentUserGroups();

    if (groupsError) {
      return { data: [] as GroupRestaurantPin[], error: groupsError };
    }

    const groupIds = groups.map((group) => group.id);

    if (groupIds.length === 0) {
      return { data: [] as GroupRestaurantPin[], error: null };
    }

    const groupNameById = new Map(groups.map((group) => [group.id, group.name]));
    const { data, error } = await supabase
      .from("group_restaurants")
      .select("*")
      .in("group_id", groupIds)
      .not("location_lat", "is", null)
      .not("location_lng", "is", null);

    if (error) {
      return { data: [] as GroupRestaurantPin[], error: normalizeSupabaseError(error) };
    }

    return {
      data: (data ?? []).map((row) => {
        const record = row as { group_id?: unknown };
        const groupId = typeof record.group_id === "string" ? record.group_id : "";

        return {
          ...normalizeGroupRestaurant(row),
          group_id: groupId,
          group_name: groupNameById.get(groupId) ?? "Grupo",
        };
      }),
      error: null,
    };
  } catch (error) {
    return { data: [] as GroupRestaurantPin[], error: normalizeSupabaseError(error) };
  }
}

export async function saveGroupRestaurant(input: SaveGroupRestaurantInput) {
  if (!supabase) {
    return { alreadyExists: false, data: null, error: new Error("Supabase no esta configurado.") };
  }

  const googlePlaceId = input.place.placeId || input.place.id;
  const payload = {
    added_by: input.userId,
    address: input.place.address ?? null,
    cuisine_types: input.cuisineTypes ?? [],
    dish_photos: input.dishPhotos ?? [],
    food_rating: input.foodRating ?? 0,
    general_comment: input.generalComment ?? null,
    google_place_id: googlePlaceId,
    google_types: input.place.types,
    group_id: input.groupId,
    local_photos: input.localPhotos ?? [],
    location_lat: input.place.location?.lat ?? null,
    location_lng: input.place.location?.lng ?? null,
    name: input.place.name,
    occasion_types: input.occasionTypes ?? [],
    phone: input.place.phone ?? null,
    price_range: input.priceRange ?? null,
    saved_at: input.savedAt ?? new Date().toISOString(),
    service_comment: input.serviceComment ?? null,
    status: input.status,
    visibility: input.visibility ?? "private",
    website: input.place.website ?? null,
  };

  try {
    const { data: existing, error: lookupError } = await supabase
      .from("group_restaurants")
      .select("*")
      .eq("group_id", input.groupId)
      .eq("google_place_id", googlePlaceId)
      .eq("status", input.status)
      .maybeSingle();

    if (lookupError) {
      return { alreadyExists: false, data: null, error: normalizeSupabaseError(lookupError) };
    }

    if (input.status === "want_to_go") {
      if (existing) {
        const normalized = normalizeGroupRestaurant(existing);

        void trackGroupRestaurantAnalytics("group_restaurant_save_duplicate", normalized, input.groupId);

        return { alreadyExists: true, data: normalized, error: null };
      }

      const { data, error } = await supabase
        .from("group_restaurants")
        .insert({ ...payload, visit_history: [] })
        .select("*")
        .single();

      const normalized = data ? normalizeGroupRestaurant(data) : null;

      if (!error && normalized) {
        void trackGroupRestaurantAnalytics("group_restaurant_saved", normalized, input.groupId);
      }

      return { alreadyExists: false, data: normalized, error: normalizeSupabaseError(error) };
    }

    const nextVisit = buildVisitSnapshot(payload);

    if (existing) {
      const existingRecord = normalizeGroupRestaurant(existing);
      const currentHistory =
        existingRecord.visit_history.length > 0 ? existingRecord.visit_history : [buildVisitSnapshot(existingRecord)];
      const nextHistory =
        input.historyMode === "replace_latest"
          ? replaceLatestVisit(currentHistory, nextVisit)
          : [...currentHistory, nextVisit];
      const { data, error } = await supabase
        .from("group_restaurants")
        .update({ ...payload, visit_history: nextHistory })
        .eq("id", existingRecord.id)
        .eq("group_id", input.groupId)
        .select("*")
        .single();

      const normalized = data ? normalizeGroupRestaurant(data) : null;

      if (!error && normalized) {
        void trackGroupRestaurantAnalytics("group_restaurant_visit_updated", normalized, input.groupId, {
          history_mode: input.historyMode ?? "append",
        });
      }

      return { alreadyExists: false, data: normalized, error: normalizeSupabaseError(error) };
    }

    const { data, error } = await supabase
      .from("group_restaurants")
      .insert({ ...payload, visit_history: [nextVisit] })
      .select("*")
      .single();

    const normalized = data ? normalizeGroupRestaurant(data) : null;

    if (!error && normalized) {
      void trackGroupRestaurantAnalytics("group_restaurant_saved", normalized, input.groupId);
    }

    return { alreadyExists: false, data: normalized, error: normalizeSupabaseError(error) };
  } catch (error) {
    return { alreadyExists: false, data: null, error: normalizeSupabaseError(error) };
  }
}

export async function deleteGroupRestaurant(recordId: string, groupId: string) {
  if (!supabase) {
    return { error: new Error("Supabase no esta configurado.") };
  }

  try {
    const { data: existing } = await supabase
      .from("group_restaurants")
      .select("*")
      .eq("id", recordId)
      .eq("group_id", groupId)
      .maybeSingle();

    const { error } = await supabase.from("group_restaurants").delete().eq("id", recordId).eq("group_id", groupId);

    if (!error && existing) {
      void trackGroupRestaurantAnalytics("group_restaurant_deleted", normalizeGroupRestaurant(existing), groupId);
    }

    return { error: normalizeSupabaseError(error) };
  } catch (error) {
    return { error: normalizeSupabaseError(error) };
  }
}

async function withMemberCount(group: GroupSummary): Promise<GroupSummary> {
  if (!supabase) {
    return group;
  }

  const { count } = await supabase
    .from("group_members")
    .select("id", { count: "exact", head: true })
    .eq("group_id", group.id);

  return {
    ...group,
    member_count: count ?? group.member_count,
  };
}

function normalizeGroupSummary(value: unknown): GroupSummary {
  const group = Array.isArray(value) ? value[0] : value;
  const record = group as Partial<GroupSummary>;

  return {
    avatar_url: nullableString(record.avatar_url),
    created_at: String(record.created_at ?? ""),
    id: String(record.id ?? ""),
    member_count: Number(record.member_count ?? 0),
    name: String(record.name ?? "Grupo"),
    owner_id: String(record.owner_id ?? ""),
    updated_at: String(record.updated_at ?? ""),
  };
}

function normalizeGroupMember(value: unknown): GroupMember | null {
  const record = value as { profile?: unknown; role?: unknown };
  const profile = normalizeSocialProfile(record.profile);

  if (!profile) {
    return null;
  }

  return {
    ...profile,
    role: record.role === "owner" ? "owner" : "member",
  };
}

function normalizeSocialProfile(value: unknown): SocialProfile | null {
  const profile = Array.isArray(value) ? value[0] : value;

  if (!profile || typeof profile !== "object") {
    return null;
  }

  const record = profile as Partial<SocialProfile>;

  if (typeof record.id !== "string" || typeof record.username !== "string") {
    return null;
  }

  return {
    avatar_url: nullableString(record.avatar_url),
    display_name: nullableString(record.display_name),
    id: record.id,
    username: record.username,
  };
}

function dedupeProfiles(profiles: SocialProfile[]) {
  const seen = new Set<string>();

  return profiles.filter((profile) => {
    if (seen.has(profile.id)) {
      return false;
    }

    seen.add(profile.id);
    return true;
  });
}

async function trackGroupRestaurantAnalytics(
  eventName: string,
  record: SavedRestaurantRecord,
  groupId: string,
  metadata: Record<string, unknown> = {},
) {
  await trackAppEvent({
    entityId: record.google_place_id,
    entityType: "restaurant",
    eventName,
    metadata: {
      cuisine_types: record.cuisine_types,
      group_id: groupId,
      has_location: record.location_lat !== null && record.location_lng !== null,
      list_scope: "group",
      price_range: record.price_range,
      rating: record.food_rating,
      status: record.status,
      visibility: record.visibility,
      ...metadata,
    },
  });
}

function normalizeGroupRestaurant(value: unknown): SavedRestaurantRecord {
  const record = value as Partial<SavedRestaurantRecord> & { added_by?: unknown };

  return {
    id: String(record.id ?? ""),
    user_id: String(record.user_id ?? record.added_by ?? ""),
    google_place_id: String(record.google_place_id ?? ""),
    name: String(record.name ?? "Restaurante"),
    address: nullableString(record.address),
    phone: nullableString(record.phone),
    website: nullableString(record.website),
    google_types: stringArray(record.google_types),
    location_lat: nullableNumber(record.location_lat),
    location_lng: nullableNumber(record.location_lng),
    status: record.status === "visited" ? "visited" : "want_to_go",
    visibility: record.visibility === "public" ? "public" : "private",
    cuisine_types: stringArray(record.cuisine_types),
    dish_photos: photoArray(record.dish_photos),
    food_rating: clampRating(Number(record.food_rating ?? 0)),
    occasion_types: stringArray(record.occasion_types),
    local_photos: photoArray(record.local_photos),
    price_range: nullableString(record.price_range),
    service_comment: nullableString(record.service_comment),
    general_comment: nullableString(record.general_comment),
    saved_at: String(record.saved_at ?? ""),
    updated_at: String(record.updated_at ?? ""),
    visit_history: visitHistoryArray(record.visit_history),
  };
}

function buildVisitSnapshot(record: {
  cuisine_types: unknown;
  dish_photos: unknown;
  food_rating: number;
  general_comment: unknown;
  local_photos: unknown;
  occasion_types: unknown;
  price_range: unknown;
  saved_at: string;
  service_comment: unknown;
  visibility: SavedRestaurantVisibility;
}): RestaurantVisitSnapshot {
  return {
    cuisine_types: stringArray(record.cuisine_types),
    dish_photos: photoArray(record.dish_photos),
    food_rating: clampRating(Number(record.food_rating ?? 0)),
    general_comment: nullableString(record.general_comment),
    local_photos: photoArray(record.local_photos),
    occasion_types: stringArray(record.occasion_types),
    price_range: nullableString(record.price_range),
    saved_at: record.saved_at,
    service_comment: nullableString(record.service_comment),
    visibility: record.visibility === "public" ? "public" : "private",
  };
}

function replaceLatestVisit(history: RestaurantVisitSnapshot[], nextVisit: RestaurantVisitSnapshot) {
  if (history.length === 0) {
    return [nextVisit];
  }

  const latestIndex = history.reduce((latest, visit, index) => {
    const latestTime = new Date(history[latest]?.saved_at ?? "").getTime();
    const visitTime = new Date(visit.saved_at).getTime();

    return visitTime >= latestTime ? index : latest;
  }, 0);

  return history.map((visit, index) => (index === latestIndex ? nextVisit : visit));
}

function normalizeSupabaseError(error: unknown) {
  if (!error) {
    return null;
  }

  const message = error instanceof Error ? error.message : String((error as { message?: unknown }).message ?? error);
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("request header or cookie too large") ||
    normalizedMessage.includes("unexpected token '<'")
  ) {
    return new Error(
      "La sesion es demasiado grande porque Auth tiene una foto guardada en metadata. Cierra sesion y ejecuta la limpieza de avatar_url en auth.users.",
    );
  }

  if (normalizedMessage.includes("failed to fetch") || normalizedMessage.includes("networkerror")) {
    return new Error(
      "No se pudo conectar con Supabase. Revisa variables publicas, despliegue y certificados TLS si ocurre en Windows.",
    );
  }

  if (
    normalizedMessage.includes("group_members") ||
    normalizedMessage.includes("group_restaurants") ||
    normalizedMessage.includes("schema cache")
  ) {
    return new Error("Falta aplicar la migracion de grupos en Supabase. Aplica las migraciones y reinicia/refresca el proyecto.");
  }

  return error instanceof Error ? error : new Error(message);
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function photoArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const photo = item as Partial<RestaurantPhoto>;

      return {
        caption: typeof photo.caption === "string" ? photo.caption : "",
        dataUrl: typeof photo.dataUrl === "string" ? photo.dataUrl : undefined,
        fileName: typeof photo.fileName === "string" ? photo.fileName : undefined,
      };
    })
    .slice(0, 8);
}

function visitHistoryArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): RestaurantVisitSnapshot => {
      const visit = item as Partial<RestaurantVisitSnapshot>;

      return {
        cuisine_types: stringArray(visit.cuisine_types),
        dish_photos: photoArray(visit.dish_photos),
        food_rating: clampRating(Number(visit.food_rating ?? 0)),
        general_comment: nullableString(visit.general_comment),
        local_photos: photoArray(visit.local_photos),
        occasion_types: stringArray(visit.occasion_types),
        price_range: nullableString(visit.price_range),
        saved_at: String(visit.saved_at ?? ""),
        service_comment: nullableString(visit.service_comment),
        visibility: visit.visibility === "public" ? "public" : "private",
      };
    })
    .filter((visit) => Boolean(visit.saved_at))
    .slice(0, 30);
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function nullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clampRating(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(10, value));
}
