export type SavedRestaurantStatus = "want_to_go" | "visited";

export type SavedRestaurantVisibility = "private" | "public";

export type RestaurantPhoto = {
  caption: string;
  dataUrl?: string;
  fileName?: string;
};

export type SavedRestaurantRecord = {
  id: string;
  user_id: string;
  google_place_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  google_types: string[];
  location_lat: number | null;
  location_lng: number | null;
  status: SavedRestaurantStatus;
  visibility: SavedRestaurantVisibility;
  cuisine_types: string[];
  dish_photos: RestaurantPhoto[];
  food_rating: number;
  occasion_types: string[];
  local_photos: RestaurantPhoto[];
  price_range: string | null;
  service_comment: string | null;
  general_comment: string | null;
  saved_at: string;
  updated_at: string;
};

export type RestaurantCommunitySummary = {
  cuisineTypes: string[];
  medianRating: number | null;
  occasionTypes: string[];
  priceRangeMode: string | null;
  reviewCount: number;
};

export type RestaurantFilters = {
  cuisineTypes: string[];
  occasionTypes: string[];
  priceRanges: string[];
};
