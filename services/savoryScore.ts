import { supabase } from "./supabase";

export type SavoryScoreProfile = {
  avatarUrl: string | null;
  displayName: string | null;
  exposureScore: number;
  level: SavoryScoreLevel;
  positiveScore: number;
  profileId: string;
  rank: number;
  score: number;
  usefulActions: number;
  username: string;
};

export type SavoryScoreLevel = {
  currentThreshold: number;
  levelNumber: number;
  name: string;
  nextThreshold: number | null;
  pointsToNext: number | null;
};

export type RestaurantScoreEventName =
  | "swipe_right"
  | "save_from_feed"
  | "save_from_profile"
  | "save_generic"
  | "add_to_shared_list"
  | "mark_visited"
  | "recommendation_impression"
  | "feed_impression"
  | "profile_view";

type RecordRestaurantScoreEventInput = {
  eventName: RestaurantScoreEventName;
  googlePlaceId: string;
  ownerUserIds: Array<string | null | undefined>;
  restaurantRecordId?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown>;
};

type RankingOptions = {
  limit?: number;
  query?: string;
};

export async function getCurrentUserSavoryScore(userId: string) {
  if (!supabase) {
    return { data: null as SavoryScoreProfile | null, error: new Error("Supabase no esta configurado.") };
  }

  try {
    const ranking = await getSavoryScoreRanking({ limit: 500 });

    if (ranking.error) {
      return { data: null, error: ranking.error };
    }

    return {
      data: ranking.data.find((profile) => profile.profileId === userId) ?? null,
      error: null,
    };
  } catch (error) {
    return { data: null, error: normalizeScoreError(error) };
  }
}

export async function getSavoryScoreRanking(options: RankingOptions = {}) {
  if (!supabase) {
    return { data: [] as SavoryScoreProfile[], error: new Error("Supabase no esta configurado.") };
  }

  const limit = Math.max(1, Math.min(options.limit ?? 20, 1000));
  const normalizedQuery = normalizeUsernameSearch(options.query ?? "");

  try {
    const { data, error } = await supabase
      .from("profile_savory_scores")
      .select("profile_id, score, positive_score, exposure_score, useful_actions, profile:profiles(id, username, display_name, avatar_url)")
      .order("score", { ascending: false })
      .order("positive_score", { ascending: false })
      .limit(limit);

    if (error) {
      return { data: [] as SavoryScoreProfile[], error: normalizeScoreError(error) };
    }

    return {
      data: (data ?? [])
        .map((row, index) => normalizeScoreProfile(row, index + 1))
        .filter((profile) => !normalizedQuery || profile?.username.toLowerCase().startsWith(normalizedQuery))
        .filter((profile): profile is SavoryScoreProfile => Boolean(profile)),
      error: null,
    };
  } catch (error) {
    return { data: [] as SavoryScoreProfile[], error: normalizeScoreError(error) };
  }
}

export async function recordRestaurantScoreEvent(input: RecordRestaurantScoreEventInput) {
  if (!supabase || !input.googlePlaceId) {
    return;
  }

  const ownerUserIds = Array.from(new Set(input.ownerUserIds.filter((id): id is string => Boolean(id))));

  if (ownerUserIds.length === 0) {
    return;
  }

  await Promise.all(
    ownerUserIds.map((ownerUserId) =>
      supabase!.rpc("record_restaurant_event", {
        p_event_name: input.eventName,
        p_google_place_id: input.googlePlaceId,
        p_metadata: sanitizeMetadata(input.metadata ?? {}),
        p_owner_user_id: ownerUserId,
        p_restaurant_record_id: input.restaurantRecordId ?? null,
        p_source: input.source ?? null,
      }),
    ),
  ).catch(() => {
    // Scoring must never interrupt product flows.
  });
}

export async function recordRestaurantScoreEventForPublicOwners(input: Omit<RecordRestaurantScoreEventInput, "ownerUserIds">) {
  if (!supabase || !input.googlePlaceId) {
    return;
  }

  try {
    const [personalOwners, groupOwners] = await Promise.all([
      supabase
        .from("saved_restaurants")
        .select("user_id")
        .eq("google_place_id", input.googlePlaceId)
        .eq("status", "visited")
        .eq("visibility", "public"),
      supabase
        .from("group_restaurants")
        .select("added_by")
        .eq("google_place_id", input.googlePlaceId)
        .eq("status", "visited")
        .eq("visibility", "public"),
    ]);

    const ownerUserIds = [
      ...(personalOwners.data ?? []).map((row) => String((row as { user_id?: unknown }).user_id ?? "")),
      ...(groupOwners.data ?? []).map((row) => String((row as { added_by?: unknown }).added_by ?? "")),
    ].filter(Boolean);

    await recordRestaurantScoreEvent({
      ...input,
      ownerUserIds,
    });
  } catch {
    // Scoring must never interrupt product flows.
  }
}

export function getSavoryScoreLevel(score: number): SavoryScoreLevel {
  const safeScore = Math.max(0, Math.floor(Number.isFinite(score) ? score : 0));
  let levelNumber = 1;

  while (safeScore >= getLevelThreshold(levelNumber + 1)) {
    levelNumber += 1;
  }

  const nextThreshold = getLevelThreshold(levelNumber + 1);

  return {
    currentThreshold: getLevelThreshold(levelNumber),
    levelNumber,
    name: getLevelName(levelNumber),
    nextThreshold,
    pointsToNext: Math.max(0, nextThreshold - safeScore),
  };
}

function getLevelThreshold(levelNumber: number) {
  const fixedThresholds: Record<number, number> = {
    1: 0,
    2: 20,
    3: 45,
    4: 70,
    5: 90,
  };

  return fixedThresholds[levelNumber] ?? 90 + (levelNumber - 5) * 50;
}

function getLevelName(levelNumber: number) {
  if (levelNumber === 1) {
    return "Explorador";
  }

  if (levelNumber === 2) {
    return "Recomendador";
  }

  if (levelNumber === 3) {
    return "Experto local";
  }

  if (levelNumber === 4) {
    return "Referente";
  }

  if (levelNumber === 5) {
    return "Top Savory";
  }

  return `Top Savory ${levelNumber - 4}`;
}

function normalizeScoreProfile(value: unknown, rank: number): SavoryScoreProfile | null {
  const row = value as {
    exposure_score?: unknown;
    positive_score?: unknown;
    profile?: unknown;
    profile_id?: unknown;
    score?: unknown;
    useful_actions?: unknown;
  };
  const profile = normalizeProfile(row.profile);

  if (!profile) {
    return null;
  }

  const score = Math.max(0, Math.round(Number(row.score ?? 0)));

  return {
    avatarUrl: profile.avatarUrl,
    displayName: profile.displayName,
    exposureScore: Number(row.exposure_score ?? 0),
    level: getSavoryScoreLevel(score),
    positiveScore: Number(row.positive_score ?? 0),
    profileId: typeof row.profile_id === "string" ? row.profile_id : profile.profileId,
    rank,
    score,
    usefulActions: Math.max(0, Math.round(Number(row.useful_actions ?? 0))),
    username: profile.username,
  };
}

function normalizeProfile(value: unknown) {
  const profile = Array.isArray(value) ? value[0] : value;

  if (!profile || typeof profile !== "object") {
    return null;
  }

  const record = profile as {
    avatar_url?: unknown;
    display_name?: unknown;
    id?: unknown;
    username?: unknown;
  };

  if (typeof record.id !== "string" || typeof record.username !== "string") {
    return null;
  }

  return {
    avatarUrl: typeof record.avatar_url === "string" ? record.avatar_url : null,
    displayName: typeof record.display_name === "string" ? record.display_name : null,
    profileId: record.id,
    username: record.username,
  };
}

function normalizeUsernameSearch(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 32);
}

function sanitizeMetadata(metadata: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key]) => !/password|token|secret|key|email|authorization/i.test(key))
      .slice(0, 16)
      .map(([key, value]) => [key.slice(0, 80), sanitizeMetadataValue(value)]),
  );
}

function sanitizeMetadataValue(value: unknown): unknown {
  if (value == null || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    return value.slice(0, 160);
  }

  if (Array.isArray(value)) {
    return value.slice(0, 8).map(sanitizeMetadataValue);
  }

  return null;
}

function normalizeScoreError(error: unknown) {
  if (!error) {
    return null;
  }

  const message = error instanceof Error ? error.message : String((error as { message?: unknown }).message ?? error);

  if (message.toLowerCase().includes("profile_savory_scores")) {
    return new Error("Falta aplicar la migracion de Savory Score en Supabase.");
  }

  return error instanceof Error ? error : new Error(message);
}
