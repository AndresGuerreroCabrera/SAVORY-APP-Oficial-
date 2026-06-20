import type { Session } from "@supabase/supabase-js";
import { ArrowLeft, LockKeyhole, LogOut, Mail, ShieldCheck, UserRound } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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

const UserIcon = UserRound as SavoryIconGlyph;
const MailIcon = Mail as SavoryIconGlyph;
const LockIcon = LockKeyhole as SavoryIconGlyph;
const ShieldIcon = ShieldCheck as SavoryIconGlyph;
const LogoutIcon = LogOut as SavoryIconGlyph;
const BackIcon = ArrowLeft as SavoryIconGlyph;

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

export function ProfileScreen() {
  const { width: viewportWidth } = useWindowDimensions();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingSession, setLoadingSession] = useState(true);
  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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

  const resetFeedback = useCallback(() => {
    setError(null);
    setMessage(null);
  }, []);

  const resetAuthFields = useCallback(() => {
    setPassword("");
    setConfirmPassword("");
  }, []);

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
    setMessage("Te hemos enviado un correo de confirmación. Abre tu email y confirma la cuenta para poder iniciar sesión.");
  }, [confirmPassword, email, password, resetAuthFields, resetFeedback, username]);

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
                <View style={styles.identityRow}>
                  <View style={styles.avatar}>
                    <SavoryIcon color={theme.colors.coral} glyph={UserIcon} size={24} strokeWidth={2.3} />
                  </View>
                  <View style={styles.identityText}>
                    <Text style={styles.nameText}>{profileName}</Text>
                    <Text style={styles.emailText}>{session.user.email}</Text>
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
            ) : (
              <View style={styles.sectionGap}>
                <View style={styles.segmented}>
                  <ModeButton active={mode === "login"} label="Iniciar sesión" onPress={() => setMode("login")} />
                  <ModeButton active={mode === "register"} label="Registro" onPress={() => setMode("register")} />
                </View>

                {mode === "register" ? (
                  <AuthInput
                    autoCapitalize="none"
                    icon={UserIcon}
                    onChangeText={setUsername}
                    placeholder="Nombre de usuario"
                    value={username}
                  />
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
  sectionGap: {
    gap: 14,
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
    width: 54,
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
