import { Camera, ChevronLeft, X } from "lucide-react-native";
import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { CUISINE_TYPES, OCCASION_TYPES, PRICE_RANGES } from "../../constants/restaurantOptions";
import { floatingShadow, theme } from "../../constants/theme";
import { trackAppEvent } from "../../services/appAnalytics";
import { getCurrentUserGroups, saveGroupRestaurant, type GroupSummary } from "../../services/groups";
import { compressImageFile } from "../../services/imageCompression";
import { getGoogleMapsUrl, getPhoneUrl, getWebsiteUrl, openExternalUrl } from "../../services/restaurantLinks";
import { saveRestaurant } from "../../services/savedRestaurants";
import { recordRestaurantScoreEventForPublicOwners } from "../../services/savoryScore";
import { supabase } from "../../services/supabase";
import type { SavoryPlace } from "../../types/place";
import type {
  RestaurantPhoto,
  SavedRestaurantRecord,
  SavedRestaurantStatus,
  SavedRestaurantVisibility,
} from "../../types/restaurant";
import { ImageLightbox } from "../ui/ImageLightbox";
import { SavoryIcon, type SavoryIconGlyph } from "../ui/SavoryIcon";

type RestaurantSaveSheetProps = {
  place: SavoryPlace;
  width: number;
  groupId?: string;
  historyMode?: "append" | "replace_latest";
  initialRecord?: SavedRestaurantRecord;
  initialStatus?: SavedRestaurantStatus;
  initialTarget?: SaveTarget;
  startWithGroupPickerOnly?: boolean;
  lockTarget?: boolean;
  lockStatus?: boolean;
  onClose: () => void;
  onSaved?: () => Promise<void> | void;
};

type VisitedStep = "food" | "local" | "service" | "visibility";
type PhotoKind = "dish" | "local";
type SaveTarget = "personal" | "group";

const CameraIcon = Camera as SavoryIconGlyph;
const CloseIcon = X as SavoryIconGlyph;
const BackIcon = ChevronLeft as SavoryIconGlyph;

const RATING_VALUES = Array.from({ length: 21 }, (_, index) => index / 2);
const MAX_PHOTO_INPUT_BYTES = 8 * 1024 * 1024;
const RESTAURANT_PHOTO_MAX_EDGE = 1400;
const RESTAURANT_PHOTO_QUALITY = 0.78;
const SUPABASE_NETWORK_ERROR =
  "No se pudo conectar con Supabase. En local puede ser un bloqueo TLS/certificados de Windows; en Vercel revisa las variables publicas y redepliega.";
const SUPABASE_HEADER_TOO_LARGE_ERROR =
  "La sesion es demasiado grande porque Auth tiene una foto guardada en metadata. Cierra sesion y ejecuta la limpieza de avatar_url en auth.users.";
const STEP_MENU_ITEMS: Array<{ label: string; value: VisitedStep }> = [
  { label: "Comida", value: "food" },
  { label: "Local", value: "local" },
  { label: "Servicio", value: "service" },
  { label: "Visibilidad", value: "visibility" },
];

export function RestaurantSaveSheet({
  groupId,
  historyMode = "append",
  initialRecord,
  initialStatus,
  initialTarget,
  startWithGroupPickerOnly,
  lockTarget,
  lockStatus,
  onSaved,
  place,
  width,
  onClose,
}: RestaurantSaveSheetProps) {
  const dishInputRef = useRef<HTMLInputElement | null>(null);
  const localInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<SavedRestaurantStatus>(initialStatus ?? initialRecord?.status ?? "want_to_go");
  const [step, setStep] = useState<VisitedStep>("food");
  const [visibility, setVisibility] = useState<SavedRestaurantVisibility>(initialRecord?.visibility ?? "private");
  const [cuisineTypes, setCuisineTypes] = useState<string[]>(initialRecord?.cuisine_types ?? []);
  const [dishPhotos, setDishPhotos] = useState<RestaurantPhoto[]>(initialRecord?.dish_photos ?? []);
  const [localPhotos, setLocalPhotos] = useState<RestaurantPhoto[]>(initialRecord?.local_photos ?? []);
  const [foodRating, setFoodRating] = useState(initialRecord?.food_rating ?? 0);
  const [occasionTypes, setOccasionTypes] = useState<string[]>(initialRecord?.occasion_types ?? []);
  const [priceRange, setPriceRange] = useState<string | null>(initialRecord?.price_range ?? null);
  const [serviceComment, setServiceComment] = useState(initialRecord?.service_comment ?? "");
  const [generalComment, setGeneralComment] = useState(initialRecord?.general_comment ?? "");
  const [saveTarget, setSaveTarget] = useState<SaveTarget>(initialTarget ?? (groupId ? "group" : "personal"));
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(groupId ?? null);
  const [showGroupPickerOnly, setShowGroupPickerOnly] = useState(Boolean(startWithGroupPickerOnly && (initialTarget ?? (groupId ? "group" : "personal")) === "group" && !groupId));
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<RestaurantPhoto | null>(null);

  useEffect(() => {
    if (saveTarget !== "group" || groupId) {
      return;
    }

    let active = true;
    setLoadingGroups(true);
    setGroupsError(null);

    getCurrentUserGroups()
      .then(({ data, error: loadError }) => {
        if (!active) {
          return;
        }

        setGroups(data);

        if (loadError) {
          setGroupsError(loadError.message);
        }
      })
      .catch((loadError) => {
        if (active) {
          setGroupsError(getSupabaseUiError(loadError, "No se pudieron cargar tus grupos."));
        }
      })
      .finally(() => {
        if (active) {
          setLoadingGroups(false);
        }
      });

    return () => {
      active = false;
    };
  }, [groupId, saveTarget, selectedGroupId, showGroupPickerOnly]);

  const saveCurrentRestaurant = async () => {
    setError(null);
    setMessage(null);

    if (!place.placeId && !place.id) {
      setError("No se pudo identificar el restaurante de Google.");
      return;
    }

    const googlePlaceId = place.placeId || place.id;

    if (!supabase) {
      setError("Supabase no está configurado.");
      return;
    }

    if (saveTarget === "group" && !selectedGroupId) {
      setError("Selecciona un grupo para guardar este restaurante.");
      return;
    }

    setSaving(true);
    let sessionData;

    try {
      const { data } = await supabase.auth.getSession();
      sessionData = data;
    } catch (sessionError) {
      setSaving(false);
      setError(getSupabaseUiError(sessionError, "No se pudo cargar tu sesión."));
      return;
    }

    if (!sessionData.session) {
      setSaving(false);
      setError("Inicia sesión en Perfil para guardar restaurantes.");
      return;
    }

    const saveInput = {
      cuisineTypes: status === "visited" ? cuisineTypes : [],
      dishPhotos: status === "visited" ? dishPhotos : [],
      foodRating: status === "visited" ? foodRating : 0,
      generalComment: status === "visited" ? generalComment.trim() || null : null,
      historyMode,
      localPhotos: status === "visited" ? localPhotos : [],
      occasionTypes: status === "visited" ? occasionTypes : [],
      place,
      priceRange: status === "visited" ? priceRange : null,
      savedAt: historyMode === "replace_latest" ? initialRecord?.saved_at : undefined,
      serviceComment: status === "visited" ? serviceComment.trim() || null : null,
      status,
      userId: sessionData.session.user.id,
      visibility: status === "visited" ? visibility : "private",
    };
    const { alreadyExists, error: saveError } =
      saveTarget === "group"
        ? await saveGroupRestaurant({ ...saveInput, groupId: selectedGroupId as string })
        : await saveRestaurant(saveInput);

    setSaving(false);

    if (saveError) {
      setError(getSupabaseUiError(saveError, saveError.message || "No se pudo guardar el restaurante."));
      return;
    }

    if (alreadyExists) {
      setMessage(
        saveTarget === "group"
          ? "Este restaurante ya esta guardado en Deseados del grupo."
          : "Ya tienes este restaurante guardado en Deseados.",
      );
      return;
    }

    const contentQuality = getRestaurantContentQuality({
      cuisineTypes: saveInput.cuisineTypes,
      dishPhotos: saveInput.dishPhotos,
      foodRating: saveInput.foodRating,
      generalComment: saveInput.generalComment,
      localPhotos: saveInput.localPhotos,
      occasionTypes: saveInput.occasionTypes,
      priceRange: saveInput.priceRange,
      serviceComment: saveInput.serviceComment,
    });
    const productEventName = status === "visited" ? "restaurant_marked_visited" : "restaurant_marked_want_to_go";
    void trackAppEvent({
      entityId: googlePlaceId,
      entityType: "restaurant",
      eventName: productEventName,
      metadata: {
        ...contentQuality,
        is_public: status === "visited" && visibility === "public",
        list_scope: saveTarget,
        source: saveTarget === "group" ? "shared_list" : "personal_list",
      },
    });
    if (status === "visited" && (saveInput.serviceComment || saveInput.generalComment)) {
      void trackAppEvent({
        entityId: googlePlaceId,
        entityType: "restaurant",
        eventName: "restaurant_review_added",
        metadata: {
          has_general_comment: Boolean(saveInput.generalComment),
          has_service_comment: Boolean(saveInput.serviceComment),
          list_scope: saveTarget,
        },
      });
    }
    if (status === "visited" && (saveInput.dishPhotos.length > 0 || saveInput.localPhotos.length > 0)) {
      void trackAppEvent({
        entityId: googlePlaceId,
        entityType: "restaurant",
        eventName: "restaurant_photo_added",
        metadata: {
          dish_photo_count: saveInput.dishPhotos.length,
          list_scope: saveTarget,
          local_photo_count: saveInput.localPhotos.length,
        },
      });
    }
    if (status === "visited" && saveInput.foodRating > 0) {
      void trackAppEvent({
        entityId: googlePlaceId,
        entityType: "restaurant",
        eventName: "restaurant_rating_added",
        metadata: {
          list_scope: saveTarget,
          rating: saveInput.foodRating,
        },
      });
    }
    setMessage(
      saveTarget === "group"
        ? status === "visited"
          ? "Restaurante guardado en el grupo."
          : "Restaurante guardado en Deseados del grupo."
        : status === "visited"
          ? "Restaurante guardado en tu lista."
          : "Restaurante guardado en Deseados.",
    );
    void recordRestaurantScoreEventForPublicOwners({
      eventName: getScoreEventName(status, saveTarget),
      googlePlaceId,
      metadata: {
        save_target: saveTarget,
        status,
      },
      source: saveTarget === "group" ? "shared_list" : "personal_list",
    });
    await onSaved?.();
    window.setTimeout(onClose, 1000);
  };

  const handlePhotoPick = async (kind: PhotoKind, fileList: FileList | null) => {
    const file = fileList?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/") || file.size > MAX_PHOTO_INPUT_BYTES) {
      setError("Usa una imagen menor de 8 MB.");
      return;
    }

    let dataUrl: string;

    try {
      dataUrl = await compressImageFile(file, {
        maxHeight: RESTAURANT_PHOTO_MAX_EDGE,
        maxWidth: RESTAURANT_PHOTO_MAX_EDGE,
        quality: RESTAURANT_PHOTO_QUALITY,
      });
    } catch {
      setError("No se pudo comprimir la imagen.");
      return;
    }

    const nextPhoto = {
      caption: "",
      dataUrl,
      fileName: file.name,
    };

    if (kind === "dish") {
      setDishPhotos((photos) => [...photos, nextPhoto].slice(0, 5));
    } else {
      setLocalPhotos((photos) => [...photos, nextPhoto].slice(0, 5));
    }
  };

  const updatePhotoCaption = (kind: PhotoKind, index: number, caption: string) => {
    const updater = (photos: RestaurantPhoto[]) =>
      photos.map((photo, photoIndex) => (photoIndex === index ? { ...photo, caption } : photo));

    if (kind === "dish") {
      setDishPhotos(updater);
    } else {
      setLocalPhotos(updater);
    }
  };

  const isVisited = status === "visited";
  const isEditingVisited = Boolean(initialRecord && isVisited);
  const requiresGroupSelection = saveTarget === "group" && !selectedGroupId;
  const saveDisabled = saving || requiresGroupSelection;

  const handleTargetChange = (nextTarget: SaveTarget) => {
    setSaveTarget(nextTarget);

    if (nextTarget === "group" && !groupId) {
      setSelectedGroupId(null);
    }
  };

  if (showGroupPickerOnly) {
    return (
      <View style={styles.overlay}>
        <Pressable accessibilityLabel="Cerrar restaurante" onPress={onClose} style={styles.backdrop} />
        <View style={[styles.sheet, { width }]}>
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Text numberOfLines={2} style={styles.title}>
                Guardar en grupo
              </Text>
              <Text numberOfLines={2} style={styles.groupPickerStateText}>
                {place.name}
              </Text>
            </View>
            <Pressable accessibilityRole="button" hitSlop={10} onPress={onClose} style={styles.iconButton}>
              <SavoryIcon color={theme.colors.text} glyph={CloseIcon} size={20} strokeWidth={2.4} />
            </Pressable>
          </View>
          <GroupPicker
            error={groupsError}
            groups={groups}
            loading={loadingGroups}
            selectedGroupId={selectedGroupId}
            onSelect={(nextGroupId) => {
              setSelectedGroupId(nextGroupId);
              setSaveTarget("group");
              setShowGroupPickerOnly(false);
            }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.overlay}>
      <Pressable accessibilityLabel="Cerrar restaurante" onPress={onClose} style={styles.backdrop} />
      <View style={[styles.sheet, { width }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text numberOfLines={2} style={styles.title}>
              {place.name}
            </Text>
            {place.address ? (
              <Pressable
                accessibilityRole="link"
                onPress={() =>
                  openExternalUrl(
                    getGoogleMapsUrl({
                      address: place.address,
                      lat: place.location?.lat,
                      lng: place.location?.lng,
                      name: place.name,
                      placeId: place.placeId,
                    }),
                  )
                }
              >
                <Text numberOfLines={2} style={styles.addressLink}>
                  {place.address}
                </Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable accessibilityRole="button" hitSlop={10} onPress={onClose} style={styles.iconButton}>
            <SavoryIcon color={theme.colors.text} glyph={CloseIcon} size={20} strokeWidth={2.4} />
          </Pressable>
        </View>

        {place.phone || place.website ? (
          <View style={styles.infoBlock}>
            {place.phone ? (
              <Pressable accessibilityRole="link" onPress={() => openExternalUrl(getPhoneUrl(place.phone ?? ""))}>
                <Text style={styles.infoLink}>{place.phone}</Text>
              </Pressable>
            ) : null}
            {place.website ? (
              <Pressable accessibilityRole="link" onPress={() => openExternalUrl(getWebsiteUrl(place.website ?? ""))}>
                <Text numberOfLines={1} style={styles.infoLink}>
                  {place.website}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {lockTarget ? null : (
          <>
            <TargetChoice value={saveTarget} onChange={handleTargetChange} />
            {saveTarget === "group" ? (
              <View style={styles.inlineGroupPicker}>
                <GroupPicker
                  error={groupsError}
                  groups={groups}
                  loading={loadingGroups}
                  selectedGroupId={selectedGroupId}
                  onSelect={setSelectedGroupId}
                />
              </View>
            ) : null}
          </>
        )}

        {lockStatus ? null : (
          <SegmentedChoice
            leftLabel="Quiero ir"
            onChange={setStatus}
            rightLabel="Ya he ido"
            value={status}
          />
        )}

        {isVisited ? (
          <>
            {isEditingVisited ? (
              <View style={styles.editQuickControls}>
                <StepMenu activeStep={step} onSelect={setStep} />
                <Pressable
                  accessibilityRole="button"
                  disabled={saveDisabled}
                  onPress={saveCurrentRestaurant}
                  style={[styles.quickSaveButton, saveDisabled && styles.disabledButton]}
                >
                  {saving ? <ActivityIndicator color={theme.colors.white} /> : <Text style={styles.quickSaveButtonText}>Guardar cambios</Text>}
                </Pressable>
              </View>
            ) : null}

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.visitedScroll}>
            {step === "food" ? (
              <View style={styles.stepArea}>
                <Text style={styles.stepTitle}>Comida</Text>
                <SearchableChipCloud
                  items={CUISINE_TYPES}
                  placeholder="Buscar tipo de comida"
                  selected={cuisineTypes}
                  onToggle={setCuisineTypes}
                />
                <PhotoPicker
                  buttonLabel="Subir foto de plato"
                  inputRef={dishInputRef}
                  kind="dish"
                  onPick={handlePhotoPick}
                  photos={dishPhotos}
                  onCaptionChange={updatePhotoCaption}
                  onPreview={setPreviewPhoto}
                />
                <RatingCircles value={foodRating} onChange={setFoodRating} />
                <Pressable accessibilityRole="button" onPress={() => setStep("local")} style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>Siguiente</Text>
                </Pressable>
              </View>
            ) : null}

            {step === "local" ? (
              <View style={styles.stepArea}>
                <StepNav onBack={() => setStep("food")} title="Local" />
                <SearchableChipCloud
                  items={OCCASION_TYPES}
                  placeholder="Buscar tipo de ocasión"
                  selected={occasionTypes}
                  onToggle={setOccasionTypes}
                />
                <PhotoPicker
                  buttonLabel="Subir foto del local"
                  inputRef={localInputRef}
                  kind="local"
                  onPick={handlePhotoPick}
                  photos={localPhotos}
                  onCaptionChange={updatePhotoCaption}
                  onPreview={setPreviewPhoto}
                />
                <Text style={styles.fieldLabel}>Precio por persona</Text>
                <ChipCloud single items={PRICE_RANGES} selected={priceRange ? [priceRange] : []} onToggle={(next) => setPriceRange(next[0] ?? null)} />
                <Pressable accessibilityRole="button" onPress={() => setStep("service")} style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>Siguiente</Text>
                </Pressable>
              </View>
            ) : null}

            {step === "service" ? (
              <View style={styles.stepArea}>
                <StepNav onBack={() => setStep("local")} title="Servicio" />
                <TextInput
                  multiline
                  onChangeText={setServiceComment}
                  placeholder="Comentarios sobre el servicio"
                  placeholderTextColor={theme.colors.faint}
                  selectionColor={theme.colors.text}
                  style={styles.textArea}
                  value={serviceComment}
                />
                <TextInput
                  multiline
                  onChangeText={setGeneralComment}
                  placeholder="Comentario general sobre el restaurante"
                  placeholderTextColor={theme.colors.faint}
                  selectionColor={theme.colors.text}
                  style={styles.textArea}
                  value={generalComment}
                />
                <Pressable accessibilityRole="button" onPress={() => setStep("visibility")} style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>Siguiente</Text>
                </Pressable>
              </View>
            ) : null}

            {step === "visibility" ? (
              <View style={styles.stepArea}>
                <StepNav onBack={() => setStep("service")} title="Visibilidad" />
                <SegmentedChoice
                  leftLabel="Privado"
                  onChange={setVisibility}
                  rightLabel="Público"
                  value={visibility}
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={saveDisabled}
                  onPress={saveCurrentRestaurant}
                  style={[styles.primaryButton, saveDisabled && styles.disabledButton]}
                >
                  {saving ? <ActivityIndicator color={theme.colors.white} /> : <Text style={styles.primaryButtonText}>Guardar</Text>}
                </Pressable>
              </View>
            ) : null}
          </ScrollView>
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            disabled={saveDisabled}
            onPress={saveCurrentRestaurant}
            style={[styles.primaryButton, saveDisabled && styles.disabledButton]}
          >
            {saving ? <ActivityIndicator color={theme.colors.white} /> : <Text style={styles.primaryButtonText}>Guardar</Text>}
          </Pressable>
        )}

        {message ? <Text style={styles.successText}>{message}</Text> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
      <ImageLightbox
        caption={previewPhoto?.caption?.trim() || null}
        imageUri={previewPhoto?.dataUrl ?? null}
        onClose={() => setPreviewPhoto(null)}
        title={previewPhoto?.caption?.trim() || "Foto"}
        visible={Boolean(previewPhoto?.dataUrl)}
      />
    </View>
  );
}

type SegmentedChoiceProps<T extends string> = {
  leftLabel: string;
  rightLabel: string;
  value: T;
  onChange: (value: T) => void;
};

type TargetChoiceProps = {
  value: SaveTarget;
  onChange: (value: SaveTarget) => void;
};

function TargetChoice({ onChange, value }: TargetChoiceProps) {
  return (
    <View style={styles.targetSegmented}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: value === "personal" }}
        onPress={() => onChange("personal")}
        style={[styles.targetButton, value === "personal" && styles.segmentButtonActive]}
      >
        <Text style={[styles.segmentText, value === "personal" && styles.segmentTextActive]}>Lista personal</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: value === "group" }}
        onPress={() => onChange("group")}
        style={[styles.targetButton, value === "group" && styles.segmentButtonActive]}
      >
        <Text style={[styles.segmentText, value === "group" && styles.segmentTextActive]}>Lista compartida</Text>
      </Pressable>
    </View>
  );
}

type GroupPickerProps = {
  error: string | null;
  groups: GroupSummary[];
  loading: boolean;
  selectedGroupId: string | null;
  onSelect: (groupId: string | null) => void;
};

function GroupPicker({ error, groups, loading, onSelect, selectedGroupId }: GroupPickerProps) {
  if (loading) {
    return (
      <View style={styles.groupPickerState}>
        <ActivityIndicator color={theme.colors.coral} size="small" />
        <Text style={styles.groupPickerStateText}>Cargando grupos</Text>
      </View>
    );
  }

  if (error) {
    return <Text style={styles.errorText}>{error}</Text>;
  }

  if (groups.length === 0) {
    return <Text style={styles.groupPickerStateText}>Todavia no tienes grupos.</Text>;
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.groupPickerScroll}>
      <View style={styles.groupPickerContent}>
        {groups.map((group) => {
          const selected = group.id === selectedGroupId;

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={group.id}
              onPress={() => onSelect(selected ? null : group.id)}
              style={[styles.groupChoice, selected && styles.groupChoiceSelected]}
            >
              {group.avatar_url ? (
                <Image source={{ uri: group.avatar_url }} style={styles.groupChoiceAvatar} />
              ) : (
                <View style={styles.groupChoiceAvatarFallback}>
                  <Text style={styles.groupChoiceInitial}>{group.name.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.groupChoiceTextBlock}>
                <Text numberOfLines={1} style={styles.groupChoiceName}>
                  {group.name}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

function SegmentedChoice<T extends string>({ leftLabel, onChange, rightLabel, value }: SegmentedChoiceProps<T>) {
  const leftValue = leftLabel === "Privado" ? "private" : "want_to_go";
  const rightValue = rightLabel === "Público" ? "public" : "visited";

  return (
    <View style={styles.segmented}>
      <Pressable
        accessibilityRole="button"
        onPress={() => onChange(leftValue as T)}
        style={[styles.segmentButton, value === leftValue && styles.segmentButtonActive]}
      >
        <Text style={[styles.segmentText, value === leftValue && styles.segmentTextActive]}>{leftLabel}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => onChange(rightValue as T)}
        style={[styles.segmentButton, value === rightValue && styles.segmentButtonActive]}
      >
        <Text style={[styles.segmentText, value === rightValue && styles.segmentTextActive]}>{rightLabel}</Text>
      </Pressable>
    </View>
  );
}

type StepMenuProps = {
  activeStep: VisitedStep;
  onSelect: (step: VisitedStep) => void;
};

function StepMenu({ activeStep, onSelect }: StepMenuProps) {
  return (
    <View style={styles.stepMenu}>
      {STEP_MENU_ITEMS.map((item) => {
        const isActive = activeStep === item.value;

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            key={item.value}
            onPress={() => onSelect(item.value)}
            style={({ pressed }) => [styles.stepMenuButton, isActive && styles.stepMenuButtonActive, pressed && styles.buttonPressed]}
          >
            <Text numberOfLines={1} style={[styles.stepMenuText, isActive && styles.stepMenuTextActive]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type ChipCloudProps = {
  items: string[];
  selected: string[];
  single?: boolean;
  onToggle: (selected: string[]) => void;
};

type SearchableChipCloudProps = ChipCloudProps & {
  placeholder: string;
};

function SearchableChipCloud({ items, onToggle, placeholder, selected }: SearchableChipCloudProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = normalizeOptionText(query);
  const visibleItems = normalizedQuery
    ? items.filter((item) => normalizeOptionText(item).includes(normalizedQuery))
    : items;

  return (
    <View style={styles.searchableChips}>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setQuery}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.faint}
        selectionColor={theme.colors.text}
        style={styles.optionSearchInput}
        value={query}
      />
      <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={styles.chipScroll}>
        <ChipCloud items={visibleItems} selected={selected} onToggle={onToggle} />
      </ScrollView>
    </View>
  );
}

function ChipCloud({ items, onToggle, selected, single }: ChipCloudProps) {
  return (
    <View style={styles.chipCloud}>
      {items.map((item) => {
        const isSelected = selected.includes(item);

        return (
          <Pressable
            accessibilityRole="button"
            key={item}
            onPress={() => {
              if (single) {
                onToggle(isSelected ? [] : [item]);
                return;
              }

              onToggle(isSelected ? selected.filter((value) => value !== item) : [...selected, item]);
            }}
            style={[styles.chip, isSelected && styles.chipSelected]}
          >
            <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{item}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function normalizeOptionText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

type PhotoPickerProps = {
  buttonLabel: string;
  inputRef: RefObject<HTMLInputElement | null>;
  kind: PhotoKind;
  photos: RestaurantPhoto[];
  onCaptionChange: (kind: PhotoKind, index: number, caption: string) => void;
  onPick: (kind: PhotoKind, fileList: FileList | null) => void;
  onPreview: (photo: RestaurantPhoto) => void;
};

function PhotoPicker({ buttonLabel, inputRef, kind, onCaptionChange, onPick, onPreview, photos }: PhotoPickerProps) {
  return (
    <View style={styles.photoArea}>
      <input
        accept="image/*"
        ref={inputRef}
        style={{ display: "none" }}
        type="file"
        onChange={(event) => {
          void onPick(kind, event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
      <Pressable accessibilityRole="button" onPress={() => inputRef.current?.click()} style={styles.photoButton}>
        <SavoryIcon color={theme.colors.coral} glyph={CameraIcon} size={18} strokeWidth={2.2} />
        <Text style={styles.photoButtonText}>{buttonLabel}</Text>
      </Pressable>
      {photos.map((photo, index) => (
        <View key={`${photo.fileName}-${index}`} style={styles.photoRow}>
          {photo.dataUrl ? (
            <Pressable accessibilityRole="imagebutton" onPress={() => onPreview(photo)} style={({ pressed }) => pressed && styles.buttonPressed}>
              <Image source={{ uri: photo.dataUrl }} style={styles.photoPreview} />
            </Pressable>
          ) : null}
          <TextInput
            onChangeText={(text) => onCaptionChange(kind, index, text)}
            placeholder={kind === "dish" ? "Nombre del plato" : "Nombre de la foto"}
            placeholderTextColor={theme.colors.faint}
            selectionColor={theme.colors.text}
            style={styles.photoCaptionInput}
            value={photo.caption}
          />
        </View>
      ))}
    </View>
  );
}

type RatingCirclesProps = {
  value: number;
  onChange: (value: number) => void;
};

function RatingCircles({ onChange, value }: RatingCirclesProps) {
  const setFromGesture = (x: number, width: number) => {
    const boundedX = Math.max(0, Math.min(width, x));
    const nextValue = Math.round((boundedX / width) * 20) / 2;

    onChange(nextValue);
  };
  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: () => true,
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => {
      setFromGesture(event.nativeEvent.locationX, 280);
    },
    onPanResponderMove: (event) => {
      setFromGesture(event.nativeEvent.locationX, 280);
    },
  });

  return (
    <View style={styles.ratingBlock}>
      <Text style={styles.fieldLabel}>Puntuación: {value.toLocaleString("es-ES", { maximumFractionDigits: 1 })}/10</Text>
      <View {...panResponder.panHandlers} style={styles.ratingSlider}>
        <View style={[styles.ratingFill, { width: `${value * 10}%` }]} />
        <View style={styles.ratingBubbles}>
          {RATING_VALUES.map((rating) => (
            <Pressable
              accessibilityRole="button"
              key={rating}
              onPress={() => onChange(rating)}
              style={[styles.ratingBubble, value >= rating && styles.ratingBubbleSelected]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

type StepNavProps = {
  title: string;
  onBack: () => void;
};

function StepNav({ onBack, title }: StepNavProps) {
  return (
    <View style={styles.stepHeader}>
      <Pressable accessibilityRole="button" onPress={onBack} style={styles.stepBackButton}>
        <SavoryIcon color={theme.colors.text} glyph={BackIcon} size={18} strokeWidth={2.2} />
        <Text style={styles.stepBackText}>Anterior</Text>
      </Pressable>
      <Text style={styles.stepTitle}>{title}</Text>
    </View>
  );
}

function getSupabaseUiError(error: unknown, fallback: string) {
  const message =
    error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error ?? "");
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("request header or cookie too large") ||
    normalizedMessage.includes("unexpected token '<'")
  ) {
    return SUPABASE_HEADER_TOO_LARGE_ERROR;
  }

  if (normalizedMessage.includes("failed to fetch") || normalizedMessage.includes("networkerror")) {
    return SUPABASE_NETWORK_ERROR;
  }

  return fallback;
}

function getScoreEventName(status: SavedRestaurantStatus, saveTarget: SaveTarget) {
  if (saveTarget === "group") {
    return "add_to_shared_list";
  }

  return status === "visited" ? "mark_visited" : "save_generic";
}

function getRestaurantContentQuality(input: {
  cuisineTypes: string[];
  dishPhotos: RestaurantPhoto[];
  foodRating: number;
  generalComment: string | null;
  localPhotos: RestaurantPhoto[];
  occasionTypes: string[];
  priceRange: string | null;
  serviceComment: string | null;
}) {
  const hasComment = Boolean(input.generalComment || input.serviceComment);
  const hasPhoto = input.dishPhotos.length > 0 || input.localPhotos.length > 0;
  const completedFields = [
    input.cuisineTypes.length > 0,
    input.occasionTypes.length > 0,
    Boolean(input.priceRange),
    input.foodRating > 0,
    hasComment,
    hasPhoto,
  ].filter(Boolean).length;

  return {
    completed_field_count: completedFields,
    cuisine_type_count: input.cuisineTypes.length,
    dish_photo_count: input.dishPhotos.length,
    has_comment: hasComment,
    has_price: Boolean(input.priceRange),
    has_rating: input.foodRating > 0,
    local_photo_count: input.localPhotos.length,
    occasion_type_count: input.occasionTypes.length,
  };
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    paddingHorizontal: 18,
    position: "absolute",
    right: 0,
    top: 0,
  },
  backdrop: {
    backgroundColor: "rgba(17, 18, 20, 0.26)",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  sheet: {
    ...floatingShadow,
    backgroundColor: theme.colors.surfaceGlass,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    gap: 14,
    maxHeight: "86%",
    padding: 18,
  },
  headerRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 27,
  },
  address: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 4,
  },
  addressLink: {
    color: theme.colors.coral,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
    marginTop: 4,
  },
  iconButton: {
    alignItems: "center",
    borderRadius: theme.radius.pill,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  infoBlock: {
    backgroundColor: theme.colors.surfaceSoft,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  infoText: {
    color: theme.colors.textSoft,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  infoLink: {
    color: theme.colors.coral,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
  segmented: {
    backgroundColor: theme.colors.surfaceSoft,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    padding: 4,
  },
  targetSegmented: {
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    padding: 5,
  },
  targetButton: {
    alignItems: "center",
    borderRadius: theme.radius.md,
    flex: 1,
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  segmentButton: {
    alignItems: "center",
    borderRadius: theme.radius.pill,
    flex: 1,
    height: 40,
    justifyContent: "center",
  },
  segmentButtonActive: {
    backgroundColor: theme.colors.coral,
  },
  segmentText: {
    color: theme.colors.textSoft,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 17,
  },
  segmentTextActive: {
    color: theme.colors.white,
  },
  groupPickerScroll: {
    height: 58,
    maxHeight: 58,
  },
  inlineGroupPicker: {
    marginBottom: 2,
  },
  groupPickerContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    paddingVertical: 2,
  },
  groupChoice: {
    alignItems: "center",
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    height: 52,
    maxWidth: 210,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  groupChoiceSelected: {
    backgroundColor: theme.colors.coralSoft,
    borderColor: theme.colors.coral,
  },
  groupChoiceAvatar: {
    backgroundColor: theme.colors.surfaceSoft,
    borderRadius: theme.radius.pill,
    height: 34,
    width: 34,
  },
  groupChoiceAvatarFallback: {
    alignItems: "center",
    backgroundColor: theme.colors.coralSoft,
    borderRadius: theme.radius.pill,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  groupChoiceInitial: {
    color: theme.colors.coral,
    fontSize: 13,
    fontWeight: "900",
  },
  groupChoiceTextBlock: {
    maxWidth: 140,
    minWidth: 0,
  },
  groupChoiceName: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 16,
  },
  groupPickerState: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  groupPickerStateText: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
  editQuickControls: {
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    gap: 10,
    padding: 10,
  },
  stepMenu: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  stepMenuButton: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceSoft,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexGrow: 1,
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  stepMenuButtonActive: {
    backgroundColor: theme.colors.coralSoft,
    borderColor: theme.colors.coral,
  },
  stepMenuText: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 16,
  },
  stepMenuTextActive: {
    color: theme.colors.text,
  },
  quickSaveButton: {
    alignItems: "center",
    backgroundColor: theme.colors.text,
    borderRadius: theme.radius.pill,
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  quickSaveButtonText: {
    color: theme.colors.white,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 18,
  },
  visitedScroll: {
    maxHeight: 470,
  },
  stepArea: {
    gap: 14,
  },
  stepHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  stepBackButton: {
    alignItems: "center",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    height: 36,
    paddingHorizontal: 10,
  },
  stepBackText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "900",
  },
  stepTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 23,
  },
  chipCloud: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  searchableChips: {
    gap: 9,
  },
  optionSearchInput: {
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "700",
    height: 46,
    paddingHorizontal: 14,
  },
  chipScroll: {
    maxHeight: 148,
  },
  chip: {
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
  photoArea: {
    gap: 8,
  },
  photoButton: {
    alignItems: "center",
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    height: 48,
    justifyContent: "center",
  },
  photoButtonText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "900",
  },
  photoRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  photoPreview: {
    backgroundColor: theme.colors.surfaceSoft,
    borderRadius: theme.radius.md,
    height: 54,
    width: 54,
  },
  photoCaptionInput: {
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    color: theme.colors.text,
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    height: 48,
    paddingHorizontal: 12,
  },
  ratingBlock: {
    gap: 8,
  },
  fieldLabel: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 17,
  },
  ratingSlider: {
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.pill,
    height: 44,
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
    width: 280,
  },
  ratingFill: {
    backgroundColor: theme.colors.coral,
    bottom: 0,
    left: 0,
    opacity: 0.18,
    position: "absolute",
    top: 0,
  },
  ratingBubbles: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 10,
  },
  ratingBubble: {
    backgroundColor: theme.colors.surfaceSoft,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 10,
    width: 10,
  },
  ratingBubbleSelected: {
    backgroundColor: theme.colors.coral,
    borderColor: theme.colors.coral,
  },
  textArea: {
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "600",
    minHeight: 96,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: "top",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: theme.colors.text,
    borderRadius: theme.radius.pill,
    height: 50,
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: theme.colors.white,
    fontSize: 14,
    fontWeight: "900",
  },
  disabledButton: {
    opacity: 0.62,
  },
  buttonPressed: {
    opacity: 0.74,
    transform: [{ scale: 0.99 }],
  },
  successText: {
    color: "#167245",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
});
