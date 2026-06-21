import { useRouter } from "expo-router";
import { Search, Trophy, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { TextStyle } from "react-native";

import { floatingShadow, theme } from "../../constants/theme";
import {
  getCurrentUserSavoryScore,
  getSavoryScoreLevel,
  getSavoryScoreRanking,
  type SavoryScoreProfile,
} from "../../services/savoryScore";
import { SavoryIcon, type SavoryIconGlyph } from "../ui/SavoryIcon";

type SavoryScoreSectionProps = {
  contentWidth: number;
  currentUserId: string;
};

const CloseIcon = X as SavoryIconGlyph;
const SearchIcon = Search as SavoryIconGlyph;
const TrophyIcon = Trophy as SavoryIconGlyph;

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

export function SavoryScoreSection({ contentWidth, currentUserId }: SavoryScoreSectionProps) {
  const router = useRouter();
  const [currentScore, setCurrentScore] = useState<SavoryScoreProfile | null>(null);
  const [ranking, setRanking] = useState<SavoryScoreProfile[]>([]);
  const [fullRanking, setFullRanking] = useState<SavoryScoreProfile[]>([]);
  const [query, setQuery] = useState("");
  const [rankingOpen, setRankingOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadScore = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [scoreResult, rankingResult] = await Promise.all([
      getCurrentUserSavoryScore(currentUserId),
      getSavoryScoreRanking({ limit: 12 }),
    ]);

    if (scoreResult.error || rankingResult.error) {
      setError(scoreResult.error?.message ?? rankingResult.error?.message ?? "No se pudo cargar Savory Score.");
    } else {
      setCurrentScore(scoreResult.data);
      setRanking(rankingResult.data);
    }

    setLoading(false);
  }, [currentUserId]);

  useEffect(() => {
    void loadScore();
  }, [loadScore]);

  useEffect(() => {
    if (!rankingOpen) {
      return;
    }

    let active = true;
    setRankingLoading(true);

    const timeout = setTimeout(async () => {
      const { data, error: rankingError } = await getSavoryScoreRanking({ limit: 1000, query });

      if (!active) {
        return;
      }

      setFullRanking(data);
      setError(rankingError?.message ?? null);
      setRankingLoading(false);
    }, 180);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [query, rankingOpen]);

  const displayScore = currentScore ?? buildEmptyScore(currentUserId);
  const nextLabel =
    displayScore.level.pointsToNext === null || displayScore.level.pointsToNext <= 0
      ? "Ya estas en el siguiente nivel."
      : `Te quedan ${displayScore.level.pointsToNext} puntos para el siguiente nivel.`;
  const progress = getLevelProgress(displayScore.score, displayScore.level);

  const openUser = (profileId: string) => {
    setRankingOpen(false);
    router.push(`/users/${profileId}` as never);
  };

  return (
    <View style={[styles.panel, { width: contentWidth }]}>
      <View style={styles.headerRow}>
        <View style={styles.iconBubble}>
          <SavoryIcon color={theme.colors.coral} glyph={TrophyIcon} size={20} strokeWidth={2.3} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>Savory Score</Text>
          <Text style={styles.subtitle}>Nivel {displayScore.level.levelNumber} - {displayScore.level.name}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={theme.colors.coral} />
          <Text style={styles.helperText}>Calculando puntuacion</Text>
        </View>
      ) : (
        <>
          <View style={styles.scoreGrid}>
            <Metric label="Puntuacion" value={String(displayScore.score)} />
            <Metric label="Acciones utiles" value={String(displayScore.usefulActions)} />
          </View>
          <View style={styles.progressBlock}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
            <Text style={styles.helperText}>{nextLabel}</Text>
          </View>
        </>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.rankingHeader}>
        <Text style={styles.rankingTitle}>Ranking</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setRankingOpen(true)}
          style={({ pressed }) => [styles.openRankingButton, pressed && styles.pressed]}
        >
          <Text style={styles.openRankingText}>Ver todo</Text>
        </Pressable>
      </View>

      <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={styles.rankingScroll}>
        {ranking.length > 0 ? (
          ranking.map((profile) => (
            <RankingRow key={profile.profileId} profile={profile} onPress={() => openUser(profile.profileId)} />
          ))
        ) : (
          <Text style={styles.helperText}>Todavia no hay usuarios puntuados.</Text>
        )}
      </ScrollView>

      <Modal animationType="fade" onRequestClose={() => setRankingOpen(false)} transparent visible={rankingOpen}>
        <View style={styles.overlay}>
          <Pressable accessibilityLabel="Cerrar ranking" onPress={() => setRankingOpen(false)} style={styles.backdrop} />
          <View style={[styles.rankingSheet, { width: contentWidth }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Ranking Savory</Text>
              <Pressable accessibilityRole="button" hitSlop={10} onPress={() => setRankingOpen(false)} style={styles.closeButton}>
                <SavoryIcon color={theme.colors.text} glyph={CloseIcon} size={20} strokeWidth={2.3} />
              </Pressable>
            </View>
            <View style={styles.searchShell}>
              <SavoryIcon color={theme.colors.muted} glyph={SearchIcon} size={18} strokeWidth={2.1} />
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setQuery}
                placeholder="Buscar usuario"
                placeholderTextColor={theme.colors.faint}
                selectionColor={theme.colors.text}
                style={[styles.searchInput, inputPlatformStyle]}
                value={query}
              />
            </View>
            {rankingLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={theme.colors.coral} />
                <Text style={styles.helperText}>Buscando usuarios</Text>
              </View>
            ) : null}
            <ScrollView showsVerticalScrollIndicator style={styles.fullRankingScroll}>
              {fullRanking.map((profile) => (
                <RankingRow key={profile.profileId} profile={profile} onPress={() => openUser(profile.profileId)} />
              ))}
              {!rankingLoading && fullRanking.length === 0 ? (
                <Text style={styles.helperText}>No hay usuarios con ese nombre.</Text>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function RankingRow({ onPress, profile }: { profile: SavoryScoreProfile; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.rankingRow, pressed && styles.pressed]}>
      <Text style={styles.rankNumber}>#{profile.rank}</Text>
      {profile.avatarUrl ? (
        <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarFallback}>
          <Text style={styles.avatarInitial}>{profile.username.charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.rankingText}>
        <Text numberOfLines={1} style={styles.username}>{profile.username}</Text>
        <Text numberOfLines={1} style={styles.levelText}>Nivel {profile.level.levelNumber} - {profile.level.name}</Text>
      </View>
      <Text style={styles.scoreText}>{profile.score}</Text>
    </Pressable>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text numberOfLines={1} style={styles.metricValue}>{value}</Text>
      <Text numberOfLines={1} style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function buildEmptyScore(profileId: string): SavoryScoreProfile {
  const level = getSavoryScoreLevel(0);

  return {
    avatarUrl: null,
    displayName: null,
    exposureScore: 0,
    level,
    positiveScore: 0,
    profileId,
    rank: 0,
    score: 0,
    usefulActions: 0,
    username: "usuario",
  };
}

function getLevelProgress(score: number, level: SavoryScoreProfile["level"]) {
  if (!level.nextThreshold || level.nextThreshold <= level.currentThreshold) {
    return 100;
  }

  return Math.max(
    0,
    Math.min(100, ((score - level.currentThreshold) / (level.nextThreshold - level.currentThreshold)) * 100),
  );
}

const styles = StyleSheet.create({
  panel: {
    ...floatingShadow,
    backgroundColor: theme.colors.surfaceGlass,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    gap: 14,
    marginTop: 14,
    padding: 18,
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  iconBubble: {
    alignItems: "center",
    backgroundColor: theme.colors.coralSoft,
    borderRadius: theme.radius.pill,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  headerText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  title: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: "900",
    lineHeight: 25,
  },
  subtitle: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17,
  },
  loadingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  helperText: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
  scoreGrid: {
    flexDirection: "row",
    gap: 8,
  },
  metric: {
    backgroundColor: theme.colors.coralSoft,
    borderColor: "#FFDAD5",
    borderRadius: theme.radius.md,
    borderWidth: 1,
    flex: 1,
    gap: 3,
    justifyContent: "center",
    minHeight: 66,
    padding: 10,
  },
  metricValue: {
    color: theme.colors.text,
    fontSize: 19,
    fontWeight: "900",
    lineHeight: 23,
    textAlign: "center",
  },
  metricLabel: {
    color: theme.colors.muted,
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 13,
    textAlign: "center",
    textTransform: "uppercase",
  },
  progressBlock: {
    gap: 8,
  },
  progressTrack: {
    backgroundColor: theme.colors.surfaceSoft,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 12,
    overflow: "hidden",
  },
  progressFill: {
    backgroundColor: theme.colors.coral,
    borderRadius: theme.radius.pill,
    height: "100%",
  },
  rankingHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  rankingTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 21,
  },
  openRankingButton: {
    alignItems: "center",
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  openRankingText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 16,
  },
  rankingScroll: {
    maxHeight: 220,
  },
  rankingRow: {
    alignItems: "center",
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: 9,
    marginBottom: 8,
    minHeight: 62,
    padding: 10,
  },
  rankNumber: {
    color: theme.colors.coral,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 17,
    width: 34,
  },
  avatar: {
    backgroundColor: theme.colors.surfaceSoft,
    borderRadius: theme.radius.pill,
    height: 40,
    width: 40,
  },
  avatarFallback: {
    alignItems: "center",
    backgroundColor: theme.colors.coralSoft,
    borderRadius: theme.radius.pill,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  avatarInitial: {
    color: theme.colors.coral,
    fontSize: 15,
    fontWeight: "900",
  },
  rankingText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  username: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 18,
  },
  levelText: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 15,
  },
  scoreText: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 19,
    minWidth: 42,
    textAlign: "right",
  },
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
    backgroundColor: "rgba(17, 18, 20, 0.25)",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  rankingSheet: {
    ...floatingShadow,
    backgroundColor: theme.colors.surfaceGlass,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    gap: 12,
    maxHeight: "78%",
    padding: 16,
  },
  sheetHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  sheetTitle: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 21,
    fontWeight: "900",
    lineHeight: 26,
  },
  closeButton: {
    alignItems: "center",
    borderRadius: theme.radius.pill,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  searchShell: {
    alignItems: "center",
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    height: 52,
    paddingHorizontal: 14,
  },
  searchInput: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    height: "100%",
    minWidth: 0,
  },
  fullRankingScroll: {
    maxHeight: 470,
  },
  pressed: {
    opacity: 0.74,
    transform: [{ scale: 0.99 }],
  },
});
