import { SlidersHorizontal } from "lucide-react-native";
import type { ReactNode } from "react";
import { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { TextStyle } from "react-native";

import { CUISINE_TYPES, OCCASION_TYPES, PRICE_RANGES } from "../../constants/restaurantOptions";
import { theme } from "../../constants/theme";
import { trackAppEvent } from "../../services/appAnalytics";
import type { RestaurantFilters } from "../../types/restaurant";
import { SavoryIcon, type SavoryIconGlyph } from "../ui/SavoryIcon";

const SlidersIcon = SlidersHorizontal as SavoryIconGlyph;
const webInputReset: TextStyle & {
  boxShadow?: string;
  caretColor?: string;
  cursor?: string;
  outline?: string;
  outlineColor?: string;
  outlineWidth?: number;
} = {
  boxShadow: "none",
  caretColor: theme.colors.text,
  cursor: "text",
  outline: "none",
  outlineColor: "transparent",
  outlineWidth: 0,
};
const inputPlatformStyle = Platform.OS === "web" ? webInputReset : null;

type FiltersDropdownProps = {
  children?: ReactNode;
  filters: RestaurantFilters;
  includeVisibility?: boolean;
  width: number;
  onChange: (filters: RestaurantFilters) => void;
};

export function FiltersDropdown({ children, filters, includeVisibility, onChange, width }: FiltersDropdownProps) {
  const [open, setOpen] = useState(false);
  const [cuisineQuery, setCuisineQuery] = useState("");
  const [occasionQuery, setOccasionQuery] = useState("");
  const activeCount =
    filters.cuisineTypes.length +
    filters.occasionTypes.length +
    filters.priceRanges.length +
    (includeVisibility ? filters.visibilities.length : 0);

  return (
    <View style={[styles.container, { width }]}>
      <Pressable
        accessibilityLabel={open ? "Cerrar filtros" : "Abrir filtros"}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => {
          setOpen((current) => {
            const nextOpen = !current;

            void trackAppEvent({
              eventName: nextOpen ? "filters_opened" : "filters_closed",
              metadata: {
                active_count: activeCount,
                include_visibility: Boolean(includeVisibility),
              },
            });

            return nextOpen;
          });
        }}
        style={({ pressed }) => [styles.trigger, open && styles.triggerOpen, pressed && styles.pressed]}
      >
        <SavoryIcon color={open ? theme.colors.white : theme.colors.text} glyph={SlidersIcon} size={22} strokeWidth={2.3} />
        {activeCount > 0 ? (
          <View style={styles.activeBadge}>
            <Text style={styles.activeBadgeText}>{activeCount}</Text>
          </View>
        ) : null}
      </Pressable>

      {open ? (
        <View style={styles.optionsPanel}>
          {children ? <View style={styles.extraContent}>{children}</View> : null}
          <FilterSection
            items={CUISINE_TYPES}
            onQueryChange={setCuisineQuery}
            onToggle={(next) => onChange({ ...filters, cuisineTypes: next })}
            query={cuisineQuery}
            selected={filters.cuisineTypes}
            title="Tipo de comida"
          />
          <FilterSection
            items={OCCASION_TYPES}
            onQueryChange={setOccasionQuery}
            onToggle={(next) => onChange({ ...filters, occasionTypes: next })}
            query={occasionQuery}
            selected={filters.occasionTypes}
            title="Tipo de ocasión"
          />
          <View style={styles.filterSection}>
            <Text style={styles.sectionTitle}>Precio por persona</Text>
            <ChipCloud
              items={PRICE_RANGES}
              selected={filters.priceRanges}
              onToggle={(next) => onChange({ ...filters, priceRanges: next })}
            />
          </View>
          {includeVisibility ? (
            <View style={styles.filterSection}>
              <Text style={styles.sectionTitle}>Visibilidad</Text>
              <ChipCloud
                items={["Público", "Privado"]}
                selected={filters.visibilities.map((visibility) => (visibility === "public" ? "Público" : "Privado"))}
                onToggle={(next) =>
                  onChange({
                    ...filters,
                    visibilities: next.map((label) => (label === "Público" ? "public" : "private")),
                  })
                }
              />
            </View>
          ) : null}
          {activeCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                void trackAppEvent({
                  eventName: "filters_cleared",
                  metadata: { active_count: activeCount, include_visibility: Boolean(includeVisibility) },
                });
                onChange(emptyRestaurantFilters());
              }}
              style={styles.clearButton}
            >
              <Text style={styles.clearButtonText}>Limpiar filtros</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

type FilterSectionProps = {
  items: string[];
  query: string;
  selected: string[];
  title: string;
  onQueryChange: (query: string) => void;
  onToggle: (selected: string[]) => void;
};

function FilterSection({ items, onQueryChange, onToggle, query, selected, title }: FilterSectionProps) {
  const normalizedQuery = normalizeOptionText(query);
  const visibleItems = normalizedQuery
    ? items.filter((item) => normalizeOptionText(item).includes(normalizedQuery))
    : items;

  return (
    <View style={styles.filterSection}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={onQueryChange}
        placeholder={`Buscar ${title.toLowerCase()}`}
        placeholderTextColor={theme.colors.faint}
        selectionColor={theme.colors.text}
        style={[styles.searchInput, inputPlatformStyle]}
        value={query}
      />
      <ScrollView nestedScrollEnabled style={styles.chipScroll}>
        <ChipCloud items={visibleItems} selected={selected} onToggle={onToggle} />
      </ScrollView>
    </View>
  );
}

type ChipCloudProps = {
  items: string[];
  selected: string[];
  onToggle: (selected: string[]) => void;
};

function ChipCloud({ items, onToggle, selected }: ChipCloudProps) {
  return (
    <View style={styles.chipCloud}>
      {items.map((item) => {
        const isSelected = selected.includes(item);

        return (
          <Pressable
            accessibilityRole="button"
            key={item}
            onPress={() => onToggle(isSelected ? selected.filter((value) => value !== item) : [...selected, item])}
            style={[styles.chip, isSelected && styles.chipSelected]}
          >
            <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{item}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function emptyRestaurantFilters(): RestaurantFilters {
  return {
    cuisineTypes: [],
    occasionTypes: [],
    priceRanges: [],
    visibilities: [],
  };
}

function normalizeOptionText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const styles = StyleSheet.create({
  container: {
    alignItems: "flex-end",
    gap: 8,
  },
  trigger: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceGlass,
    borderColor: "#FFDAD5",
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    height: 54,
    justifyContent: "center",
    position: "relative",
    width: 54,
  },
  triggerOpen: {
    backgroundColor: theme.colors.coral,
    borderColor: theme.colors.coral,
  },
  activeBadge: {
    alignItems: "center",
    backgroundColor: theme.colors.coral,
    borderColor: theme.colors.white,
    borderRadius: theme.radius.pill,
    borderWidth: 2,
    height: 22,
    justifyContent: "center",
    minWidth: 22,
    paddingHorizontal: 5,
    position: "absolute",
    right: -7,
    top: -7,
  },
  activeBadgeText: {
    color: theme.colors.white,
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 14,
  },
  optionsPanel: {
    alignSelf: "stretch",
    backgroundColor: theme.colors.surfaceGlass,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    gap: 14,
    padding: 12,
  },
  extraContent: {
    gap: 8,
  },
  filterSection: {
    gap: 8,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 17,
  },
  searchInput: {
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "700",
    height: 42,
    paddingHorizontal: 12,
  },
  chipScroll: {
    maxHeight: 130,
  },
  chipCloud: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  chip: {
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  chipSelected: {
    backgroundColor: theme.colors.coralSoft,
    borderColor: theme.colors.coral,
  },
  chipText: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
  },
  chipTextSelected: {
    color: theme.colors.text,
  },
  clearButton: {
    alignItems: "center",
    backgroundColor: theme.colors.text,
    borderRadius: theme.radius.pill,
    height: 40,
    justifyContent: "center",
  },
  clearButtonText: {
    color: theme.colors.white,
    fontSize: 13,
    fontWeight: "900",
  },
  pressed: {
    opacity: 0.72,
  },
});
