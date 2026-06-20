import type { Session } from "@supabase/supabase-js";
import { useRouter } from "expo-router";
import { ArrowLeft, ChevronDown, LockKeyhole, LogOut, Mail, ShieldCheck, UserRound } from "lucide-react-native";
import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import type { TextStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BottomNav } from "../navigation/BottomNav";
import { SavoryIcon, type SavoryIconGlyph } from "../ui/SavoryIcon";
import { floatingShadow, theme } from "../../constants/theme";
import { isSupabaseConfigured, supabase } from "../../services/supabase";

type AuthMode = "login" | "register";
type UserProfile = {
  avatar_url: string | null;
  created_at: string;
  display_name: string | null;
  id: string;
  updated_at: string;
  username: string;
};
type SocialProfile = Pick<UserProfile, "avatar_url" | "display_name" | "id" | "username">;
type FriendshipStatus = "none" | "pending_sent" | "pending_received" | "friends";
type UserSearchResult = SocialProfile & {
  friendshipId?: string;
  friendshipStatus: FriendshipStatus;
};
type FriendshipRow = {
  id: string;
  receiver: SocialProfile | null;
  receiver_id: string;
  requester: SocialProfile | null;
  requester_id: string;
  status: "pending" | "accepted";
};
type ProfilePhoto = {
  dataUrl: string;
  fileName: string;
};

const UserIcon = UserRound as SavoryIconGlyph;
const MailIcon = Mail as SavoryIconGlyph;
const LockIcon = LockKeyhole as SavoryIconGlyph;
const ShieldIcon = ShieldCheck as SavoryIconGlyph;
const LogoutIcon = LogOut as SavoryIconGlyph;
const BackIcon = ArrowLeft as SavoryIconGlyph;
const ChevronIcon = ChevronDown as SavoryIconGlyph;

const webInputReset: TextStyle & {
  boxShadow?: string;
  caretColor?: string;
  cursor?: string;
  outline?: string;
} = {
  boxShadow: "none",
  caretColor: theme.colors.text,
  cursor: "text",
  outline: "none",
};
const inputPlatformStyle = Platform.OS === "web" ? webInputReset : null;
const MAX_PROFILE_PHOTO_BYTES = 650 * 1024;

export function ProfileScreen() {
  const { width: viewportWidth } = useWindowDimensions();
  const registerPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const profilePhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingSession, setLoadingSession] = useState(true);
  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [registrationAvatar, setRegistrationAvatar] = useState<ProfilePhoto | null>(null);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [nextUsername, setNextUsername] = useState("");
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const overlayWidth = Math.max(280, viewportWidth - 36);
  const contentWidth = Math.min(overlayWidth, 520);
  const navWidth = Math.min(overlayWidth, 430);
  const profileName = getDisplayName(session, profile);

  useEffect(() => {
    if (!supabase) {
      setLoadingSession(false);
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setLoadingSession(false);
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoadingSession(false);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase || !session) {
      setProfile(null);
      setLoadingProfile(false);
      return;
    }

    let active = true;
    const client = supabase;
    const currentSession = session;

    async function loadProfile() {
      setLoadingProfile(true);

      const { data, error: profileError } = await client
        .from("profiles")
        .select("id, username, display_name, avatar_url, created_at, updated_at")
        .eq("id", currentSession.user.id)
        .maybeSingle();

      if (!active) {
        return;
      }

      if (profileError) {
        setLoadingProfile(false);
        setError("No se pudo cargar tu perfil público.");
        return;
      }

      if (data) {
        setProfile(data);
        setLoadingProfile(false);
        return;
      }

      const { data: createdProfile, error: createProfileError } = await client
        .from("profiles")
        .insert({
          avatar_url: getMetadataAvatarUrl(currentSession),
          id: currentSession.user.id,
          username: getFallbackUsername(currentSession),
        })
        .select("id, username, display_name, avatar_url, created_at, updated_at")
        .single();

      if (!active) {
        return;
      }

      setLoadingProfile(false);

      if (createProfileError) {
        setError("Tu sesión existe, pero todavía no se pudo crear el perfil público.");
        return;
      }

      setProfile(createdProfile);
    }

    loadProfile();

    return () => {
      active = false;
    };
  }, [session]);

  useEffect(() => {
    setProfileMenuOpen(false);
    setShowPasswordChange(false);
  }, [session?.user.id]);

  useEffect(() => {
    setNextUsername(profile?.username ?? "");
  }, [profile?.username]);

  const resetFeedback = useCallback(() => {
    setError(null);
    setMessage(null);
  }, []);

  const resetAuthFields = useCallback(() => {
    setPassword("");
    setConfirmPassword("");
  }, []);

  const handleRegistrationPhotoPick = useCallback(
    async (fileList: FileList | null) => {
      resetFeedback();
      const result = await readProfilePhoto(fileList);

      if (result.error) {
        setError(result.error);
        return;
      }

      if (result.photo) {
        setRegistrationAvatar(result.photo);
      }
    },
    [resetFeedback],
  );

  const handleProfilePhotoPick = useCallback(
    async (fileList: FileList | null) => {
      resetFeedback();

      if (!supabase || !session) {
        setError("No hay una sesión válida para actualizar el perfil.");
        return;
      }

      const result = await readProfilePhoto(fileList);

      if (result.error) {
        setError(result.error);
        return;
      }

      if (!result.photo) {
        return;
      }

      setUpdatingProfile(true);
      const { data, error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: result.photo.dataUrl })
        .eq("id", session.user.id)
        .select("id, username, display_name, avatar_url, created_at, updated_at")
        .single();

      if (!updateError) {
        await supabase.auth.updateUser({
          data: {
            avatar_url: result.photo.dataUrl,
          },
        });
      }

      setUpdatingProfile(false);

      if (updateError) {
        setError("No se pudo actualizar la foto de perfil.");
        return;
      }

      setProfile(data);
      setMessage("Foto de perfil actualizada.");
    },
    [resetFeedback, session],
  );

  const handleUsernameUpdate = useCallback(async () => {
    resetFeedback();

    if (!supabase || !session) {
      setError("No hay una sesión válida para actualizar el perfil.");
      return;
    }

    const normalizedUsername = normalizeUsername(nextUsername);

    if (!normalizedUsername) {
      setError("El nombre de usuario debe tener entre 3 y 32 caracteres.");
      return;
    }

    if (normalizedUsername === profile?.username) {
      setMessage("Ese ya es tu nombre de usuario.");
      return;
    }

    setUpdatingProfile(true);
    const { data: existingProfile, error: lookupError } = await supabase
      .from("profiles")
      .select("id")
      .ilike("username", normalizedUsername)
      .neq("id", session.user.id)
      .maybeSingle();

    if (lookupError) {
      setUpdatingProfile(false);
      setError("No se pudo comprobar si el usuario está disponible.");
      return;
    }

    if (existingProfile) {
      setUpdatingProfile(false);
      setError("Ese nombre de usuario ya está ocupado.");
      return;
    }

    const { data, error: updateError } = await supabase
      .from("profiles")
      .update({ username: normalizedUsername })
      .eq("id", session.user.id)
      .select("id, username, display_name, avatar_url, created_at, updated_at")
      .single();

    if (!updateError) {
      await supabase.auth.updateUser({
        data: {
          username: normalizedUsername,
        },
      });
    }

    setUpdatingProfile(false);

    if (updateError) {
      setError("No se pudo cambiar el nombre de usuario. Puede que ya esté ocupado.");
      return;
    }

    setProfile(data);
    setNextUsername(data.username);
    setMessage("Nombre de usuario actualizado.");
  }, [nextUsername, profile?.username, resetFeedback, session]);

  const handleSignIn = useCallback(async () => {
    resetFeedback();

    if (!supabase) {
      setError("Supabase no está configurado.");
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!isValidEmail(normalizedEmail) || password.length < 1) {
      setError("Introduce un correo válido y tu contraseña.");
      return;
    }

    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    setSubmitting(false);
    resetAuthFields();

    if (signInError) {
      setError("No se pudo iniciar sesión. Revisa tus datos y confirma tu correo si acabas de registrarte.");
      return;
    }

    setMessage("Sesión iniciada.");
  }, [email, password, resetAuthFields, resetFeedback]);

  const handleSignUp = useCallback(async () => {
    resetFeedback();

    if (!supabase) {
      setError("Supabase no está configurado.");
      return;
    }

    const normalizedUsername = normalizeUsername(username);
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedUsername) {
      setError("El nombre de usuario debe tener entre 3 y 32 caracteres.");
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setError("Introduce un correo válido.");
      return;
    }

    if (!isStrongEnoughPassword(password)) {
      setError("La contraseña debe tener al menos 10 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setSubmitting(true);
    const { error: signUpError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          avatar_url: registrationAvatar?.dataUrl ?? null,
          username: normalizedUsername,
        },
        emailRedirectTo: getEmailRedirectUrl(),
      },
    });
    setSubmitting(false);
    resetAuthFields();

    if (signUpError) {
      setError("No se pudo crear la cuenta. Revisa los datos o inténtalo más tarde.");
      return;
    }

    setUsername("");
    setRegistrationAvatar(null);
    setMessage("Te hemos enviado un correo de confirmación. Abre tu email y confirma la cuenta para poder iniciar sesión.");
  }, [confirmPassword, email, password, registrationAvatar, resetAuthFields, resetFeedback, username]);

  const handlePasswordChange = useCallback(async () => {
    resetFeedback();

    if (!supabase || !session?.user.email) {
      setError("No hay una sesión válida para cambiar la contraseña.");
      return;
    }

    if (!oldPassword || !isStrongEnoughPassword(newPassword)) {
      setError("Completa la contraseña antigua y usa una nueva contraseña de al menos 10 caracteres.");
      return;
    }

    if (oldPassword === newPassword) {
      setError("La nueva contraseña debe ser distinta a la anterior.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError("La nueva contraseña y su confirmación no coinciden.");
      return;
    }

    setSubmitting(true);
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: session.user.email,
      password: oldPassword,
    });

    if (reauthError) {
      setSubmitting(false);
      setOldPassword("");
      setError("No se pudo verificar la contraseña antigua.");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });
    setSubmitting(false);
    setOldPassword("");
    setNewPassword("");
    setConfirmNewPassword("");

    if (updateError) {
      setError("No se pudo cambiar la contraseña. Inténtalo de nuevo.");
      return;
    }

    setShowPasswordChange(false);
    setMessage("Contraseña actualizada correctamente.");
  }, [confirmNewPassword, newPassword, oldPassword, resetFeedback, session]);

  const handleSignOut = useCallback(async () => {
    resetFeedback();

    if (!supabase) {
      return;
    }

    setSubmitting(true);
    await supabase.auth.signOut();
    setSubmitting(false);
    setProfileMenuOpen(false);
    setMessage("Sesión cerrada.");
  }, [resetFeedback]);

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: 118 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.header, { width: contentWidth }]}>
            <View style={styles.titleAccent} />
            <Text style={styles.title}>Perfil</Text>
          </View>

          <View style={[styles.panel, { width: contentWidth }]}>
            {!isSupabaseConfigured ? (
              <StatusBlock
                icon={ShieldIcon}
                text="Configura las variables EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
              />
            ) : loadingSession ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={theme.colors.coral} />
                <Text style={styles.helperText}>Cargando sesión</Text>
              </View>
            ) : session ? (
              <View style={styles.sectionGap}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: profileMenuOpen }}
                  onPress={() => setProfileMenuOpen((isOpen) => !isOpen)}
                  style={({ pressed }) => [styles.profileDisclosure, pressed && styles.buttonPressed]}
                >
                  <View style={styles.avatar}>
                    {profile?.avatar_url ? (
                      <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
                    ) : (
                      <SavoryIcon color={theme.colors.coral} glyph={UserIcon} size={24} strokeWidth={2.3} />
                    )}
                  </View>
                  <View style={styles.identityText}>
                    <Text style={styles.nameText}>{profileName}</Text>
                  </View>
                  <View style={[styles.chevron, profileMenuOpen && styles.chevronOpen]}>
                    <SavoryIcon color={theme.colors.text} glyph={ChevronIcon} size={20} strokeWidth={2.4} />
                  </View>
                </Pressable>

                {profileMenuOpen ? (
                  <View style={styles.profileDropdown}>
                    <Text numberOfLines={1} style={styles.emailText}>
                      {session.user.email}
                    </Text>

                <ProfilePhotoPicker
                  avatarUrl={profile?.avatar_url ?? null}
                  buttonLabel={profile?.avatar_url ? "Cambiar foto de perfil" : "Añadir foto de perfil"}
                  disabled={updatingProfile}
                  inputRef={profilePhotoInputRef}
                  onPick={handleProfilePhotoPick}
                />

                <View style={styles.usernameEditor}>
                  <Text style={styles.fieldLabel}>Nombre de usuario</Text>
                  <View style={styles.usernameEditorRow}>
                    <View style={[styles.inputShell, styles.usernameInputShell]}>
                      <SavoryIcon color={theme.colors.muted} glyph={UserIcon} size={18} strokeWidth={2.1} />
                      <TextInput
                        autoCapitalize="none"
                        autoCorrect={false}
                        onChangeText={setNextUsername}
                        placeholder="Nombre de usuario"
                        placeholderTextColor={theme.colors.faint}
                        selectionColor={theme.colors.text}
                        style={[styles.input, inputPlatformStyle]}
                        value={nextUsername}
                      />
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      disabled={updatingProfile}
                      onPress={handleUsernameUpdate}
                      style={({ pressed }) => [
                        styles.compactButton,
                        updatingProfile && styles.buttonDisabled,
                        pressed && styles.buttonPressed,
                      ]}
                    >
                      <Text style={styles.compactButtonText}>Guardar</Text>
                    </Pressable>
                  </View>
                </View>

                {loadingProfile ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color={theme.colors.coral} />
                    <Text style={styles.helperText}>Cargando perfil público</Text>
                  </View>
                ) : null}

                {!loadingProfile && !profile ? (
                  <StatusBlock
                    icon={ShieldIcon}
                    text="Tu usuario existe en Auth, pero falta crear la fila en public.profiles. Ejecuta la migración de perfiles en Supabase."
                  />
                ) : null}

                {!session.user.email_confirmed_at ? (
                  <StatusBlock
                    icon={MailIcon}
                    text="Tu correo todavía no está confirmado. Revisa tu bandeja de entrada antes de usar todas las funciones."
                  />
                ) : null}

                {message ? <Text style={styles.successText}>{message}</Text> : null}
                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    resetFeedback();
                    setShowPasswordChange(true);
                  }}
                  style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
                >
                  <Text style={styles.primaryButtonText}>Cambiar contraseña</Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  disabled={submitting}
                  onPress={handleSignOut}
                  style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
                >
                  <SavoryIcon color={theme.colors.text} glyph={LogoutIcon} size={18} strokeWidth={2.2} />
                  <Text style={styles.secondaryButtonText}>Cerrar sesión</Text>
                </Pressable>
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={styles.sectionGap}>
                <View style={styles.segmented}>
                  <ModeButton active={mode === "login"} label="Iniciar sesión" onPress={() => setMode("login")} />
                  <ModeButton active={mode === "register"} label="Registro" onPress={() => setMode("register")} />
                </View>

                {mode === "register" ? (
                  <>
                    <AuthInput
                      autoCapitalize="none"
                      icon={UserIcon}
                      onChangeText={setUsername}
                      placeholder="Nombre de usuario"
                      value={username}
                    />
                    <ProfilePhotoPicker
                      avatarUrl={registrationAvatar?.dataUrl ?? null}
                      buttonLabel={registrationAvatar ? "Cambiar foto de perfil" : "Añadir foto de perfil"}
                      disabled={submitting}
                      inputRef={registerPhotoInputRef}
                      onPick={handleRegistrationPhotoPick}
                    />
                  </>
                ) : null}

                <AuthInput
                  autoCapitalize="none"
                  autoComplete="email"
                  icon={MailIcon}
                  keyboardType="email-address"
                  onChangeText={setEmail}
                  placeholder="Correo"
                  value={email}
                />
                <AuthInput
                  autoComplete="password"
                  icon={LockIcon}
                  onChangeText={setPassword}
                  placeholder="Contraseña"
                  secureTextEntry
                  value={password}
                />
                {mode === "register" ? (
                  <AuthInput
                    autoComplete="password"
                    icon={LockIcon}
                    onChangeText={setConfirmPassword}
                    placeholder="Confirmar contraseña"
                    secureTextEntry
                    value={confirmPassword}
                  />
                ) : null}

                <StatusBlock
                  icon={ShieldIcon}
                  text={
                    mode === "register"
                      ? "Al registrarte recibirás un correo de confirmación. Debes confirmarlo desde tu cuenta de correo."
                      : "Si acabas de registrarte, confirma primero tu correo antes de iniciar sesión."
                  }
                />

                {message ? <Text style={styles.successText}>{message}</Text> : null}
                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                <Pressable
                  accessibilityRole="button"
                  disabled={submitting}
                  onPress={mode === "register" ? handleSignUp : handleSignIn}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    submitting && styles.buttonDisabled,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  {submitting ? (
                    <ActivityIndicator color={theme.colors.white} />
                  ) : (
                    <Text style={styles.primaryButtonText}>{mode === "register" ? "Crear cuenta" : "Entrar"}</Text>
                  )}
                </Pressable>
              </View>
            )}
          </View>

          {isSupabaseConfigured && session ? (
            <FriendsConnectorSection contentWidth={contentWidth} session={session} />
          ) : null}
        </ScrollView>
      </SafeAreaView>

      {showPasswordChange ? (
        <View style={styles.modalOverlay}>
          <Pressable
            accessibilityLabel="Cerrar cambio de contraseña"
            onPress={() => setShowPasswordChange(false)}
            style={styles.modalBackdrop}
          />
          <View style={[styles.passwordPanel, { width: contentWidth }]}>
            <View style={styles.modalHeader}>
              <Pressable
                accessibilityRole="button"
                hitSlop={10}
                onPress={() => setShowPasswordChange(false)}
                style={styles.backButton}
              >
                <SavoryIcon color={theme.colors.text} glyph={BackIcon} size={19} strokeWidth={2.2} />
              </Pressable>
              <Text style={styles.modalTitle}>Cambiar contraseña</Text>
            </View>
            <AuthInput
              autoComplete="password"
              icon={LockIcon}
              onChangeText={setOldPassword}
              placeholder="Contraseña antigua"
              secureTextEntry
              value={oldPassword}
            />
            <AuthInput
              autoComplete="new-password"
              icon={LockIcon}
              onChangeText={setNewPassword}
              placeholder="Nueva contraseña"
              secureTextEntry
              value={newPassword}
            />
            <AuthInput
              autoComplete="new-password"
              icon={LockIcon}
              onChangeText={setConfirmNewPassword}
              placeholder="Confirmar nueva contraseña"
              secureTextEntry
              value={confirmNewPassword}
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <Pressable
              accessibilityRole="button"
              disabled={submitting}
              onPress={handlePasswordChange}
              style={({ pressed }) => [
                styles.primaryButton,
                submitting && styles.buttonDisabled,
                pressed && styles.buttonPressed,
              ]}
            >
              {submitting ? (
                <ActivityIndicator color={theme.colors.white} />
              ) : (
                <Text style={styles.primaryButtonText}>Guardar nueva contraseña</Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}

      <View pointerEvents="box-none" style={styles.bottomNav}>
        <BottomNav width={navWidth} />
      </View>
    </View>
  );
}

type ModeButtonProps = {
  active: boolean;
  label: string;
  onPress: () => void;
};

function ModeButton({ active, label, onPress }: ModeButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.modeButton, active && styles.modeButtonActive, pressed && styles.buttonPressed]}
    >
      <Text style={[styles.modeButtonText, active && styles.modeButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

type AuthInputProps = {
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoComplete?: "email" | "password" | "new-password";
  icon: SavoryIconGlyph;
  keyboardType?: "default" | "email-address";
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  value: string;
};

function AuthInput({
  autoCapitalize = "sentences",
  autoComplete,
  icon,
  keyboardType = "default",
  onChangeText,
  placeholder,
  secureTextEntry,
  value,
}: AuthInputProps) {
  return (
    <View style={styles.inputShell}>
      <SavoryIcon color={theme.colors.muted} glyph={icon} size={18} strokeWidth={2.1} />
      <TextInput
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        autoCorrect={false}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.faint}
        secureTextEntry={secureTextEntry}
        selectionColor={theme.colors.text}
        style={[styles.input, inputPlatformStyle]}
        value={value}
      />
    </View>
  );
}

type ProfilePhotoPickerProps = {
  avatarUrl: string | null;
  buttonLabel: string;
  disabled?: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onPick: (fileList: FileList | null) => void;
};

function ProfilePhotoPicker({ avatarUrl, buttonLabel, disabled, inputRef, onPick }: ProfilePhotoPickerProps) {
  return (
    <View style={styles.photoPicker}>
      <View style={styles.photoPreview}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.photoPreviewImage} />
        ) : (
          <SavoryIcon color={theme.colors.coral} glyph={UserIcon} size={22} strokeWidth={2.2} />
        )}
      </View>
      <View style={styles.photoPickerContent}>
        <Pressable
          accessibilityRole="button"
          disabled={disabled || Platform.OS !== "web"}
          onPress={() => inputRef.current?.click()}
          style={({ pressed }) => [
            styles.photoButton,
            (disabled || Platform.OS !== "web") && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.photoButtonText}>{buttonLabel}</Text>
        </Pressable>
        <Text style={styles.photoHelper}>JPG, PNG o WebP. Máximo 650 KB.</Text>
      </View>
      {Platform.OS === "web" ? (
        <input
          ref={inputRef}
          accept="image/jpeg,image/png,image/webp"
          style={{ display: "none" }}
          type="file"
          onChange={(event) => {
            onPick(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
        />
      ) : null}
    </View>
  );
}

type StatusBlockProps = {
  icon: SavoryIconGlyph;
  text: string;
};

function StatusBlock({ icon, text }: StatusBlockProps) {
  return (
    <View style={styles.statusBlock}>
      <SavoryIcon color={theme.colors.coral} glyph={icon} size={18} strokeWidth={2.2} />
      <Text style={styles.statusText}>{text}</Text>
    </View>
  );
}

type FriendsConnectorSectionProps = {
  contentWidth: number;
  session: Session;
};

function FriendsConnectorSection({ contentWidth, session }: FriendsConnectorSectionProps) {
  const router = useRouter();
  const currentUserId = session.user.id;
  const [friendships, setFriendships] = useState<FriendshipRow[]>([]);
  const [friends, setFriends] = useState<SocialProfile[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendshipRow[]>([]);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [loadingSocial, setLoadingSocial] = useState(false);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [pendingFriendActionId, setPendingFriendActionId] = useState<string | null>(null);
  const [socialMessage, setSocialMessage] = useState<string | null>(null);
  const [socialError, setSocialError] = useState<string | null>(null);

  const loadFriendships = useCallback(async () => {
    if (!supabase) {
      return;
    }

    setLoadingSocial(true);
    const { data, error: friendshipsError } = await supabase
      .from("friendships")
      .select(
        "id, requester_id, receiver_id, status, requester:profiles!friendships_requester_id_fkey(id, username, display_name, avatar_url), receiver:profiles!friendships_receiver_id_fkey(id, username, display_name, avatar_url)",
      )
      .or(`requester_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`);

    setLoadingSocial(false);

    if (friendshipsError) {
      setSocialError("No se pudieron cargar tus amistades. Revisa que la migración de friendships esté aplicada.");
      return;
    }

    const nextFriendships = (data ?? [])
      .map(normalizeFriendshipRow)
      .filter((row): row is FriendshipRow => Boolean(row));

    setFriendships(nextFriendships);
    setIncomingRequests(
      nextFriendships.filter((row) => row.status === "pending" && row.receiver_id === currentUserId),
    );
    setFriends(
      nextFriendships
        .filter((row) => row.status === "accepted")
        .map((row) => (row.requester_id === currentUserId ? row.receiver : row.requester))
        .filter((profile): profile is SocialProfile => Boolean(profile)),
    );
  }, [currentUserId]);

  useEffect(() => {
    void loadFriendships();
  }, [loadFriendships]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const client = supabase;
    const channelName = `friendships-${currentUserId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = client
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships", filter: `requester_id=eq.${currentUserId}` },
        () => {
          void loadFriendships();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships", filter: `receiver_id=eq.${currentUserId}` },
        () => {
          void loadFriendships();
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [currentUserId, loadFriendships]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const client = supabase;
    const normalizedQuery = normalizeFriendSearch(searchText);

    if (normalizedQuery.length < 2) {
      setSearchResults([]);
      setSearchingUsers(false);
      return;
    }

    let active = true;
    setSearchingUsers(true);

    const timeout = setTimeout(async () => {
      const { data, error: searchError } = await client
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .ilike("username", `${normalizedQuery}%`)
        .neq("id", currentUserId)
        .order("username", { ascending: true })
        .limit(8);

      if (!active) {
        return;
      }

      setSearchingUsers(false);

      if (searchError) {
        setSearchResults([]);
        setSocialError("No se pudo buscar usuarios ahora mismo.");
        return;
      }

      const nextResults = (data ?? [])
        .map(normalizeSocialProfile)
        .filter((profile): profile is SocialProfile => Boolean(profile))
        .map((profile) => {
          const relationship = getFriendshipStatus(currentUserId, profile.id, friendships);

          return {
            ...profile,
            friendshipId: relationship.friendshipId,
            friendshipStatus: relationship.status,
          };
        });

      setSearchResults(nextResults);
    }, 240);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [currentUserId, friendships, searchText]);

  const resetSocialFeedback = useCallback(() => {
    setSocialError(null);
    setSocialMessage(null);
  }, []);

  const handleRequestFriend = useCallback(
    async (target: SocialProfile) => {
      if (!supabase) {
        return;
      }

      resetSocialFeedback();
      setPendingFriendActionId(target.id);

      const { error: requestError } = await supabase.from("friendships").insert({
        requester_id: currentUserId,
        receiver_id: target.id,
        status: "pending",
      });

      setPendingFriendActionId(null);

      if (requestError) {
        setSocialError("No se pudo enviar la solicitud. Puede que ya exista una relación con ese usuario.");
        return;
      }

      setSocialMessage("Solicitud enviada.");
      await loadFriendships();
    },
    [currentUserId, loadFriendships, resetSocialFeedback],
  );

  const handleAcceptRequest = useCallback(
    async (friendshipId: string) => {
      if (!supabase) {
        return;
      }

      resetSocialFeedback();
      setPendingFriendActionId(friendshipId);

      const { error: acceptError } = await supabase
        .from("friendships")
        .update({ status: "accepted" })
        .eq("id", friendshipId)
        .eq("receiver_id", currentUserId);

      setPendingFriendActionId(null);

      if (acceptError) {
        setSocialError("No se pudo aceptar la solicitud.");
        return;
      }

      setSocialMessage("Ahora sois amigos.");
      await loadFriendships();
    },
    [currentUserId, loadFriendships, resetSocialFeedback],
  );

  const handleRejectRequest = useCallback(
    async (friendshipId: string) => {
      if (!supabase) {
        return;
      }

      resetSocialFeedback();
      setPendingFriendActionId(friendshipId);

      const { error: rejectError } = await supabase
        .from("friendships")
        .delete()
        .eq("id", friendshipId)
        .eq("receiver_id", currentUserId);

      setPendingFriendActionId(null);

      if (rejectError) {
        setSocialError("No se pudo rechazar la solicitud.");
        return;
      }

      await loadFriendships();
    },
    [currentUserId, loadFriendships, resetSocialFeedback],
  );

  const hasSearchQuery = normalizeFriendSearch(searchText).length >= 2;

  return (
    <View style={[styles.panel, styles.friendsPanel, { width: contentWidth }]}>
      <Text style={styles.sectionTitle}>Conectar con amigos</Text>

      <View style={styles.friendSearchRow}>
        <View style={[styles.inputShell, styles.friendSearchInput]}>
          <SavoryIcon color={theme.colors.muted} glyph={UserIcon} size={18} strokeWidth={2.1} />
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setSearchText}
            placeholder="Buscar nombre de usuario"
            placeholderTextColor={theme.colors.faint}
            selectionColor={theme.colors.text}
            style={[styles.input, inputPlatformStyle]}
            value={searchText}
          />
        </View>

        <Pressable
          accessibilityLabel="Abrir bandeja de solicitudes"
          accessibilityRole="button"
          accessibilityState={{ expanded: inboxOpen }}
          onPress={() => setInboxOpen((isOpen) => !isOpen)}
          style={({ pressed }) => [styles.inboxButton, inboxOpen && styles.inboxButtonActive, pressed && styles.buttonPressed]}
        >
          <SavoryIcon color={inboxOpen ? theme.colors.coral : theme.colors.text} glyph={MailIcon} size={22} strokeWidth={2.2} />
          {incomingRequests.length > 0 ? (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>{incomingRequests.length > 9 ? "9+" : incomingRequests.length}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      {inboxOpen ? (
        <View style={styles.inboxArea}>
          {incomingRequests.length > 0 ? (
            incomingRequests.map((request) => {
              const requester = request.requester;

              if (!requester) {
                return null;
              }

              return (
                <View key={request.id} style={styles.socialRow}>
                  <UserChip onPress={() => router.push(`/users/${requester.id}` as never)} profile={requester} />
                  <View style={styles.requestActions}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={pendingFriendActionId === request.id}
                      onPress={() => handleAcceptRequest(request.id)}
                      style={({ pressed }) => [
                        styles.tinyPrimaryButton,
                        pendingFriendActionId === request.id && styles.buttonDisabled,
                        pressed && styles.buttonPressed,
                      ]}
                    >
                      <Text style={styles.tinyPrimaryButtonText}>Aceptar</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={pendingFriendActionId === request.id}
                      onPress={() => handleRejectRequest(request.id)}
                      style={({ pressed }) => [
                        styles.tinySecondaryButton,
                        pendingFriendActionId === request.id && styles.buttonDisabled,
                        pressed && styles.buttonPressed,
                      ]}
                    >
                      <Text style={styles.tinySecondaryButtonText}>Rechazar</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={styles.emptyText}>No tienes solicitudes pendientes.</Text>
          )}
        </View>
      ) : null}

      {hasSearchQuery ? (
        <View style={styles.searchResultsArea}>
          {searchingUsers ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={theme.colors.coral} />
              <Text style={styles.helperText}>Buscando usuarios</Text>
            </View>
          ) : searchResults.length > 0 ? (
            <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled style={styles.userResultsScroll}>
              {searchResults.map((result) => {
                const isDisabled =
                  result.friendshipStatus === "friends" ||
                  result.friendshipStatus === "pending_sent" ||
                  pendingFriendActionId === result.id;
                const isResponder = result.friendshipStatus === "pending_received";

                return (
                  <View key={result.id} style={styles.socialRow}>
                    <UserChip onPress={() => router.push(`/users/${result.id}` as never)} profile={result} />
                    <Pressable
                      accessibilityRole="button"
                      disabled={isDisabled}
                      onPress={() => {
                        if (isResponder) {
                          setInboxOpen(true);
                          return;
                        }

                        void handleRequestFriend(result);
                      }}
                      style={({ pressed }) => [
                        styles.friendActionButton,
                        (isDisabled || isResponder) && styles.friendActionButtonMuted,
                        pressed && styles.buttonPressed,
                      ]}
                    >
                      <Text style={[styles.friendActionButtonText, (isDisabled || isResponder) && styles.friendActionButtonTextMuted]}>
                        {getFriendshipButtonLabel(result.friendshipStatus)}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
          ) : (
            <Text style={styles.emptyText}>No se encontraron usuarios.</Text>
          )}
        </View>
      ) : null}

      {socialMessage ? <Text style={styles.successText}>{socialMessage}</Text> : null}
      {socialError ? <Text style={styles.errorText}>{socialError}</Text> : null}

      <View style={styles.friendsListHeader}>
        <Text style={styles.sectionSubtitle}>Tus amigos</Text>
      </View>

      {loadingSocial ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={theme.colors.coral} />
          <Text style={styles.helperText}>Cargando amigos</Text>
        </View>
      ) : friends.length > 0 ? (
        <ScrollView nestedScrollEnabled style={styles.friendsScroll}>
          {friends.map((friend) => (
            <View key={friend.id} style={styles.friendRow}>
              <UserChip onPress={() => router.push(`/users/${friend.id}` as never)} profile={friend} />
            </View>
          ))}
        </ScrollView>
      ) : (
        <Text style={styles.emptyText}>Todavía no tienes amigos añadidos.</Text>
      )}
    </View>
  );
}

type UserChipProps = {
  onPress?: () => void;
  profile: SocialProfile;
};

function UserChip({ onPress, profile }: UserChipProps) {
  const content = (
    <View style={styles.userChip}>
      <View style={styles.userMiniAvatar}>
        {profile.avatar_url ? (
          <Image source={{ uri: profile.avatar_url }} style={styles.userMiniAvatarImage} />
        ) : (
          <SavoryIcon color={theme.colors.coral} glyph={UserIcon} size={18} strokeWidth={2.2} />
        )}
      </View>
      <Text numberOfLines={1} style={styles.userChipName}>
        {profile.username}
      </Text>
    </View>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.userChipButton, pressed && styles.buttonPressed]}>
      {content}
    </Pressable>
  );
}

function normalizeSocialProfile(value: unknown): SocialProfile | null {
  const profile = Array.isArray(value) ? value[0] : value;

  if (!profile || typeof profile !== "object") {
    return null;
  }

  const record = profile as Partial<SocialProfile>;

  if (typeof record.id !== "string" || typeof record.username !== "string") {
    return null;
  }

  return {
    avatar_url: typeof record.avatar_url === "string" ? record.avatar_url : null,
    display_name: typeof record.display_name === "string" ? record.display_name : null,
    id: record.id,
    username: record.username,
  };
}

function normalizeFriendshipRow(value: unknown): FriendshipRow | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Partial<FriendshipRow> & {
    receiver?: unknown;
    requester?: unknown;
  };

  if (
    typeof record.id !== "string" ||
    typeof record.requester_id !== "string" ||
    typeof record.receiver_id !== "string" ||
    (record.status !== "pending" && record.status !== "accepted")
  ) {
    return null;
  }

  return {
    id: record.id,
    receiver: normalizeSocialProfile(record.receiver),
    receiver_id: record.receiver_id,
    requester: normalizeSocialProfile(record.requester),
    requester_id: record.requester_id,
    status: record.status,
  };
}

function getFriendshipStatus(
  currentUserId: string,
  targetUserId: string,
  friendships: FriendshipRow[],
): { friendshipId?: string; status: FriendshipStatus } {
  const friendship = friendships.find(
    (row) =>
      (row.requester_id === currentUserId && row.receiver_id === targetUserId) ||
      (row.receiver_id === currentUserId && row.requester_id === targetUserId),
  );

  if (!friendship) {
    return { status: "none" };
  }

  if (friendship.status === "accepted") {
    return { friendshipId: friendship.id, status: "friends" };
  }

  return {
    friendshipId: friendship.id,
    status: friendship.requester_id === currentUserId ? "pending_sent" : "pending_received",
  };
}

function getFriendshipButtonLabel(status: FriendshipStatus) {
  if (status === "friends") {
    return "Amigos";
  }

  if (status === "pending_sent") {
    return "Enviada";
  }

  if (status === "pending_received") {
    return "Responder";
  }

  return "Solicitar";
}

function normalizeFriendSearch(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 32);
}

async function readProfilePhoto(fileList: FileList | null): Promise<{ error?: string; photo?: ProfilePhoto }> {
  const file = fileList?.[0];

  if (!file) {
    return {};
  }

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return { error: "La foto debe ser JPG, PNG o WebP." };
  }

  if (file.size > MAX_PROFILE_PHOTO_BYTES) {
    return { error: "La foto debe pesar menos de 650 KB." };
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("invalid-image"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("image-read-failed"));
    reader.readAsDataURL(file);
  });

  return {
    photo: {
      dataUrl,
      fileName: file.name,
    },
  };
}

function getDisplayName(session: Session | null, profile: UserProfile | null) {
  if (profile?.display_name?.trim()) {
    return profile.display_name.trim();
  }

  if (profile?.username?.trim()) {
    return profile.username.trim();
  }

  const username = session?.user.user_metadata?.username;

  if (typeof username === "string" && username.trim()) {
    return username.trim();
  }

  return session?.user.email?.split("@")[0] ?? "Usuario";
}

function getMetadataAvatarUrl(session: Session) {
  const avatarUrl = session.user.user_metadata?.avatar_url;
  return typeof avatarUrl === "string" && avatarUrl.startsWith("data:image/") ? avatarUrl : null;
}

function getFallbackUsername(session: Session) {
  const metadataUsername = session.user.user_metadata?.username;

  if (typeof metadataUsername === "string") {
    const normalizedUsername = normalizeUsername(metadataUsername);

    if (normalizedUsername) {
      return normalizedUsername;
    }
  }

  return `usuario_${session.user.id.replace(/-/g, "").slice(0, 8)}`;
}

function normalizeUsername(value: string) {
  const trimmed = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);

  if (trimmed.length < 3) {
    return "";
  }

  return trimmed;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isStrongEnoughPassword(value: string) {
  return value.length >= 10;
}

function getEmailRedirectUrl() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return `${window.location.origin}/profile`;
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 22,
  },
  header: {
    gap: 8,
    marginBottom: 18,
  },
  titleAccent: {
    backgroundColor: theme.colors.coral,
    borderRadius: theme.radius.pill,
    height: 4,
    width: 34,
  },
  title: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 34,
  },
  panel: {
    ...floatingShadow,
    backgroundColor: theme.colors.surfaceGlass,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    padding: 18,
  },
  friendsPanel: {
    gap: 14,
    marginTop: 14,
  },
  sectionGap: {
    gap: 14,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 25,
  },
  sectionSubtitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20,
  },
  friendSearchRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  friendSearchInput: {
    flex: 1,
  },
  inboxButton: {
    alignItems: "center",
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    height: 56,
    justifyContent: "center",
    position: "relative",
    width: 56,
  },
  inboxButtonActive: {
    backgroundColor: theme.colors.coralSoft,
    borderColor: "#FFDAD5",
  },
  notificationBadge: {
    alignItems: "center",
    backgroundColor: theme.colors.danger,
    borderColor: theme.colors.white,
    borderRadius: theme.radius.pill,
    borderWidth: 2,
    height: 20,
    justifyContent: "center",
    minWidth: 20,
    paddingHorizontal: 4,
    position: "absolute",
    right: -4,
    top: -5,
  },
  notificationBadgeText: {
    color: theme.colors.white,
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 14,
  },
  inboxArea: {
    borderColor: theme.colors.border,
    borderTopWidth: 1,
    gap: 10,
    paddingTop: 12,
  },
  searchResultsArea: {
    borderColor: theme.colors.border,
    borderTopWidth: 1,
    paddingTop: 12,
  },
  userResultsScroll: {
    maxHeight: 232,
  },
  socialRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 58,
    paddingVertical: 6,
  },
  requestActions: {
    flexDirection: "row",
    gap: 6,
  },
  userChip: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minWidth: 0,
  },
  userChipButton: {
    borderRadius: theme.radius.lg,
    flex: 1,
    minWidth: 0,
  },
  userMiniAvatar: {
    alignItems: "center",
    backgroundColor: theme.colors.coralSoft,
    borderRadius: theme.radius.pill,
    height: 38,
    justifyContent: "center",
    overflow: "hidden",
    width: 38,
  },
  userMiniAvatarImage: {
    height: "100%",
    width: "100%",
  },
  userChipName: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 18,
    minWidth: 0,
  },
  friendActionButton: {
    alignItems: "center",
    backgroundColor: theme.colors.coral,
    borderRadius: theme.radius.pill,
    height: 36,
    justifyContent: "center",
    minWidth: 92,
    paddingHorizontal: 13,
  },
  friendActionButtonMuted: {
    backgroundColor: theme.colors.surfaceSoft,
    borderColor: theme.colors.border,
    borderWidth: 1,
  },
  friendActionButtonText: {
    color: theme.colors.white,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 16,
  },
  friendActionButtonTextMuted: {
    color: theme.colors.textSoft,
  },
  tinyPrimaryButton: {
    alignItems: "center",
    backgroundColor: theme.colors.coral,
    borderRadius: theme.radius.pill,
    height: 34,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  tinyPrimaryButtonText: {
    color: theme.colors.white,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 16,
  },
  tinySecondaryButton: {
    alignItems: "center",
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  tinySecondaryButtonText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 16,
  },
  friendsListHeader: {
    borderColor: theme.colors.border,
    borderTopWidth: 1,
    paddingTop: 12,
  },
  friendsScroll: {
    maxHeight: 210,
  },
  friendRow: {
    minHeight: 52,
    paddingVertical: 7,
  },
  emptyText: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: "700",
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
  modeButton: {
    alignItems: "center",
    borderRadius: theme.radius.pill,
    flex: 1,
    height: 42,
    justifyContent: "center",
  },
  modeButtonActive: {
    backgroundColor: theme.colors.white,
  },
  modeButtonText: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
  },
  modeButtonTextActive: {
    color: theme.colors.text,
  },
  inputShell: {
    alignItems: "center",
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    height: 56,
    paddingHorizontal: 16,
  },
  input: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    height: "100%",
    minWidth: 0,
  },
  photoPicker: {
    alignItems: "center",
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 12,
  },
  photoPreview: {
    alignItems: "center",
    backgroundColor: theme.colors.coralSoft,
    borderRadius: theme.radius.pill,
    height: 50,
    justifyContent: "center",
    overflow: "hidden",
    width: 50,
  },
  photoPreviewImage: {
    height: "100%",
    width: "100%",
  },
  photoPickerContent: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  photoButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: theme.colors.coral,
    borderRadius: theme.radius.pill,
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  photoButtonText: {
    color: theme.colors.white,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 17,
  },
  photoHelper: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
  usernameEditor: {
    gap: 7,
  },
  usernameEditorRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  usernameInputShell: {
    flex: 1,
    minWidth: 0,
  },
  fieldLabel: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17,
  },
  compactButton: {
    alignItems: "center",
    backgroundColor: theme.colors.text,
    borderRadius: theme.radius.pill,
    height: 44,
    justifyContent: "center",
    paddingHorizontal: 13,
  },
  compactButtonText: {
    color: theme.colors.white,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 17,
  },
  statusBlock: {
    alignItems: "flex-start",
    backgroundColor: theme.colors.coralSoft,
    borderColor: "#FFDAD5",
    borderRadius: theme.radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  statusText: {
    color: theme.colors.textSoft,
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  successText: {
    color: "#167245",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: theme.colors.text,
    borderRadius: theme.radius.pill,
    height: 52,
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: theme.colors.white,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20,
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    height: 50,
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 18,
  },
  buttonDisabled: {
    opacity: 0.62,
  },
  buttonPressed: {
    opacity: 0.74,
    transform: [{ scale: 0.99 }],
  },
  loadingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  helperText: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18,
  },
  profileDisclosure: {
    alignItems: "center",
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 68,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  profileDropdown: {
    gap: 14,
  },
  chevron: {
    alignItems: "center",
    borderRadius: theme.radius.pill,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  chevronOpen: {
    transform: [{ rotate: "180deg" }],
  },
  identityRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: theme.colors.coralSoft,
    borderRadius: theme.radius.pill,
    height: 54,
    justifyContent: "center",
    overflow: "hidden",
    width: 54,
  },
  avatarImage: {
    height: "100%",
    width: "100%",
  },
  identityText: {
    flex: 1,
    minWidth: 0,
  },
  nameText: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 25,
  },
  emailText: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
    marginTop: 2,
  },
  bottomNav: {
    alignItems: "center",
    bottom: 22,
    left: 18,
    position: "absolute",
    right: 18,
  },
  modalOverlay: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    paddingHorizontal: 18,
    position: "absolute",
    right: 0,
    top: 0,
  },
  modalBackdrop: {
    backgroundColor: "rgba(17, 18, 20, 0.24)",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  passwordPanel: {
    ...floatingShadow,
    backgroundColor: theme.colors.surfaceGlass,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    gap: 12,
    padding: 18,
  },
  modalHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginBottom: 2,
  },
  modalTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 25,
  },
  backButton: {
    alignItems: "center",
    borderRadius: theme.radius.pill,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
});
