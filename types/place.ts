export type PlaceLocation = {
  lat: number;
  lng: number;
};

export type SavoryPlace = {
  id: string;
  placeId: string;
  name: string;
  address?: string;
  category?: string;
  phone?: string;
  types: string[];
  website?: string;
  location?: PlaceLocation;
};
