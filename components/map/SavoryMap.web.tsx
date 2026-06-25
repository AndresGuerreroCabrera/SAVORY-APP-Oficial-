import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { LocateFixed } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Keyboard, Pressable, StyleSheet, Text, View } from "react-native";

import { BottomNav } from "../navigation/BottomNav";
import { PlacesSearch } from "../search/PlacesSearch";
import { RestaurantSaveSheet } from "../restaurant/RestaurantSaveSheet";
import { SavoryIcon, type SavoryIconGlyph } from "../ui/SavoryIcon";
import { SlidingSegmentedControl } from "../ui/SlidingSegmentedControl";
import { SAVORY_MAP_STYLE } from "../../constants/mapStyle";
import { theme } from "../../constants/theme";
import { trackAppEvent } from "../../services/appAnalytics";
import {
  isFoodRelatedPlace,
  normalizeAutocompletePrediction,
  placeFromSearchResult,
  placeFromDetails,
} from "../../services/googlePlaces";
import { getCurrentUserGroupRestaurantPins, type GroupRestaurantPin } from "../../services/groups";
import { getGoogleMapsUrl, getPhoneUrl, getWebsiteUrl } from "../../services/restaurantLinks";
import { getCommunitySummaries, getCurrentUserSavedRestaurantPins } from "../../services/savedRestaurants";
import type { RestaurantCommunitySummary, SavedRestaurantRecord } from "../../types/restaurant";
import type { SavoryPlace } from "../../types/place";

const DEFAULT_CENTER = { lat: 40.4168, lng: -3.7038 };
const SEARCH_DEBOUNCE_MS = 260;
const MIN_SEARCH_LENGTH = 2;
const SEARCH_RADII_METERS = [1500, 5000, 15000, 50000] as const;
const MAX_SEARCH_RESULTS = 12;
const LocateIcon = LocateFixed as SavoryIconGlyph;
type SavedPinFilter = "all" | "visited" | "want_to_go" | "groups";
type MapRestaurantPin =
  | {
      kind: "personal";
      restaurant: SavedRestaurantRecord;
    }
  | {
      kind: "group";
      restaurant: GroupRestaurantPin;
    };

function dedupePlaces(places: SavoryPlace[]) {
  const seen = new Set<string>();

  return places.filter((place) => {
    const key = place.placeId || place.id;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function getDistanceMeters(from: google.maps.LatLngLiteral, to: google.maps.LatLngLiteral) {
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

function searchAutocomplete(
  autocomplete: google.maps.places.AutocompleteService,
  input: string,
): Promise<SavoryPlace[]> {
  return new Promise((resolve, reject) => {
    autocomplete.getPlacePredictions(
      {
        input,
        types: ["establishment"],
      },
      (
        predictions: google.maps.places.AutocompletePrediction[] | null,
        status: string,
      ) => {
        if (status === "ZERO_RESULTS") {
          resolve([]);
          return;
        }

        if (status !== "OK" || !predictions) {
          reject(new Error("autocomplete-unavailable"));
          return;
        }

        const normalized = predictions.map(normalizeAutocompletePrediction);
        const foodResults = normalized.filter(isFoodRelatedPlace);

        resolve((foodResults.length > 0 ? foodResults : normalized).slice(0, MAX_SEARCH_RESULTS));
      },
    );
  });
}

function searchPlacesNearUser(
  placesService: google.maps.places.PlacesService,
  input: string,
  center: google.maps.LatLngLiteral,
  radius: number,
): Promise<SavoryPlace[]> {
  return new Promise((resolve, reject) => {
    placesService.textSearch(
      {
        location: center,
        query: input,
        radius,
      },
      (places: google.maps.places.PlaceResult[] | null, status: string) => {
        if (status === "ZERO_RESULTS") {
          resolve([]);
          return;
        }

        if (status !== "OK" || !places) {
          reject(new Error("places-search-unavailable"));
          return;
        }

        const normalized = places.map(placeFromSearchResult);
        const nearbyResults = normalized.filter(
          (place) => place.location && getDistanceMeters(center, place.location) <= radius * 1.15,
        );
        const foodResults = nearbyResults.filter(isFoodRelatedPlace);

        resolve(foodResults.slice(0, MAX_SEARCH_RESULTS));
      },
    );
  });
}

const SAVED_PIN_COLOR = "#FF6B5F";

function createSavedPinIcon(color: string): google.maps.Symbol {
  return {
    anchor: new google.maps.Point(0, 0),
    fillColor: color,
    fillOpacity: 1,
    path: "M0 0 C-2.7-4.2-7-8.7-7-13.5 A7 7 0 1 1 7-13.5 C7-8.7 2.7-4.2 0 0 Z",
    scale: 1.55,
    strokeColor: theme.colors.white,
    strokeWeight: 2.2,
  };
}

function easeInOutCubic(value: number) {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function smoothPanTo(map: google.maps.Map, target: google.maps.LatLngLiteral, duration = 650) {
  const center = map.getCenter();

  if (!center) {
    map.panTo(target);
    return;
  }

  const start = { lat: center.lat(), lng: center.lng() };
  const startedAt = performance.now();

  const animate = (now: number) => {
    const progress = Math.min(1, (now - startedAt) / duration);
    const eased = easeInOutCubic(progress);

    map.setCenter({
      lat: start.lat + (target.lat - start.lat) * eased,
      lng: start.lng + (target.lng - start.lng) * eased,
    });

    if (progress < 1) {
      window.requestAnimationFrame(animate);
    }
  };

  window.requestAnimationFrame(animate);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export default function SavoryMap() {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  const viewportWidth = useViewportWidth();
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const savedMarkerRefs = useRef<google.maps.Marker[]>([]);
  const savedInfoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  const userAccuracyCircleRef = useRef<google.maps.Circle | null>(null);
  const autocompleteRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesRef = useRef<google.maps.places.PlacesService | null>(null);
  const searchRequestRef = useRef(0);

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SavoryPlace[]>([]);
  const [resultSummaries, setResultSummaries] = useState<Map<string, RestaurantCommunitySummary>>(new Map());
  const [searchResultsVisible, setSearchResultsVisible] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<SavoryPlace | null>(null);
  const [activeSheetPlace, setActiveSheetPlace] = useState<SavoryPlace | null>(null);
  const [savedPinFilter, setSavedPinFilter] = useState<SavedPinFilter>("all");
  const [savedPinsVersion, setSavedPinsVersion] = useState(0);
  const [userLocation, setUserLocation] = useState<google.maps.LatLngLiteral | null>(null);
  const overlayWidth = Math.max(280, viewportWidth - 36);
  const controlWidth = Math.min(overlayWidth, 430);
  const pinFilterWidth = controlWidth;

  useEffect(() => {
    let cancelled = false;

    async function loadMap() {
      if (!apiKey) {
        setMapError("Configura EXPO_PUBLIC_GOOGLE_MAPS_API_KEY para cargar Google Maps.");
        return;
      }

      if (!mapElementRef.current) {
        return;
      }

      try {
        setOptions({
          key: apiKey,
          libraries: ["places"],
          v: "weekly",
        });

        const [mapsLibrary, placesLibrary] = await Promise.all([
          importLibrary("maps"),
          importLibrary("places"),
        ]);

        if (cancelled || !mapElementRef.current) {
          return;
        }

        const map = new mapsLibrary.Map(mapElementRef.current, {
          backgroundColor: theme.colors.mapCanvas,
          center: DEFAULT_CENTER,
          clickableIcons: false,
          disableDefaultUI: true,
          gestureHandling: "greedy",
          keyboardShortcuts: false,
          mapTypeControl: false,
          maxZoom: 19,
          minZoom: 3,
          restriction: {
            latLngBounds: {
              east: 180,
              north: 85,
              south: -85,
              west: -180,
            },
            strictBounds: false,
          },
          styles: SAVORY_MAP_STYLE,
          zoom: 13,
        });

        mapRef.current = map;
        autocompleteRef.current = new placesLibrary.AutocompleteService();
        placesRef.current = new placesLibrary.PlacesService(map);
        setMapReady(true);
        setMapError(null);
      } catch {
        if (!cancelled) {
          setMapError("No se pudo cargar Google Maps. Revisa la clave y las APIs habilitadas.");
        }
      }
    }

    loadMap();

    return () => {
      cancelled = true;
      savedMarkerRefs.current.forEach((savedMarker) => savedMarker.setMap(null));
      userMarkerRef.current?.setMap(null);
      userAccuracyCircleRef.current?.setMap(null);
    };
  }, [apiKey]);

  const drawSavedRestaurantPins = useCallback((pins: MapRestaurantPin[]) => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    savedMarkerRefs.current.forEach((savedMarker) => savedMarker.setMap(null));
    savedMarkerRefs.current = [];

    if (!savedInfoWindowRef.current) {
      const infoWindowOptions: google.maps.InfoWindowOptions & { headerDisabled?: boolean } = {
        headerDisabled: true,
        maxWidth: 240,
        pixelOffset: new google.maps.Size(0, -8),
      };

      savedInfoWindowRef.current = new google.maps.InfoWindow(infoWindowOptions);
    }

    const visiblePins = pins.filter((pin) => {
      if (savedPinFilter === "all") {
        return true;
      }

      if (savedPinFilter === "groups") {
        return pin.kind === "group";
      }

      return pin.kind === "personal" && pin.restaurant.status === savedPinFilter;
    });

    for (const pin of visiblePins) {
      const { restaurant } = pin;

      if (restaurant.location_lat == null || restaurant.location_lng == null) {
        continue;
      }

      const position = {
        lat: restaurant.location_lat,
        lng: restaurant.location_lng,
      };
      const marker = new google.maps.Marker({
        icon: createSavedPinIcon(SAVED_PIN_COLOR),
        map,
        optimized: true,
        position,
        title: restaurant.name,
      });

      marker.addListener("click", () => {
        const mapsUrl = getGoogleMapsUrl({
          address: restaurant.address,
          lat: restaurant.location_lat,
          lng: restaurant.location_lng,
          name: restaurant.name,
          placeId: restaurant.google_place_id,
        });
        const phoneUrl = restaurant.phone ? getPhoneUrl(restaurant.phone) : null;
        const websiteUrl = restaurant.website ? getWebsiteUrl(restaurant.website) : null;
        const statusLabel = restaurant.status === "visited" ? "Visitado" : "Deseado";
        const visibilityLabel = restaurant.visibility === "public" ? "P&uacute;blico" : "Privado";
        const groupUrl = pin.kind === "group" ? `/group/${encodeURIComponent(pin.restaurant.group_id)}` : null;
        const listUrl =
          pin.kind === "group"
            ? `/group/${encodeURIComponent(pin.restaurant.group_id)}?status=${encodeURIComponent(
                restaurant.status,
              )}&openPlaceId=${encodeURIComponent(restaurant.google_place_id)}`
            : `/${restaurant.status === "visited" ? "list" : "wishlist"}?openPlaceId=${encodeURIComponent(
                restaurant.google_place_id,
              )}`;
        const listMeta =
          pin.kind === "group"
            ? `
              <div style="margin-top: 8px;">
                <span style="
                  color: #777B80;
                  display: block;
                  font-size: 11px;
                  font-weight: 850;
                  line-height: 14px;
                  text-transform: uppercase;
                ">Grupo</span>
                <a href="${groupUrl}" style="
                  color: #FF6B5F;
                  display: inline-block;
                  font-size: 12px;
                  font-weight: 850;
                  line-height: 16px;
                  max-width: 190px;
                  text-decoration: none;
                ">${escapeHtml(pin.restaurant.group_name)}</a>
              </div>
              <div style="
                color: #2C2E31;
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                margin-top: 8px;
              ">
                <span style="
                  background: #ECFDF3;
                  border: 1px solid #FFDAD5;
                  border-radius: 999px;
                  color: #2C2E31;
                  font-size: 11px;
                  font-weight: 850;
                  line-height: 14px;
                  padding: 4px 8px;
                ">${statusLabel}</span>
                <span style="
                  background: #FFF0EE;
                  border: 1px solid #FFDAD5;
                  border-radius: 999px;
                  color: #2C2E31;
                  font-size: 11px;
                  font-weight: 850;
                  line-height: 14px;
                  padding: 4px 8px;
                ">${visibilityLabel}</span>
              </div>
            `
            : `
              <div style="margin-top: 8px;">
                <span style="
                  color: #777B80;
                  display: block;
                  font-size: 11px;
                  font-weight: 850;
                  line-height: 14px;
                  text-transform: uppercase;
                ">Lista</span>
                <span style="
                  color: #FF6B5F;
                  display: inline-block;
                  font-size: 12px;
                  font-weight: 850;
                  line-height: 16px;
                  max-width: 190px;
                ">Lista personal</span>
              </div>
              <div style="
                color: #2C2E31;
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                margin-top: 8px;
              ">
                <span style="
                  background: #FFF0EE;
                  border: 1px solid #FFDAD5;
                  border-radius: 999px;
                  color: #2C2E31;
                  font-size: 11px;
                  font-weight: 850;
                  line-height: 14px;
                  padding: 4px 8px;
                ">${statusLabel}</span>
                <span style="
                  background: #FFF0EE;
                  border: 1px solid #FFDAD5;
                  border-radius: 999px;
                  color: #2C2E31;
                  font-size: 11px;
                  font-weight: 850;
                  line-height: 14px;
                  padding: 4px 8px;
                ">${visibilityLabel}</span>
              </div>
            `;
        const content = `
          <div style="
            box-sizing: border-box;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            max-width: 220px;
            padding: 2px 0;
          ">
            <a href="${listUrl}" style="
              color: #111214;
              display: block;
              font-size: 13px;
              font-weight: 850;
              line-height: 17px;
              margin-bottom: 7px;
              max-width: 200px;
              text-decoration: none;
            ">${escapeHtml(restaurant.name)}</a>
            ${
              restaurant.address
                ? `<a href="${mapsUrl}" target="_blank" rel="noreferrer" style="
                    color: #FF6B5F;
                    display: inline-block;
                    font-size: 12px;
                    font-weight: 800;
                    line-height: 16px;
                    max-width: 200px;
                    text-decoration: none;
                  ">${escapeHtml(restaurant.address)}</a>`
                : ""
            }
            ${
              phoneUrl || websiteUrl
                ? `<div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;">
                    ${
                      phoneUrl
                        ? `<a href="${phoneUrl}" style="
                            background: #FFFFFF;
                            border: 1px solid #E7E7E2;
                            border-radius: 999px;
                            color: #FF6B5F;
                            font-size: 12px;
                            font-weight: 850;
                            line-height: 16px;
                            padding: 5px 8px;
                            text-decoration: none;
                          ">${escapeHtml(restaurant.phone ?? "")}</a>`
                        : ""
                    }
                    ${
                      websiteUrl
                        ? `<a href="${websiteUrl}" target="_blank" rel="noreferrer" style="
                            background: #FFFFFF;
                            border: 1px solid #E7E7E2;
                            border-radius: 999px;
                            color: #FF6B5F;
                            font-size: 12px;
                            font-weight: 850;
                            line-height: 16px;
                            padding: 5px 8px;
                            text-decoration: none;
                          ">Web</a>`
                        : ""
                    }
                  </div>`
                : ""
            }
            ${listMeta}
          </div>
        `;

        savedInfoWindowRef.current?.setContent(content);
        savedInfoWindowRef.current?.open({ anchor: marker, map });
      });

      savedMarkerRefs.current.push(marker);
    }
  }, [savedPinFilter]);

  useEffect(() => {
    if (!mapReady) {
      return;
    }

    let active = true;

    async function loadSavedPins() {
      const [personalPins, groupPins] = await Promise.all([
        getCurrentUserSavedRestaurantPins(),
        getCurrentUserGroupRestaurantPins(),
      ]);

      if (active) {
        const mapPins: MapRestaurantPin[] = [
          ...(personalPins.error ? [] : personalPins.data.map((restaurant) => ({ kind: "personal" as const, restaurant }))),
          ...(groupPins.error ? [] : groupPins.data.map((restaurant) => ({ kind: "group" as const, restaurant }))),
        ];

        drawSavedRestaurantPins(mapPins);
      }
    }

    void loadSavedPins().catch(() => {
      if (active) {
        drawSavedRestaurantPins([]);
      }
    });

    return () => {
      active = false;
    };
  }, [drawSavedRestaurantPins, mapReady, savedPinsVersion]);

  const drawUserLocation = useCallback(
    (position: google.maps.LatLngLiteral, accuracy?: number, shouldCenter = false) => {
      if (!mapRef.current) {
        return;
      }

      if (!userMarkerRef.current) {
        userMarkerRef.current = new google.maps.Marker({
          clickable: false,
          icon: {
            fillColor: "#1A73E8",
            fillOpacity: 1,
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            strokeColor: theme.colors.white,
            strokeWeight: 3,
          },
          map: mapRef.current,
          optimized: true,
          position,
        });
      } else {
        userMarkerRef.current.setPosition(position);
        userMarkerRef.current.setMap(mapRef.current);
      }

      if (!userAccuracyCircleRef.current) {
        userAccuracyCircleRef.current = new google.maps.Circle({
          clickable: false,
          fillColor: "#1A73E8",
          fillOpacity: 0.12,
          map: mapRef.current,
          strokeColor: "#1A73E8",
          strokeOpacity: 0.28,
          strokeWeight: 1,
        });
      }

      userAccuracyCircleRef.current.setCenter(position);
      userAccuracyCircleRef.current.setRadius(Math.max(24, Math.min(accuracy ?? 80, 350)));

      if (shouldCenter) {
        smoothPanTo(mapRef.current, position);
        window.setTimeout(() => {
          mapRef.current?.setZoom(15);
        }, 420);
      }
    },
    [],
  );

  const requestUserLocation = useCallback(
    (shouldCenter = false): Promise<google.maps.LatLngLiteral | null> => {
      if (!navigator.geolocation) {
        setMapError("Tu navegador no permite usar la ubicación.");
        return Promise.resolve(null);
      }

      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          ({ coords }) => {
            const position = {
              lat: coords.latitude,
              lng: coords.longitude,
            };

            setUserLocation(position);
            drawUserLocation(position, coords.accuracy, shouldCenter);
            resolve(position);
          },
          () => {
            setMapError("No se pudo obtener tu ubicación. Revisa los permisos del navegador.");
            resolve(null);
          },
          {
            enableHighAccuracy: true,
            maximumAge: 30000,
            timeout: 10000,
          },
        );
      });
    },
    [drawUserLocation],
  );

  useEffect(() => {
    if (mapReady) {
      void requestUserLocation(true);
    }
  }, [mapReady, requestUserLocation]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map) {
      return;
    }

    const closeSavedInfoWindow = () => {
      savedInfoWindowRef.current?.close();
    };
    const clickListener = map.addListener("click", closeSavedInfoWindow);
    const dragListener = map.addListener("dragstart", closeSavedInfoWindow);

    return () => {
      clickListener.remove();
      dragListener.remove();
    };
  }, [mapReady]);

  const focusPlaceOnMap = useCallback((place: SavoryPlace) => {
    if (!place.location || !mapRef.current) {
      return;
    }

    const position = new google.maps.LatLng(place.location.lat, place.location.lng);

    mapRef.current.panTo(position);
    mapRef.current.setZoom(16);
  }, []);

  const handleQueryChange = useCallback(
    (text: string) => {
      setQuery(text);
      setSearchError(null);

      if (selectedPlace && text !== selectedPlace.name) {
        setSelectedPlace(null);
      }
    },
    [selectedPlace],
  );

  const runSearch = useCallback(async (input: string) => {
    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    const autocomplete = autocompleteRef.current;
    const placesService = placesRef.current;

    if (!autocomplete && !placesService) {
      setSearchError("La búsqueda todavía se está cargando.");
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    try {
      let nextResults: SavoryPlace[] = [];
      const searchCenter = userLocation ?? (await requestUserLocation(false));

      if (searchRequestRef.current !== requestId) {
        return;
      }

      if (placesService && searchCenter) {
        for (const radius of SEARCH_RADII_METERS) {
          const radiusResults = await searchPlacesNearUser(placesService, input, searchCenter, radius);

          nextResults = dedupePlaces(radiusResults);

          if (nextResults.length > 0) {
            break;
          }
        }
      }

      if (nextResults.length === 0 && autocomplete) {
        nextResults = dedupePlaces(await searchAutocomplete(autocomplete, input));
      }

      if (searchRequestRef.current !== requestId) {
        return;
      }

      setResults(nextResults);
      const nextSummaries = await getCommunitySummaries(nextResults.map((place) => place.placeId || place.id));

      if (searchRequestRef.current !== requestId) {
        return;
      }

      setResultSummaries(nextSummaries);
      void trackAppEvent({
        eventName: "restaurant_searched",
        metadata: {
          has_user_location: Boolean(searchCenter),
          query_length: input.trim().length,
          result_count: nextResults.length,
          source: "map",
        },
        route: "/",
      });
      setSearchError(nextResults.length > 0 ? null : "No se encontraron sitios de comida o bebida.");
    } catch {
      if (searchRequestRef.current === requestId) {
        setResults([]);
        setResultSummaries(new Map());
        void trackAppEvent({
          eventName: "restaurant_search_failed",
          metadata: {
            query_length: input.trim().length,
            source: "map",
          },
          route: "/",
        });
        setSearchError("La búsqueda no está disponible ahora mismo.");
      }
    } finally {
      if (searchRequestRef.current === requestId) {
        setIsSearching(false);
      }
    }
  }, [requestUserLocation, userLocation]);

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (trimmedQuery.length < MIN_SEARCH_LENGTH || selectedPlace?.name === trimmedQuery) {
      setResults([]);
      setResultSummaries(new Map());
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    if (!mapReady) {
      return;
    }

    const timeout = window.setTimeout(() => {
      runSearch(trimmedQuery);
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [mapReady, query, runSearch, selectedPlace]);

  const handleSelectPlace = useCallback(
    (place: SavoryPlace) => {
      const detailsService = placesRef.current;

      Keyboard.dismiss();
      setQuery(place.name);
      setResults([]);
      setResultSummaries(new Map());
      setSearchError(null);

      if (!detailsService || !place.placeId) {
        void trackAppEvent({
          entityId: place.placeId || place.id,
          entityType: "restaurant",
          eventName: "restaurant_viewed",
          metadata: {
            source: "map_search",
            types: place.types,
          },
          route: "/",
        });
        setSelectedPlace(place);
        setActiveSheetPlace(place);
        focusPlaceOnMap(place);
        return;
      }

      setIsSearching(true);
      detailsService.getDetails(
        {
          fields: [
            "formatted_address",
            "formatted_phone_number",
            "geometry",
            "international_phone_number",
            "name",
            "place_id",
            "types",
            "website",
          ],
          placeId: place.placeId,
        },
        (
          details: google.maps.places.PlaceResult | null,
          status: string,
        ) => {
          setIsSearching(false);

          if (status !== "OK" || !details) {
            void trackAppEvent({
              entityId: place.placeId || place.id,
              entityType: "restaurant",
              eventName: "restaurant_viewed",
              metadata: {
                source: "map_search",
                types: place.types,
              },
              route: "/",
            });
            setSelectedPlace(place);
            setActiveSheetPlace(place);
            focusPlaceOnMap(place);
            return;
          }

          const detailedPlace = placeFromDetails(details, place);

          void trackAppEvent({
            entityId: detailedPlace.placeId || detailedPlace.id,
            entityType: "restaurant",
            eventName: "restaurant_viewed",
            metadata: {
              has_phone: Boolean(detailedPlace.phone),
              has_website: Boolean(detailedPlace.website),
              source: "map_search",
              types: detailedPlace.types,
            },
            route: "/",
          });
          setSelectedPlace(detailedPlace);
          setActiveSheetPlace(detailedPlace);
          focusPlaceOnMap(detailedPlace);
        },
      );
    },
    [focusPlaceOnMap],
  );

  return (
    <View style={styles.container}>
      <div ref={mapElementRef} style={mapCanvasStyle} />

      {mapError ? (
        <View pointerEvents="none" style={styles.mapNotice}>
          <Text style={styles.mapNoticeText}>{mapError}</Text>
        </View>
      ) : null}

      <View pointerEvents="box-none" style={styles.topOverlay}>
        <PlacesSearch
          error={searchError}
          loading={isSearching}
          onChangeText={handleQueryChange}
          onDropdownVisibleChange={setSearchResultsVisible}
          onSelectPlace={handleSelectPlace}
          results={results}
          resultSummaries={resultSummaries}
          value={query}
          width={controlWidth}
        />
        {searchResultsVisible ? null : (
          <SlidingSegmentedControl
            onChange={setSavedPinFilter}
            options={[
              { label: "Todos", value: "all" },
              { label: "Visitados", value: "visited" },
              { label: "Deseados", value: "want_to_go" },
              { label: "Grupos", value: "groups" },
            ]}
            style={[styles.pinFilter, { width: pinFilterWidth }]}
            textStyle={styles.pinFilterButtonText}
            value={savedPinFilter}
          />
        )}
      </View>

      <View pointerEvents="box-none" style={styles.bottomOverlay}>
        <View style={[styles.locationButtonRow, { width: controlWidth }]}>
          <Pressable
            accessibilityLabel="Centrar mi ubicacion"
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => {
              void requestUserLocation(true);
            }}
            style={({ pressed }) => [styles.locationButton, pressed && styles.locationButtonPressed]}
          >
            <SavoryIcon color={theme.colors.text} glyph={LocateIcon} size={21} strokeWidth={2.3} />
          </Pressable>
        </View>
        <BottomNav width={controlWidth} />
      </View>

      {activeSheetPlace ? (
        <RestaurantSaveSheet
          onClose={() => setActiveSheetPlace(null)}
          onSaved={() => setSavedPinsVersion((version) => version + 1)}
          place={activeSheetPlace}
          width={Math.min(overlayWidth, 560)}
        />
      ) : null}
    </View>
  );
}

function useViewportWidth() {
  const [width, setWidth] = useState(390);

  useEffect(() => {
    const updateWidth = () => setWidth(window.innerWidth || 390);

    updateWidth();
    window.addEventListener("resize", updateWidth);

    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  return width;
}

const mapCanvasStyle: CSSProperties = {
  background: theme.colors.mapCanvas,
  bottom: 0,
  left: 0,
  position: "absolute",
  right: 0,
  top: 0,
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.mapCanvas,
    flex: 1,
    overflow: "hidden",
  },
  topOverlay: {
    alignItems: "center",
    gap: 9,
    left: 0,
    paddingHorizontal: 18,
    paddingTop: 18,
    position: "absolute",
    right: 0,
    top: 0,
  },
  pinFilter: {
    backgroundColor: theme.colors.surfaceGlass,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    minWidth: 340,
    padding: 4,
    shadowColor: "#111214",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
  },
  pinFilterButtonText: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 16,
  },
  bottomOverlay: {
    alignItems: "center",
    bottom: 22,
    gap: 10,
    left: 18,
    position: "absolute",
    right: 18,
  },
  locationButtonRow: {
    alignItems: "flex-end",
  },
  locationButton: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceGlass,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    width: 48,
    shadowColor: "#111214",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 10,
  },
  locationButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
  mapNotice: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceGlass,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    left: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    position: "absolute",
    right: 24,
    top: 88,
  },
  mapNoticeText: {
    color: theme.colors.textSoft,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 19,
    textAlign: "center",
  },
});
