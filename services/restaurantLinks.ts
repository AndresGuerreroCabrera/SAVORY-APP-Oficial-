import { Linking } from "react-native";

type RestaurantLinkInput = {
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  name: string;
  placeId?: string | null;
};

export function getGoogleMapsUrl({ address, lat, lng, name, placeId }: RestaurantLinkInput) {
  const query = lat != null && lng != null ? `${lat},${lng}` : `${name} ${address ?? ""}`.trim();
  const params = new URLSearchParams({
    api: "1",
    query,
  });

  if (placeId) {
    params.set("query_place_id", placeId);
  }

  return `https://www.google.com/maps/search/?${params.toString()}`;
}

export function getPhoneUrl(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export function getWebsiteUrl(website: string) {
  if (/^https?:\/\//i.test(website)) {
    return website;
  }

  return `https://${website}`;
}

export function openExternalUrl(url: string) {
  void Linking.openURL(url);
}
