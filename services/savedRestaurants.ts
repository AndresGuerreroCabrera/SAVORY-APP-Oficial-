import { supabase } from "./supabase";
import type { SavoryPlace } from "../types/place";
import type {
  RestaurantCommunitySummary,
  RestaurantPhoto,
  SavedRestaurantRecord,
  SavedRestaurantStatus,
  SavedRestaurantVisibility,
} from "../types/restaurant";

type SaveRestaurantInput = {
  place: SavoryPlace;
  status: SavedRestaurantStatus;
  userId: string;
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

export async function saveRestaurant(input: SaveRestaurantInput) {
  if (!supabase) {
    return { error: new Error("Supabase no está configurado.") };
  }

  const payload = {
    user_id: input.userId,
    google_place_id: input.place.placeId || input.place.id,
    name: input.place.name,
    address: input.place.address ?? null,
    phone: input.place.phone ?? null,
    website: input.place.website ?? null,
    google_types: input.place.types,
    location_lat: input.place.location?.lat ?? null,
    location_lng: input.place.location?.lng ?? null,
    status: input.status,
    visibility: input.visibility ?? "private",
    cuisine_types: input.cuisineTypes ?? [],
    dish_photos: input.dishPhotos ?? [],
    food_rating: input.foodRating ?? 0,
    occasion_types: input.occasionTypes ?? [],
    local_photos: input.localPhotos ?? [],
    price_range: input.priceRange ?? null,
    service_comment: input.serviceComment ?? null,
    general_comment: input.generalComment ?? null,
    saved_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("saved_restaurants")
    .upsert(payload, { onConflict: "user_id,google_place_id,status" });

  return { error };
}

export async function getCurrentUserSavedRestaurants(status: SavedRestaurantStatus) {
  if (!supabase) {
    return { data: [] as SavedRestaurantRecord[], error: new Error("Supabase no está configurado.") };
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !sessionData.session) {
    return { data: [] as SavedRestaurantRecord[], error: sessionError ?? new Error("Inicia sesión para ver tu lista.") };
  }

  const { data, error } = await supabase
    .from("saved_restaurants")
    .select("*")
    .eq("user_id", sessionData.session.user.id)
    .eq("status", status)
    .order("saved_at", { ascending: false });

  if (error) {
    return { data: [] as SavedRestaurantRecord[], error };
  }

  return { data: (data ?? []).map(normalizeSavedRestaurant), error: null };
}

export async function getCurrentUserSavedRestaurantPins() {
  if (!supabase) {
    return { data: [] as SavedRestaurantRecord[], error: new Error("Supabase no está configurado.") };
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !sessionData.session) {
    return { data: [] as SavedRestaurantRecord[], error: sessionError ?? new Error("Inicia sesión para ver tus pines.") };
  }

  const { data, error } = await supabase
    .from("saved_restaurants")
    .select("*")
    .eq("user_id", sessionData.session.user.id)
    .not("location_lat", "is", null)
    .not("location_lng", "is", null);

  if (error) {
    return { data: [] as SavedRestaurantRecord[], error };
  }

  return { data: (data ?? []).map(normalizeSavedRestaurant), error: null };
}

export async function getRestaurantCommunitySummary(googlePlaceId: string) {
  if (!supabase) {
    return emptyCommunitySummary();
  }

  const { data, error } = await supabase
    .from("saved_restaurants")
    .select("cuisine_types, food_rating, occasion_types, price_range")
    .eq("google_place_id", googlePlaceId)
    .eq("status", "visited")
    .eq("visibility", "public");

  if (error) {
    return emptyCommunitySummary();
  }

  return buildCommunitySummary(data ?? []);
}

export async function getCommunitySummaries(googlePlaceIds: string[]) {
  const uniquePlaceIds = Array.from(new Set(googlePlaceIds.filter(Boolean)));

  if (!supabase || uniquePlaceIds.length === 0) {
    return new Map<string, RestaurantCommunitySummary>();
  }

  const { data, error } = await supabase
    .from("saved_restaurants")
    .select("google_place_id, cuisine_types, food_rating, occasion_types, price_range")
    .in("google_place_id", uniquePlaceIds)
    .eq("status", "visited")
    .eq("visibility", "public");

  if (error) {
    return new Map<string, RestaurantCommunitySummary>();
  }

  const grouped = new Map<string, unknown[]>();

  for (const row of data ?? []) {
    const record = row as { google_place_id?: unknown };
    const placeId = typeof record.google_place_id === "string" ? record.google_place_id : "";

    if (!placeId) {
      continue;
    }

    grouped.set(placeId, [...(grouped.get(placeId) ?? []), row]);
  }

  return new Map(Array.from(grouped, ([placeId, rows]) => [placeId, buildCommunitySummary(rows)]));
}

function normalizeSavedRestaurant(value: unknown): SavedRestaurantRecord {
  const record = value as Partial<SavedRestaurantRecord>;

  return {
    id: String(record.id ?? ""),
    user_id: String(record.user_id ?? ""),
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
  };
}

function buildCommunitySummary(rows: unknown[]): RestaurantCommunitySummary {
  const ratings = rows
    .map((row) => Number((row as { food_rating?: unknown }).food_rating ?? 0))
    .filter((rating) => Number.isFinite(rating) && rating > 0)
    .sort((a, b) => a - b);
  const priceRanges = rows
    .map((row) => nullableString((row as { price_range?: unknown }).price_range))
    .filter((value): value is string => Boolean(value));
  const cuisineTypes = rows.flatMap((row) => stringArray((row as { cuisine_types?: unknown }).cuisine_types));
  const occasionTypes = rows.flatMap((row) => stringArray((row as { occasion_types?: unknown }).occasion_types));

  return {
    cuisineTypes: Array.from(new Set(cuisineTypes)).slice(0, 5),
    medianRating: getMedian(ratings),
    occasionTypes: Array.from(new Set(occasionTypes)).slice(0, 5),
    priceRangeMode: getMode(priceRanges),
    reviewCount: rows.length,
  };
}

function emptyCommunitySummary(): RestaurantCommunitySummary {
  return {
    cuisineTypes: [],
    medianRating: null,
    occasionTypes: [],
    priceRangeMode: null,
    reviewCount: 0,
  };
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
