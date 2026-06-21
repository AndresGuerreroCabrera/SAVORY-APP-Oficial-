import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { useCallback, useEffect, useRef, useState } from "react";

import { isFoodRelatedPlace, normalizeAutocompletePrediction, placeFromDetails } from "../../services/googlePlaces";
import type { SavoryPlace } from "../../types/place";
import { PlacesSearch } from "./PlacesSearch";

const SEARCH_DEBOUNCE_MS = 260;
const MIN_SEARCH_LENGTH = 2;
const MAX_SEARCH_RESULTS = 12;

type StandalonePlacesSearchProps = {
  width: number;
  onSelectPlace: (place: SavoryPlace) => void;
};

export function StandalonePlacesSearch({ onSelectPlace, width }: StandalonePlacesSearchProps) {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  const detailsElementRef = useRef<HTMLDivElement | null>(null);
  const autocompleteRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const detailsServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SavoryPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPlaces() {
      if (!apiKey) {
        setError("Configura EXPO_PUBLIC_GOOGLE_MAPS_API_KEY para buscar restaurantes.");
        return;
      }

      try {
        setOptions({
          key: apiKey,
          libraries: ["places"],
          v: "weekly",
        });

        const placesLibrary = (await importLibrary("places")) as google.maps.PlacesLibrary;

        if (cancelled) {
          return;
        }

        autocompleteRef.current = new placesLibrary.AutocompleteService();
        detailsServiceRef.current = new placesLibrary.PlacesService(detailsElementRef.current ?? document.createElement("div"));
      } catch {
        if (!cancelled) {
          setError("No se pudo cargar Google Places.");
        }
      }
    }

    void loadPlaces();

    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  useEffect(() => {
    const normalizedQuery = query.trim();

    if (normalizedQuery.length < MIN_SEARCH_LENGTH) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    const autocomplete = autocompleteRef.current;

    if (!autocomplete) {
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    const timeout = window.setTimeout(() => {
      autocomplete.getPlacePredictions(
        {
          input: normalizedQuery,
          types: ["establishment"],
        },
        (predictions, status) => {
          if (!active) {
            return;
          }

          setLoading(false);

          if (status === "ZERO_RESULTS") {
            setResults([]);
            return;
          }

          if (status !== "OK" || !predictions) {
            setError("No se pudieron buscar restaurantes.");
            setResults([]);
            return;
          }

          const normalized = predictions.map(normalizeAutocompletePrediction);
          const foodResults = normalized.filter(isFoodRelatedPlace);
          setResults((foodResults.length > 0 ? foodResults : normalized).slice(0, MAX_SEARCH_RESULTS));
        },
      );
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [query]);

  const handleSelectPlace = useCallback(
    (place: SavoryPlace) => {
      const detailsService = detailsServiceRef.current;

      if (!detailsService || !place.placeId) {
        onSelectPlace(place);
        return;
      }

      setLoading(true);
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
        (details, status) => {
          setLoading(false);

          if (status !== "OK" || !details) {
            onSelectPlace(place);
            return;
          }

          onSelectPlace(placeFromDetails(details, place));
        },
      );
    },
    [onSelectPlace],
  );

  return (
    <>
      <div ref={detailsElementRef} style={{ display: "none" }} />
      <PlacesSearch
        error={error}
        loading={loading}
        onChangeText={setQuery}
        onSelectPlace={handleSelectPlace}
        results={results}
        value={query}
        width={width}
      />
    </>
  );
}
