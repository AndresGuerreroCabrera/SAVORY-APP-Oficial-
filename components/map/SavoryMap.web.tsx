import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { LocateFixed } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Keyboard, Pressable, StyleSheet, Text, View } from "react-native";

import { BottomNav } from "../navigation/BottomNav";
import { PlacesSearch } from "../search/PlacesSearch";
import { SavoryIcon, type SavoryIconGlyph } from "../ui/SavoryIcon";
import { SAVORY_MAP_STYLE } from "../../constants/mapStyle";
import { theme } from "../../constants/theme";
import {
  isFoodRelatedPlace,
  normalizeAutocompletePrediction,
  placeFromSearchResult,
  placeFromDetails,
} from "../../services/googlePlaces";
import type { SavoryPlace } from "../../types/place";

const DEFAULT_CENTER = { lat: 40.4168, lng: -3.7038 };
const SEARCH_DEBOUNCE_MS = 260;
const MIN_SEARCH_LENGTH = 2;
const SEARCH_RADII_METERS = [1500, 5000, 15000, 50000] as const;
const MAX_SEARCH_RESULTS = 12;
const LocateIcon = LocateFixed as SavoryIconGlyph;

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

export default function SavoryMap() {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  const viewportWidth = useViewportWidth();
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  const userAccuracyCircleRef = useRef<google.maps.Circle | null>(null);
  const autocompleteRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesRef = useRef<google.maps.places.PlacesService | null>(null);
  const searchRequestRef = useRef(0);

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SavoryPlace[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<SavoryPlace | null>(null);
  const [userLocation, setUserLocation] = useState<google.maps.LatLngLiteral | null>(null);
  const overlayWidth = Math.max(280, viewportWidth - 36);
  const controlWidth = Math.min(overlayWidth, 430);

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
      markerRef.current?.setMap(null);
      userMarkerRef.current?.setMap(null);
      userAccuracyCircleRef.current?.setMap(null);
    };
  }, [apiKey]);

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
        mapRef.current.panTo(position);
        mapRef.current.setZoom(15);
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

  const focusPlaceOnMap = useCallback((place: SavoryPlace) => {
    if (!place.location || !mapRef.current) {
      return;
    }

    const position = new google.maps.LatLng(place.location.lat, place.location.lng);

    if (!markerRef.current) {
      markerRef.current = new google.maps.Marker({
        clickable: false,
        icon: {
          fillColor: theme.colors.coral,
          fillOpacity: 1,
          path: google.maps.SymbolPath.CIRCLE,
          scale: 9,
          strokeColor: theme.colors.white,
          strokeWeight: 3,
        },
        map: mapRef.current,
        optimized: true,
        position,
      });
    } else {
      markerRef.current.setPosition(position);
      markerRef.current.setMap(mapRef.current);
    }

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
      setSearchError(nextResults.length > 0 ? null : "No se encontraron sitios de comida o bebida.");
    } catch {
      if (searchRequestRef.current === requestId) {
        setResults([]);
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
      setSearchError(null);

      if (!detailsService || !place.placeId) {
        setSelectedPlace(place);
        focusPlaceOnMap(place);
        return;
      }

      setIsSearching(true);
      detailsService.getDetails(
        {
          fields: ["formatted_address", "geometry", "name", "place_id", "types"],
          placeId: place.placeId,
        },
        (
          details: google.maps.places.PlaceResult | null,
          status: string,
        ) => {
          setIsSearching(false);

          if (status !== "OK" || !details) {
            setSelectedPlace(place);
            focusPlaceOnMap(place);
            return;
          }

          const detailedPlace = placeFromDetails(details, place);

          setSelectedPlace(detailedPlace);
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

      <View pointerEvents="none" style={styles.brandOverlay}>
        <Text style={styles.brand}>Savory</Text>
      </View>

      <View pointerEvents="box-none" style={styles.bottomOverlay}>
        <View style={[styles.locationButtonRow, { width: controlWidth }]}>
          <Pressable
            accessibilityLabel="Centrar mi ubicación"
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
        <PlacesSearch
          error={searchError}
          loading={isSearching}
          onChangeText={handleQueryChange}
          onSelectPlace={handleSelectPlace}
          results={results}
          value={query}
          width={controlWidth}
        />
        <BottomNav width={controlWidth} />
      </View>
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
  brandOverlay: {
    alignItems: "center",
    left: 0,
    paddingTop: 18,
    position: "absolute",
    right: 0,
    top: 0,
  },
  brand: {
    color: theme.colors.black,
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 42,
    textAlign: "center",
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
    alignItems: "flex-start",
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
