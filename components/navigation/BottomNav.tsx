import { usePathname, useRouter } from "expo-router";
import { ChevronDown, Home, List, Square, UserRound } from "lucide-react-native";
import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";

import { floatingShadow, theme } from "../../constants/theme";
import { trackAppEvent } from "../../services/appAnalytics";
import { SavoryIcon, type SavoryIconGlyph } from "../ui/SavoryIcon";

type NavItem = {
  activePaths?: string[];
  Icon: SavoryIconGlyph;
  key: string;
  label: string;
  route?: string;
};

const NAV_ITEMS: NavItem[] = [
  { key: "home", label: "Inicio", Icon: Home as SavoryIconGlyph, route: "/" },
  { key: "feed", label: "Feed", Icon: ChevronDown as SavoryIconGlyph, route: "/feed" },
  {
    key: "list",
    label: "Lista",
    Icon: List as SavoryIconGlyph,
    route: "/list",
    activePaths: ["/list", "/wishlist", "/groups"],
  },
  { key: "grid", label: "Recomendaciones", Icon: Square as SavoryIconGlyph, route: "/recommendations" },
  { key: "profile", label: "Perfil", Icon: UserRound as SavoryIconGlyph, route: "/profile" },
];

type BottomNavProps = {
  width?: number;
};

export function BottomNav({ width }: BottomNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <View style={[styles.shell, width ? { width } : null]}>
      {NAV_ITEMS.map(({ key, label, Icon, route, activePaths }) => {
        const active = route ? (activePaths ?? [route]).includes(pathname) : false;

        return (
          <NavButton
            active={active}
            Icon={Icon}
            key={key}
            label={label}
            onPress={
              route
                ? () => {
                    void trackAppEvent({
                      entityId: route,
                      entityType: "route",
                      eventName: "bottom_nav_click",
                      metadata: { label },
                      route: pathname,
                    });
                    router.push(route as never);
                  }
                : undefined
            }
          />
        );
      })}
    </View>
  );
}

type NavButtonProps = {
  active: boolean;
  Icon: SavoryIconGlyph;
  label: string;
  onPress?: () => void;
};

function NavButton({ active, Icon, label, onPress }: NavButtonProps) {
  const progress = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      duration: 180,
      toValue: active ? 1 : 0,
      useNativeDriver: false,
    }).start();
  }, [active, progress]);

  const bubbleOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const bubbleScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.72, 1],
  });
  const iconScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.1],
  });

  return (
    <Pressable
            accessibilityLabel={label}
            accessibilityRole="button"
            hitSlop={10}
            onPress={onPress}
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.itemActiveBubble,
          {
            opacity: bubbleOpacity,
            transform: [{ scale: bubbleScale }],
          },
        ]}
      />
      <Animated.View style={{ transform: [{ scale: iconScale }] }}>
            <SavoryIcon
          size={22}
              color={active ? theme.colors.coral : theme.colors.text}
              glyph={Icon}
              strokeWidth={active ? 2.5 : 2.1}
            />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    ...floatingShadow,
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "rgba(255, 255, 255, 0.64)",
    borderColor: "rgba(231, 231, 226, 0.62)",
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    flexDirection: "row",
    height: 66,
    justifyContent: "space-between",
    maxWidth: 430,
    paddingHorizontal: 12,
    width: "100%",
  },
  item: {
    alignItems: "center",
    borderRadius: theme.radius.pill,
    height: 44,
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
    width: 52,
  },
  itemActiveBubble: {
    backgroundColor: "rgba(255, 240, 238, 0.78)",
    borderRadius: theme.radius.pill,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  itemPressed: {
    opacity: 0.62,
    transform: [{ scale: 0.97 }],
  },
});
