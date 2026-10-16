// Flat, institutional look modelled on the University of Michigan's own apps:
// a solid blue header, a light grey canvas, white bordered cards and maize
// reserved for the one main action on a screen. No glass, no gradients.

export const radius = {
  sm: 10,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
};

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  xxl: 36,
};

export const typeScale = {
  hero: 40,
  largeTitle: 28,
  title: 20,
  subtitle: 17,
  body: 15,
  label: 13,
  sectionLabel: 12,
  caption: 12,
};

export const fonts = {
  display: "Inter-Bold",
  heading: "Inter-SemiBold",
  body: "Inter-Regular",
  bodyMedium: "Inter-Medium",
  bodySemiBold: "Inter-SemiBold",
};

// Michigan's two brand colors.
export const MAIZE = "#FFCB05";
export const BLUE = "#00274C";

export const lightColors = {
  bg: "#F2F4F7",
  bgElevated: "#FFFFFF",
  cardSolid: "#FFFFFF",
  cardBorder: "#DFE4EA",
  fill: "#EEF1F5",
  fillStrong: "#E1E6EC",
  text: "#14212E",
  textSecondary: "#5A6876",
  textTertiary: "#8E99A6",
  // The solid header band on every top-level screen.
  header: BLUE,
  onHeader: "#FFFFFF",
  onHeaderMuted: "rgba(255,255,255,0.72)",
  // Filled secondary button (Join), links, icons, selected states.
  primary: BLUE,
  onPrimary: MAIZE,
  tint: BLUE,
  tintSoft: "#E5ECF4",
  // The main call to action.
  maize: MAIZE,
  onMaize: BLUE,
  maizeSoft: "#FFF4C2",
  success: "#1A7F4B",
  successSoft: "#E3F4EA",
  warning: "#9A6200",
  warningSoft: "#FBF0D9",
  danger: "#C62F35",
  dangerSoft: "#FBE7E8",
  divider: "#E6EAEF",
};

export const darkColors: typeof lightColors = {
  bg: "#0B1520",
  bgElevated: "#132130",
  cardSolid: "#132130",
  cardBorder: "#223447",
  fill: "#1B2B3C",
  fillStrong: "#24384C",
  text: "#EEF2F6",
  textSecondary: "#A3B0BE",
  textTertiary: "#6E7E8F",
  header: "#001A33",
  onHeader: "#FFFFFF",
  onHeaderMuted: "rgba(255,255,255,0.7)",
  primary: MAIZE,
  onPrimary: BLUE,
  tint: MAIZE,
  tintSoft: "rgba(255,203,5,0.14)",
  maize: MAIZE,
  onMaize: BLUE,
  maizeSoft: "rgba(255,203,5,0.16)",
  success: "#4CC688",
  successSoft: "rgba(76,198,136,0.15)",
  warning: "#F2B54B",
  warningSoft: "rgba(242,181,75,0.15)",
  danger: "#FF7276",
  dangerSoft: "rgba(255,114,118,0.14)",
  divider: "#1F3043",
};

export type ThemeColors = typeof lightColors;
