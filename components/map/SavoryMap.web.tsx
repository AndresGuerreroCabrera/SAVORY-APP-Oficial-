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
  placeFromDetails,
} from "../../services/googlePlaces";
import type { SavoryPlace } from "../../types/place";

const DEFAULT_CENTER = { lat: 40.4168, lng: -3.7038 };
const SEARCH_DEBOUNCE_MS = 260;
const MIN_SEARCH_LENGTH = 2;
const LocateIcon = LocateFixed as SavoryIconGlyph;

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

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SavoryPlace[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<SavoryPlace | null>(null);
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
    (shouldCenter = false) => {
      if (!navigator.geolocation) {
        setMapError("Tu navegador no permite usar la ubicación.");
        return;
      }

      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          drawUserLocation(
            {
              lat: coords.latitude,
              lng: coords.longitude,
            },
            coords.accuracy,
            shouldCenter,
          );
        },
        () => {
          setMapError("No se pudo obtener tu ubicación. Revisa los permisos del navegador.");
        },
        {
          enableHighAccuracy: true,
          maximumAge: 30000,
          timeout: 10000,
        },
      );
    },
    [drawUserLocation],
  );

  useEffect(() => {
    if (mapReady) {
      requestUserLocation(true);
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

  const runSearch = useCallback((input: string) => {
    const autocomplete = autocompleteRef.current;

    if (!autocomplete) {
      setSearchError("La búsqueda todavía se está cargando.");
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    autocomplete.getPlacePredictions(
      {
        input,
        types: ["establishment"],
      },
      (
        predictions: google.maps.places.AutocompletePrediction[] | null,
        status: string,
      ) => {
        setIsSearching(false);

        if (status === "ZERO_RESULTS") {
          setResults([]);
          setSearchError("No se encontraron sitios de comida o bebida.");
          return;
        }

        if (status !== "OK" || !predictions) {
          setResults([]);
          setSearchError("La búsqueda no está disponible ahora mismo.");
          return;
        }

        const normalized = predictions.map(normalizeAutocompletePrediction);
        const foodResults = normalized.filter(isFoodRelatedPlace);
        const nextResults = (foodResults.length > 0 ? foodResults : normalized).slice(0, 7);

        setResults(nextResults);
        setSearchError(nextResults.length > 0 ? null : "No se encontraron sitios de comida o bebida.");
      },
    );
  }, []);

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

      if (!detailsService) {
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
            onPress={() => requestUserLocation(true)}
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
