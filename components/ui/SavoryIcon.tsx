import type { ComponentType } from "react";

export type SavoryIconGlyph = ComponentType<{
  color?: string;
  size?: number;
  stroke?: string;
  strokeWidth?: number;
}>;

type SavoryIconProps = {
  color: string;
  glyph: SavoryIconGlyph;
  size: number;
  strokeWidth?: number;
};

export function SavoryIcon({ color, glyph: Glyph, size, strokeWidth }: SavoryIconProps) {
  return <Glyph color={color} size={size} stroke={color} strokeWidth={strokeWidth} />;
}
