import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { TextStyle } from "react-native";
import { Search, X } from "lucide-react-native";

import { floatingShadow, theme } from "../../constants/theme";
import type { SavoryPlace } from "../../types/place";
import { SavoryIcon, type SavoryIconGlyph } from "../ui/SavoryIcon";

type PlacesSearchProps = {
  value: string;
  results: SavoryPlace[];
  loading: boolean;
  error?: string | null;
  disabled?: boolean;
  width?: number;
  onChangeText: (text: string) => void;
  onSelectPlace: (place: SavoryPlace) => void;
};

const SearchIcon = Search as SavoryIconGlyph;
const XIcon = X as SavoryIconGlyph;
const webInputFocusReset: TextStyle & {
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
const inputPlatformStyle = Platform.OS === "web" ? webInputFocusReset : null;

export function PlacesSearch({
  value,
  results,
  loading,
  error,
  disabled,
  width,
  onChangeText,
  onSelectPlace,
}: PlacesSearchProps) {
  const hasQuery = value.trim().length > 0;
  const showDropdown = hasQuery && (loading || Boolean(error) || results.length > 0);

  return (
    <View style={[styles.container, width ? { width } : null]}>
      {showDropdown ? (
        <View style={styles.dropdown}>
          {loading ? (
            <View style={styles.stateRow}>
              <ActivityIndicator color={theme.colors.coral} size="small" />
              <Text style={styles.stateText}>Buscando sitios</Text>
            </View>
          ) : null}

          {!loading && error ? (
            <Text numberOfLines={2} style={[styles.stateText, styles.errorText]}>
              {error}
            </Text>
          ) : null}

          {!loading && !error
            ? results.map((place) => (
                <Pressable
                  accessibilityLabel={`Seleccionar ${place.name}`}
                  accessibilityRole="button"
                  key={place.id}
                  onPress={() => onSelectPlace(place)}
                  style={({ pressed }) => [styles.resultRow, pressed && styles.resultRowPressed]}
                >
                  <View style={styles.resultDot} />
                  <View style={styles.resultText}>
                    <Text numberOfLines={1} style={styles.resultName}>
                      {place.name}
                    </Text>
                    <Text numberOfLines={1} style={styles.resultMeta}>
                      {[place.category, place.address].filter(Boolean).join(" - ")}
                    </Text>
                  </View>
                </Pressable>
              ))
            : null}
        </View>
      ) : null}

      <View style={[styles.inputShell, disabled && styles.inputShellDisabled]}>
        <SavoryIcon color={theme.colors.muted} glyph={SearchIcon} size={19} strokeWidth={2.2} />
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          editable={!disabled}
          onChangeText={onChangeText}
          placeholder="Buscar restaurantes, cafeterías, bares..."
          placeholderTextColor={theme.colors.faint}
          returnKeyType="search"
          selectionColor={theme.colors.text}
          style={[styles.input, inputPlatformStyle]}
          value={value}
        />
        {loading ? (
          <ActivityIndicator color={theme.colors.coral} size="small" />
        ) : hasQuery ? (
          <Pressable
            accessibilityLabel="Borrar búsqueda"
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => onChangeText("")}
            style={styles.clearButton}
          >
            <SavoryIcon color={theme.colors.muted} glyph={XIcon} size={17} strokeWidth={2.4} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    maxWidth: 520,
    width: "100%",
  },
  dropdown: {
    ...floatingShadow,
    backgroundColor: theme.colors.surfaceGlass,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    marginBottom: 10,
    maxHeight: 292,
    overflow: "hidden",
    paddingVertical: 8,
  },
  stateRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 16,
  },
  stateText: {
    color: theme.colors.muted,
    fontSize: 14,
    lineHeight: 19,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  errorText: {
    color: theme.colors.danger,
  },
  resultRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  resultRowPressed: {
    backgroundColor: theme.colors.surfaceSoft,
  },
  resultDot: {
    backgroundColor: theme.colors.coral,
    borderColor: theme.colors.white,
    borderRadius: theme.radius.pill,
    borderWidth: 3,
    height: 18,
    width: 18,
  },
  resultText: {
    flex: 1,
    minWidth: 0,
  },
  resultName: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  resultMeta: {
    color: theme.colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  inputShell: {
    ...floatingShadow,
    alignItems: "center",
    backgroundColor: theme.colors.surfaceGlass,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    height: 60,
    paddingHorizontal: 18,
    width: "100%",
  },
  inputShellDisabled: {
    opacity: 0.72,
  },
  input: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
    height: "100%",
    minWidth: 0,
  },
  clearButton: {
    alignItems: "center",
    borderRadius: theme.radius.pill,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
});
