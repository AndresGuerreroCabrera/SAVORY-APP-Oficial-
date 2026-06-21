import { usePathname, useRouter } from "expo-router";
import { ChevronDown, Home, List, Square, UserRound } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";

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
  { key: "collapse", label: "Contraer", Icon: ChevronDown as SavoryIconGlyph },
  {
    key: "list",
    label: "Lista",
    Icon: List as SavoryIconGlyph,
    route: "/list",
    activePaths: ["/list", "/wishlist", "/groups"],
  },
  { key: "home", label: "Inicio", Icon: Home as SavoryIconGlyph, route: "/" },
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
          <Pressable
            accessibilityLabel={label}
            accessibilityRole="button"
            hitSlop={10}
            key={key}
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
            style={({ pressed }) => [
              styles.item,
              active && styles.itemActive,
              pressed && styles.itemPressed,
            ]}
          >
            <SavoryIcon
              size={active ? 24 : 22}
              color={active ? theme.colors.coral : theme.colors.text}
              glyph={Icon}
              strokeWidth={active ? 2.5 : 2.1}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    ...floatingShadow,
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: theme.colors.surfaceGlass,
    borderColor: theme.colors.border,
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
    width: 52,
  },
  itemActive: {
    backgroundColor: theme.colors.coralSoft,
  },
  itemPressed: {
    opacity: 0.62,
    transform: [{ scale: 0.97 }],
  },
});
