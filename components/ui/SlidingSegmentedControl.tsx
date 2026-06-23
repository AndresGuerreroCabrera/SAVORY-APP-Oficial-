import { useEffect, useRef, useState } from "react";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

import { theme } from "../../constants/theme";

export type SlidingSegmentOption<T extends string> = {
  label: string;
  value: T;
};

type SlidingSegmentedControlProps<T extends string> = {
  options: Array<SlidingSegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
  activeTextStyle?: StyleProp<TextStyle>;
  buttonStyle?: StyleProp<ViewStyle>;
  indicatorStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

const CONTROL_PADDING = 4;

export function SlidingSegmentedControl<T extends string>({
  activeTextStyle,
  buttonStyle,
  indicatorStyle,
  onChange,
  options,
  style,
  textStyle,
  value,
}: SlidingSegmentedControlProps<T>) {
  const activeIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const progress = useRef(new Animated.Value(activeIndex)).current;
  const [width, setWidth] = useState(0);
  const segmentWidth = width > CONTROL_PADDING * 2 ? (width - CONTROL_PADDING * 2) / options.length : 0;

  useEffect(() => {
    Animated.spring(progress, {
      friction: 8,
      tension: 90,
      toValue: activeIndex,
      useNativeDriver: false,
    }).start();
  }, [activeIndex, progress]);

  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[styles.control, style]}
    >
      {segmentWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            indicatorStyle,
            {
              width: segmentWidth,
              transform: [{ translateX: Animated.multiply(progress, segmentWidth) }],
            },
          ]}
        />
      ) : null}

      {options.map((option, index) => {
        const active = index === activeIndex;

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [styles.button, buttonStyle, pressed && styles.pressed]}
          >
            <Text numberOfLines={1} style={[styles.text, textStyle, active && styles.activeText, active && activeTextStyle]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  control: {
    backgroundColor: theme.colors.surfaceSoft,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    padding: CONTROL_PADDING,
    position: "relative",
  },
  indicator: {
    backgroundColor: theme.colors.coral,
    borderRadius: theme.radius.pill,
    bottom: CONTROL_PADDING,
    left: CONTROL_PADDING,
    position: "absolute",
    top: CONTROL_PADDING,
    zIndex: 0,
  },
  button: {
    alignItems: "center",
    borderRadius: theme.radius.pill,
    flex: 1,
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 8,
    zIndex: 1,
  },
  pressed: {
    opacity: 0.86,
  },
  text: {
    color: theme.colors.textSoft,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 17,
  },
  activeText: {
    color: theme.colors.white,
  },
});
