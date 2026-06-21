export type SavedRestaurantStatus = "want_to_go" | "visited";

export type SavedRestaurantVisibility = "private" | "public";

export type RestaurantPhoto = {
  caption: string;
  dataUrl?: string;
  fileName?: string;
};

export type RestaurantVisitSnapshot = {
  cuisine_types: string[];
  dish_photos: RestaurantPhoto[];
  food_rating: number;
  general_comment: string | null;
  local_photos: RestaurantPhoto[];
  occasion_types: string[];
  price_range: string | null;
  saved_at: string;
  service_comment: string | null;
  visibility: SavedRestaurantVisibility;
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
  visit_history: RestaurantVisitSnapshot[];
};

export type RestaurantCommunitySummary = {
  cuisineTypes: string[];
  medianRating: number | null;
  occasionTypes: string[];
  priceRangeMode: string | null;
  reviewCount: number;
};

export type RestaurantCommunityVisitor = {
  avatarUrl: string | null;
  displayName: string | null;
  lastVisitedAt: string;
  userId: string;
  username: string;
};

export type RestaurantFilters = {
  cuisineTypes: string[];
  occasionTypes: string[];
  priceRanges: string[];
  visibilities: SavedRestaurantVisibility[];
};
