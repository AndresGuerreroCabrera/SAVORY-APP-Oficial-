import { getCurrentUserSavedRestaurants, saveRestaurant } from "./savedRestaurants";
import { supabase } from "./supabase";
import type { SavoryPlace } from "../types/place";
import type {
  RestaurantFilters,
  RestaurantPhoto,
  RestaurantRecommendation,
  RestaurantRecommendationComment,
  RestaurantCommunityVisitor,
  SavedRestaurantRecord,
} from "../types/restaurant";

export type RecommendationLocationFilter = {
  label: string;
  lat: number;
  lng: number;
} | null;

type RecommendationSourceRow = {
  address: string | null;
  cuisine_types: string[] | null;
  dish_photos: RestaurantPhoto[] | null;
  food_rating: number | null;
  general_comment: string | null;
  google_place_id: string;
  google_types: string[] | null;
  local_photos: RestaurantPhoto[] | null;
  location_lat: number | null;
  location_lng: number | null;
  name: string;
  occasion_types: string[] | null;
  phone: string | null;
  price_range: string | null;
  profile?: unknown;
  saved_at: string;
  user_id?: string;
  website: string | null;
};

type UserTasteProfile = {
  cuisineWeights: Map<string, number>;
  occasionWeights: Map<string, number>;
  priceWeights: Map<string, number>;
};

export async function getRestaurantRecommendations(input: {
  filters: RestaurantFilters;
  locationFilter: RecommendationLocationFilter;
}) {
  if (!supabase) {
    return { data: [] as RestaurantRecommendation[], error: new Error("Supabase no esta configurado.") };
  }

  try {
    const [personalResult, groupResult, visitedResult, desiredResult] = await Promise.all([
      getPublicPersonalRestaurants(),
      getPublicGroupRestaurants(),
      getCurrentUserSavedRestaurants("visited"),
      getCurrentUserSavedRestaurants("want_to_go"),
    ]);

    if (personalResult.error || groupResult.error) {
      return {
        data: [] as RestaurantRecommendation[],
        error: personalResult.error ?? groupResult.error ?? new Error("No se pudieron cargar recomendaciones."),
      };
    }

    const visited = visitedResult.error ? [] : visitedResult.data;
    const desired = desiredResult.error ? [] : desiredResult.data;
    const blockedPlaceIds = new Set([...visited, ...desired].map((record) => record.google_place_id));
    const tasteProfile = buildUserTasteProfile(visited);
    const recommendations = aggregateRecommendations([...personalResult.data, ...groupResult.data])
      .filter((recommendation) => !blockedPlaceIds.has(recommendation.googlePlaceId))
      .filter((recommendation) => matchesRecommendationFilters(recommendation, input.filters))
      .map((recommendation) => ({
        ...recommendation,
        score: scoreRecommendation(recommendation, tasteProfile, input.locationFilter),
      }))
      .sort((a, b) => b.score - a.score);

    return { data: recommendations, error: null };
  } catch (error) {
    return { data: [] as RestaurantRecommendation[], error: normalizeError(error) };
  }
}

export async function saveRecommendationToWishlist(recommendation: RestaurantRecommendation) {
  if (!supabase) {
    return { alreadyExists: false, error: new Error("Supabase no esta configurado.") };
  }

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !sessionData.session) {
      return { alreadyExists: false, error: normalizeError(sessionError) ?? new Error("Inicia sesion para guardar deseados.") };
    }

    const place = recommendationToPlace(recommendation);
    const { alreadyExists, error } = await saveRestaurant({
      place,
      status: "want_to_go",
      userId: sessionData.session.user.id,
      visibility: "private",
    });

    return { alreadyExists, error };
  } catch (error) {
    return { alreadyExists: false, error: normalizeError(error) };
  }
}

function recommendationToPlace(recommendation: RestaurantRecommendation): SavoryPlace {
  return {
    address: recommendation.address ?? undefined,
    id: recommendation.googlePlaceId,
    location:
      recommendation.locationLat != null && recommendation.locationLng != null
        ? { lat: recommendation.locationLat, lng: recommendation.locationLng }
        : undefined,
    name: recommendation.name,
    phone: recommendation.phone ?? undefined,
    placeId: recommendation.googlePlaceId,
    types: recommendation.googleTypes,
    website: recommendation.website ?? undefined,
  };
}

async function getPublicPersonalRestaurants() {
  const { data, error } = await supabase!
    .from("saved_restaurants")
    .select(
      "google_place_id, name, address, phone, website, google_types, location_lat, location_lng, cuisine_types, dish_photos, food_rating, occasion_types, local_photos, price_range, general_comment, saved_at, user_id, profile:profiles(id, username, display_name, avatar_url)",
    )
    .eq("status", "visited")
    .eq("visibility", "public")
    .order("saved_at", { ascending: false });

  return {
    data: (data ?? []).map((row) => normalizeSourceRow(row)),
    error: normalizeError(error),
  };
}

async function getPublicGroupRestaurants() {
  const { data, error } = await supabase!
    .from("group_restaurants")
    .select(
      "google_place_id, name, address, phone, website, google_types, location_lat, location_lng, cuisine_types, dish_photos, food_rating, occasion_types, local_photos, price_range, general_comment, saved_at, added_by, profile:profiles!group_restaurants_added_by_fkey(id, username, display_name, avatar_url)",
    )
    .eq("status", "visited")
    .eq("visibility", "public")
    .order("saved_at", { ascending: false });

  return {
    data: (data ?? []).map((row) =>
      normalizeSourceRow({
        ...(row as Record<string, unknown>),
        user_id: (row as { added_by?: unknown }).added_by,
      }),
    ),
    error: normalizeError(error),
  };
}

function aggregateRecommendations(rows: RecommendationSourceRow[]) {
  const grouped = new Map<string, RecommendationSourceRow[]>();

  for (const row of rows) {
    if (!row.google_place_id) {
      continue;
    }

    grouped.set(row.google_place_id, [...(grouped.get(row.google_place_id) ?? []), row]);
  }

  return Array.from(grouped, ([placeId, placeRows]) => buildRecommendation(placeId, placeRows));
}

function buildRecommendation(placeId: string, rows: RecommendationSourceRow[]): RestaurantRecommendation {
  const orderedRows = [...rows].sort((a, b) => new Date(b.saved_at).getTime() - new Date(a.saved_at).getTime());
  const latest = orderedRows[0];
  const ratings = orderedRows
    .map((row) => Number(row.food_rating ?? 0))
    .filter((rating) => Number.isFinite(rating) && rating > 0)
    .sort((a, b) => a - b);
  const visitors = dedupeVisitors(orderedRows.map((row) => normalizeVisitor(row.profile, row.user_id, row.saved_at)).filter(Boolean));
  const generalComments = orderedRows
    .map((row) => {
      const visitor = normalizeVisitor(row.profile, row.user_id, row.saved_at);
      const comment = row.general_comment?.trim();

      if (!visitor || !comment) {
        return null;
      }

      return {
        comment,
        savedAt: row.saved_at,
        user: visitor,
      };
    })
    .filter((comment): comment is RestaurantRecommendationComment => Boolean(comment));

  return {
    address: latest.address,
    cuisineTags: topTags(orderedRows.flatMap((row) => stringArray(row.cuisine_types)), 3),
    dishPhotos: latestPhotos(orderedRows.flatMap((row) => photoArray(row.dish_photos)), 8),
    generalComments,
    googlePlaceId: placeId,
    googleTypes: stringArray(latest.google_types),
    lastGeneralComment: generalComments[0] ?? null,
    localPhotos: latestPhotos(orderedRows.flatMap((row) => photoArray(row.local_photos)), 8),
    locationLat: latest.location_lat,
    locationLng: latest.location_lng,
    medianRating: getMedian(ratings),
    name: latest.name,
    occasionTags: topTags(orderedRows.flatMap((row) => stringArray(row.occasion_types)), 3),
    ownerUserIds: Array.from(new Set(orderedRows.map((row) => row.user_id).filter((id): id is string => Boolean(id)))),
    phone: latest.phone,
    priceRangeMode: getMode(orderedRows.map((row) => row.price_range).filter((value): value is string => Boolean(value))),
    reviewCount: rows.length,
    score: 0,
    visitors,
    website: latest.website,
  };
}

function buildUserTasteProfile(records: SavedRestaurantRecord[]): UserTasteProfile {
  const cuisineWeights = new Map<string, number>();
  const occasionWeights = new Map<string, number>();
  const priceWeights = new Map<string, number>();

  for (const record of records) {
    const weight = Math.max(0.15, record.food_rating / 10 || 0.35);

    for (const cuisine of record.cuisine_types) {
      cuisineWeights.set(cuisine, (cuisineWeights.get(cuisine) ?? 0) + weight);
    }

    for (const occasion of record.occasion_types) {
      occasionWeights.set(occasion, (occasionWeights.get(occasion) ?? 0) + weight);
    }

    if (record.price_range) {
      priceWeights.set(record.price_range, (priceWeights.get(record.price_range) ?? 0) + weight);
    }
  }

  return {
    cuisineWeights: normalizeWeightMap(cuisineWeights),
    occasionWeights: normalizeWeightMap(occasionWeights),
    priceWeights: normalizeWeightMap(priceWeights),
  };
}

function scoreRecommendation(
  recommendation: RestaurantRecommendation,
  tasteProfile: UserTasteProfile,
  locationFilter: RecommendationLocationFilter,
) {
  const ratingScore = recommendation.medianRating ? recommendation.medianRating / 10 : 0.45;
  const popularityScore = Math.min(1, Math.log1p(recommendation.reviewCount) / Math.log1p(12));
  const proximityScore = getProximityScore(recommendation, locationFilter);
  const tasteScore =
    averageWeight(recommendation.cuisineTags, tasteProfile.cuisineWeights) * 0.48 +
    averageWeight(recommendation.occasionTags, tasteProfile.occasionWeights) * 0.34 +
    (recommendation.priceRangeMode ? (tasteProfile.priceWeights.get(recommendation.priceRangeMode) ?? 0) : 0) * 0.18;
  const discoveryScore = deterministicNoise(recommendation.googlePlaceId);

  return (
    proximityScore * 0.28 +
    ratingScore * 0.18 +
    popularityScore * 0.16 +
    tasteScore * 0.2 +
    discoveryScore * 0.18
  );
}

function getProximityScore(recommendation: RestaurantRecommendation, locationFilter: RecommendationLocationFilter) {
  if (!locationFilter || recommendation.locationLat == null || recommendation.locationLng == null) {
    return 0.5;
  }

  const distanceKm =
    getDistanceMeters(
      { lat: locationFilter.lat, lng: locationFilter.lng },
      { lat: recommendation.locationLat, lng: recommendation.locationLng },
    ) / 1000;

  return Math.max(0, 1 - Math.min(distanceKm, 80) / 80);
}

function matchesRecommendationFilters(recommendation: RestaurantRecommendation, filters: RestaurantFilters) {
  return (
    overlapsFilter(recommendation.cuisineTags, filters.cuisineTypes) &&
    overlapsFilter(recommendation.occasionTags, filters.occasionTypes) &&
    (filters.priceRanges.length === 0 ||
      (recommendation.priceRangeMode ? filters.priceRanges.includes(recommendation.priceRangeMode) : false))
  );
}

function normalizeWeightMap(map: Map<string, number>) {
  const max = Math.max(0, ...map.values());

  if (max === 0) {
    return map;
  }

  return new Map(Array.from(map, ([key, value]) => [key, value / max]));
}

function averageWeight(values: string[], map: Map<string, number>) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + (map.get(value) ?? 0), 0) / values.length;
}

function normalizeSourceRow(value: unknown): RecommendationSourceRow {
  const row = value as Partial<RecommendationSourceRow> & { added_by?: unknown };

  return {
    address: nullableString(row.address),
    cuisine_types: stringArray(row.cuisine_types),
    dish_photos: photoArray(row.dish_photos),
    food_rating: nullableNumber(row.food_rating),
    general_comment: nullableString(row.general_comment),
    google_place_id: String(row.google_place_id ?? ""),
    google_types: stringArray(row.google_types),
    local_photos: photoArray(row.local_photos),
    location_lat: nullableNumber(row.location_lat),
    location_lng: nullableNumber(row.location_lng),
    name: String(row.name ?? "Restaurante"),
    occasion_types: stringArray(row.occasion_types),
    phone: nullableString(row.phone),
    price_range: nullableString(row.price_range),
    profile: row.profile,
    saved_at: String(row.saved_at ?? ""),
    user_id: typeof row.user_id === "string" ? row.user_id : typeof row.added_by === "string" ? row.added_by : undefined,
    website: nullableString(row.website),
  };
}

function normalizeVisitor(profileValue: unknown, userIdValue: unknown, savedAtValue: unknown): RestaurantCommunityVisitor | null {
  const profile = Array.isArray(profileValue) ? profileValue[0] : profileValue;
  const record = profile as Partial<{
    avatar_url: unknown;
    display_name: unknown;
    id: unknown;
    username: unknown;
  }>;
  const userId = typeof record.id === "string" ? record.id : typeof userIdValue === "string" ? userIdValue : "";
  const username = typeof record.username === "string" ? record.username : "";

  if (!userId || !username) {
    return null;
  }

  return {
    avatarUrl: nullableString(record.avatar_url),
    displayName: nullableString(record.display_name),
    lastVisitedAt: typeof savedAtValue === "string" ? savedAtValue : "",
    userId,
    username,
  };
}

function dedupeVisitors(visitors: Array<RestaurantCommunityVisitor | null>) {
  const seen = new Set<string>();
  const result: RestaurantCommunityVisitor[] = [];

  for (const visitor of visitors) {
    if (!visitor || seen.has(visitor.userId)) {
      continue;
    }

    seen.add(visitor.userId);
    result.push(visitor);
  }

  return result;
}

function topTags(values: string[], limit: number) {
  const counts = values.reduce<Record<string, number>>((accumulator, value) => {
    accumulator[value] = (accumulator[value] ?? 0) + 1;
    return accumulator;
  }, {});

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value]) => value);
}

function latestPhotos(photos: RestaurantPhoto[], limit: number) {
  return photos.filter((photo) => Boolean(photo.dataUrl)).slice(0, limit);
}

function getMedian(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  const middle = Math.floor(values.length / 2);

  if (values.length % 2 === 1) {
    return values[middle];
  }

  return Math.round(((values[middle - 1] + values[middle]) / 2) * 10) / 10;
}

function getMode(values: string[]) {
  if (values.length === 0) {
    return null;
  }

  const counts = values.reduce<Record<string, number>>((accumulator, value) => {
    accumulator[value] = (accumulator[value] ?? 0) + 1;
    return accumulator;
  }, {});

  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function overlapsFilter(values: string[], selectedValues: string[]) {
  if (selectedValues.length === 0) {
    return true;
  }

  return values.some((value) => selectedValues.includes(value));
}

function getDistanceMeters(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const earthRadiusMeters = 6371000;
  const fromLat = (from.lat * Math.PI) / 180;
  const toLat = (to.lat * Math.PI) / 180;
  const deltaLat = ((to.lat - from.lat) * Math.PI) / 180;
  const deltaLng = ((to.lng - from.lng) * Math.PI) / 180;
  const haversine =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function deterministicNoise(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 9973;
  }

  return hash / 9973;
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
    .filter((photo) => Boolean(photo.dataUrl || photo.caption || photo.fileName));
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function nullableNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeError(error: unknown) {
  if (!error) {
    return null;
  }

  const message = error instanceof Error ? error.message : String((error as { message?: unknown }).message ?? error);
  return error instanceof Error ? error : new Error(message);
}
