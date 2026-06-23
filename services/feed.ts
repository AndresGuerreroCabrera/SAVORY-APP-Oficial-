import { getCurrentUserFriendsForGroups, type GroupSummary, type SocialProfile } from "./groups";
import { supabase } from "./supabase";
import type { SavedRestaurantRecord, SavedRestaurantStatus, SavedRestaurantVisibility } from "../types/restaurant";

export type FeedPostSource = "friend" | "group";

export type FeedGroup = Pick<GroupSummary, "avatar_url" | "id" | "name"> & {
  member_count: number;
};

export type RestaurantFeedPost = {
  addedBy: SocialProfile | null;
  author: SocialProfile | null;
  group: FeedGroup | null;
  id: string;
  members: SocialProfile[];
  restaurant: SavedRestaurantRecord;
  savedAt: string;
  source: FeedPostSource;
};

export async function getRestaurantFeed() {
  if (!supabase) {
    return { data: [] as RestaurantFeedPost[], error: new Error("Supabase no esta configurado.") };
  }

  try {
    const [{ data: friends, error: friendsError }, userResult] = await Promise.all([
      getCurrentUserFriendsForGroups(),
      supabase.auth.getUser(),
    ]);

    if (friendsError) {
      return { data: [] as RestaurantFeedPost[], error: friendsError };
    }

    if (userResult.error || !userResult.data.user) {
      return { data: [] as RestaurantFeedPost[], error: normalizeSupabaseError(userResult.error ?? new Error("No se pudo cargar tu sesion.")) };
    }

    const friendIds = friends.map((friend) => friend.id);

    if (friendIds.length === 0) {
      return { data: [] as RestaurantFeedPost[], error: null };
    }

    const friendPosts = await getFriendPosts(friends, friendIds);
    const groupPosts = await getGroupPosts(friendIds, userResult.data.user.id);
    const error = friendPosts.error ?? groupPosts.error;

    return {
      data: [...friendPosts.data, ...groupPosts.data].sort(
        (first, second) => new Date(second.savedAt).getTime() - new Date(first.savedAt).getTime(),
      ),
      error,
    };
  } catch (error) {
    return { data: [] as RestaurantFeedPost[], error: normalizeSupabaseError(error) };
  }
}

async function getFriendPosts(friends: SocialProfile[], friendIds: string[]) {
  const profileById = new Map(friends.map((friend) => [friend.id, friend]));
  const { data, error } = await supabase!
    .from("saved_restaurants")
    .select("*")
    .in("user_id", friendIds)
    .eq("status", "visited")
    .eq("visibility", "public")
    .order("saved_at", { ascending: false })
    .limit(80);

  if (error) {
    return { data: [] as RestaurantFeedPost[], error: normalizeSupabaseError(error) };
  }

  return {
    data: (data ?? []).map((row) => {
      const restaurant = normalizeRestaurant(row);
      const author = profileById.get(restaurant.user_id) ?? null;

      return {
        addedBy: author,
        author,
        group: null,
        id: `friend-${restaurant.id}`,
        members: [],
        restaurant,
        savedAt: restaurant.saved_at,
        source: "friend" as const,
      };
    }),
    error: null,
  };
}

async function getGroupPosts(friendIds: string[], currentUserId: string) {
  const { data: friendMemberships, error: membershipsError } = await supabase!
    .from("group_members")
    .select("group_id")
    .in("user_id", friendIds);

  if (membershipsError) {
    return { data: [] as RestaurantFeedPost[], error: normalizeSupabaseError(membershipsError) };
  }

  const groupIds = Array.from(
    new Set(
      (friendMemberships ?? [])
        .map((row) => String((row as { group_id?: unknown }).group_id ?? ""))
        .filter(Boolean),
    ),
  );

  if (groupIds.length === 0) {
    return { data: [] as RestaurantFeedPost[], error: null };
  }

  const { data: ownMemberships, error: ownMembershipsError } = await supabase!
    .from("group_members")
    .select("group_id")
    .eq("user_id", currentUserId)
    .in("group_id", groupIds);

  if (ownMembershipsError) {
    return { data: [] as RestaurantFeedPost[], error: normalizeSupabaseError(ownMembershipsError) };
  }

  const ownGroupIds = new Set(
    (ownMemberships ?? [])
      .map((row) => String((row as { group_id?: unknown }).group_id ?? ""))
      .filter(Boolean),
  );
  const visibleGroupIds = groupIds.filter((groupId) => !ownGroupIds.has(groupId));

  if (visibleGroupIds.length === 0) {
    return { data: [] as RestaurantFeedPost[], error: null };
  }

  const [restaurantsResult, membersResult] = await Promise.all([
    supabase!
      .from("group_restaurants")
      .select(
        "*, group:groups(id, name, avatar_url), added_by_profile:profiles!group_restaurants_added_by_fkey(id, username, display_name, avatar_url)",
      )
      .in("group_id", visibleGroupIds)
      .eq("status", "visited")
      .eq("visibility", "public")
      .order("saved_at", { ascending: false })
      .limit(80),
    supabase!
      .from("group_members")
      .select("group_id, profile:profiles(id, username, display_name, avatar_url)")
      .in("group_id", visibleGroupIds)
      .order("created_at", { ascending: true }),
  ]);

  if (restaurantsResult.error) {
    return { data: [] as RestaurantFeedPost[], error: normalizeSupabaseError(restaurantsResult.error) };
  }

  const membersByGroup = new Map<string, SocialProfile[]>();

  if (!membersResult.error) {
    for (const row of membersResult.data ?? []) {
      const record = row as { group_id?: unknown; profile?: unknown };
      const groupId = String(record.group_id ?? "");
      const profile = normalizeProfile(record.profile);

      if (!groupId || !profile) {
        continue;
      }

      membersByGroup.set(groupId, [...(membersByGroup.get(groupId) ?? []), profile]);
    }
  }

  return {
    data: (restaurantsResult.data ?? []).map((row) => {
      const record = row as { added_by_profile?: unknown; group?: unknown; group_id?: unknown };
      const restaurant = normalizeRestaurant(row);
      const groupId = String(record.group_id ?? "");
      const members = membersByGroup.get(groupId) ?? [];
      const group = normalizeGroup(record.group, groupId, members.length);
      const addedBy = normalizeProfile(record.added_by_profile);

      return {
        addedBy,
        author: null,
        group,
        id: `group-${restaurant.id}`,
        members,
        restaurant,
        savedAt: restaurant.saved_at,
        source: "group" as const,
      };
    }),
    error: membersResult.error ? normalizeSupabaseError(membersResult.error) : null,
  };
}

function normalizeGroup(value: unknown, fallbackId: string, memberCount: number): FeedGroup | null {
  const group = Array.isArray(value) ? value[0] : value;

  if (!group || typeof group !== "object") {
    return fallbackId ? { avatar_url: null, id: fallbackId, member_count: memberCount, name: "Grupo" } : null;
  }

  const record = group as Partial<GroupSummary>;

  return {
    avatar_url: nullableString(record.avatar_url),
    id: typeof record.id === "string" ? record.id : fallbackId,
    member_count: memberCount,
    name: typeof record.name === "string" && record.name.trim() ? record.name : "Grupo",
  };
}

function normalizeProfile(value: unknown): SocialProfile | null {
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

function normalizeRestaurant(value: unknown): SavedRestaurantRecord {
  const record = value as Partial<SavedRestaurantRecord> & { added_by?: unknown };

  return {
    address: nullableString(record.address),
    cuisine_types: stringArray(record.cuisine_types),
    dish_photos: photoArray(record.dish_photos),
    food_rating: clampRating(Number(record.food_rating ?? 0)),
    general_comment: nullableString(record.general_comment),
    google_place_id: String(record.google_place_id ?? ""),
    google_types: stringArray(record.google_types),
    id: String(record.id ?? ""),
    local_photos: photoArray(record.local_photos),
    location_lat: nullableNumber(record.location_lat),
    location_lng: nullableNumber(record.location_lng),
    name: String(record.name ?? "Restaurante"),
    occasion_types: stringArray(record.occasion_types),
    phone: nullableString(record.phone),
    price_range: nullableString(record.price_range),
    saved_at: String(record.saved_at ?? ""),
    service_comment: nullableString(record.service_comment),
    status: normalizeStatus(record.status),
    updated_at: String(record.updated_at ?? ""),
    user_id: String(record.user_id ?? record.added_by ?? ""),
    visibility: normalizeVisibility(record.visibility),
    visit_history: [],
    website: nullableString(record.website),
  };
}

function normalizeStatus(value: unknown): SavedRestaurantStatus {
  return value === "visited" ? "visited" : "want_to_go";
}

function normalizeVisibility(value: unknown): SavedRestaurantVisibility {
  return value === "public" ? "public" : "private";
}

function normalizeSupabaseError(error: unknown) {
  if (!error) {
    return null;
  }

  const message = error instanceof Error ? error.message : String((error as { message?: unknown }).message ?? error);
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("failed to fetch") || normalizedMessage.includes("networkerror")) {
    return new Error("No se pudo conectar con Supabase. Revisa la conexion y las variables publicas.");
  }

  if (
    normalizedMessage.includes("group_members") ||
    normalizedMessage.includes("group_restaurants") ||
    normalizedMessage.includes("schema cache")
  ) {
    return new Error("Falta aplicar la migracion del feed de grupos en Supabase.");
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
      const photo = item as { caption?: unknown; dataUrl?: unknown; fileName?: unknown };

      return {
        caption: typeof photo.caption === "string" ? photo.caption : "",
        dataUrl: typeof photo.dataUrl === "string" ? photo.dataUrl : undefined,
        fileName: typeof photo.fileName === "string" ? photo.fileName : undefined,
      };
    })
    .slice(0, 8);
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
