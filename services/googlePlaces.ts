import type { SavoryPlace } from "../types/place";

const FOOD_TYPE_LABELS: Record<string, string> = {
  restaurant: "Restaurante",
  cafe: "Cafetería",
  bar: "Bar",
  bakery: "Panadería",
  meal_takeaway: "Para llevar",
  meal_delivery: "Entrega a domicilio",
  food: "Comida",
  coffee_shop: "Café",
  ice_cream_shop: "Heladería",
  juice_shop: "Zumos",
  dessert_shop: "Postres",
  sandwich_shop: "Bocadillos",
  pizza_restaurant: "Pizza",
  sushi_restaurant: "Sushi",
  mexican_restaurant: "Mexicano",
  hamburger_restaurant: "Hamburguesas",
  steak_house: "Parrilla",
  wine_bar: "Vinos",
  brunch_restaurant: "Brunch",
  fast_food_restaurant: "Comida rápida",
};

const FOOD_TYPES = new Set(Object.keys(FOOD_TYPE_LABELS));

const FOOD_KEYWORDS = [
  "restaurant",
  "restaurante",
  "cafe",
  "café",
  "coffee",
  "bar",
  "bakery",
  "panader",
  "pasteler",
  "helader",
  "brunch",
  "tapas",
  "pizza",
  "pizzeria",
  "sushi",
  "burger",
  "hamburg",
  "mexican",
  "mexicano",
  "steak",
  "wine",
  "cocktail",
  "juice",
  "dessert",
  "delivery",
  "takeaway",
  "food",
  "comida",
];

export function getPlaceCategory(types: string[] = []): string | undefined {
  const primaryFoodType = types.find((type) => FOOD_TYPES.has(type));

  if (primaryFoodType) {
    return FOOD_TYPE_LABELS[primaryFoodType];
  }

  const readableType = types.find((type) => type !== "establishment");
  return readableType
    ? readableType
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")
    : undefined;
}

export function isFoodRelatedPlace(place: Pick<SavoryPlace, "name" | "address" | "types">): boolean {
  if (place.types.some((type) => FOOD_TYPES.has(type))) {
    return true;
  }

  const searchableText = `${place.name} ${place.address ?? ""}`.toLowerCase();
  return FOOD_KEYWORDS.some((keyword) => searchableText.includes(keyword));
}

export function getShortAddress(address?: string): string | undefined {
  if (!address) {
    return undefined;
  }

  return address
    .split(",")
    .slice(0, 2)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

export function normalizeAutocompletePrediction(
  prediction: google.maps.places.AutocompletePrediction,
): SavoryPlace {
  const types = prediction.types ?? [];
  const name = prediction.structured_formatting?.main_text || prediction.description;
  const address = getShortAddress(prediction.structured_formatting?.secondary_text);

  return {
    id: prediction.place_id,
    placeId: prediction.place_id,
    name,
    address,
    category: getPlaceCategory(types),
    types,
  };
}

export function placeFromDetails(
  details: google.maps.places.PlaceResult,
  fallback: SavoryPlace,
): SavoryPlace {
  const location = details.geometry?.location;
  const lat = location?.lat();
  const lng = location?.lng();
  const types = details.types ?? fallback.types;

  return {
    ...fallback,
    id: details.place_id ?? fallback.id,
    placeId: details.place_id ?? fallback.placeId,
    name: details.name ?? fallback.name,
    address: getShortAddress(details.formatted_address) ?? fallback.address,
    category: getPlaceCategory(types) ?? fallback.category,
    types,
    location:
      typeof lat === "number" && typeof lng === "number"
        ? {
            lat,
            lng,
          }
        : fallback.location,
  };
}
