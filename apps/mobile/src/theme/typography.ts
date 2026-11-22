import type { TextStyle } from "react-native";

export const FONT_REGULAR = "Figtree_400Regular";
export const FONT_MEDIUM = "Figtree_500Medium";

export type TextVariant =
  "title" | "heading" | "body" | "bodyStrong" | "label" | "caption" | "captionStrong" | "display";

export const typography: Record<TextVariant, TextStyle> = {
  display: { fontFamily: FONT_MEDIUM, fontSize: 44, lineHeight: 52 },
  title: { fontFamily: FONT_MEDIUM, fontSize: 22, lineHeight: 29 },
  heading: { fontFamily: FONT_MEDIUM, fontSize: 16, lineHeight: 21 },
  body: { fontFamily: FONT_REGULAR, fontSize: 14, lineHeight: 20 },
  bodyStrong: { fontFamily: FONT_MEDIUM, fontSize: 14, lineHeight: 20 },
  label: { fontFamily: FONT_REGULAR, fontSize: 12, lineHeight: 16 },
  caption: { fontFamily: FONT_REGULAR, fontSize: 11, lineHeight: 14 },
  captionStrong: { fontFamily: FONT_MEDIUM, fontSize: 11, lineHeight: 14 },
};
