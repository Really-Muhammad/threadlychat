export type ThemeId = "default" | "spider-man" | "venom" | "carnage" | "miles";

export type Theme = {
  id: ThemeId;
  name: string;
  tagline: string;
  swatch: string[]; // 3 colors for preview chip
  vars: Record<string, string>; // CSS variables to apply on <html data-theme=...>
};

export const THEMES: Theme[] = [
  {
    id: "default",
    name: "Default",
    tagline: "Bronze & pink — the original.",
    swatch: ["#BB7E30", "#FF8DDB", "#1a1a1a"],
    vars: {},
  },
  {
    id: "spider-man",
    name: "Spider-Man",
    tagline: "Friendly neighborhood red & blue.",
    swatch: ["#e0102b", "#1c4ad4", "#0a0f24"],
    vars: {
      "--background": "oklch(0.16 0.05 265)",
      "--foreground": "oklch(0.97 0.01 250)",
      "--card": "oklch(0.22 0.07 265)",
      "--card-foreground": "oklch(0.97 0.01 250)",
      "--popover": "oklch(0.22 0.07 265)",
      "--popover-foreground": "oklch(0.97 0.01 250)",
      "--primary": "oklch(0.58 0.24 27)",
      "--primary-foreground": "oklch(0.99 0 0)",
      "--primary-glow": "oklch(0.55 0.22 265)",
      "--secondary": "oklch(0.25 0.09 265)",
      "--secondary-foreground": "oklch(0.97 0.01 250)",
      "--muted": "oklch(0.25 0.06 265)",
      "--muted-foreground": "oklch(0.78 0.04 250)",
      "--accent": "oklch(0.5 0.22 265)",
      "--accent-foreground": "oklch(0.99 0 0)",
      "--border": "oklch(1 0 0 / 12%)",
      "--input": "oklch(1 0 0 / 14%)",
      "--ring": "oklch(0.58 0.24 27)",
      "--sidebar": "oklch(0.12 0.06 265)",
      "--sidebar-foreground": "oklch(0.96 0.01 250)",
      "--sidebar-accent": "oklch(0.22 0.08 265)",
      "--sidebar-accent-foreground": "oklch(0.97 0.01 250)",
      "--sidebar-border": "oklch(1 0 0 / 8%)",
      "--sidebar-ring": "oklch(0.58 0.24 27)",
      "--gradient-brand":
        "linear-gradient(135deg, oklch(0.58 0.24 27), oklch(0.55 0.22 265))",
      "--shadow-soft": "0 10px 30px -12px oklch(0.58 0.24 27 / 0.5)",
    },
  },
  {
    id: "venom",
    name: "Venom",
    tagline: "Symbiote black with toxic green.",
    swatch: ["#0a0a0a", "#39ff14", "#e5e7eb"],
    vars: {
      "--background": "oklch(0.06 0 0)",
      "--foreground": "oklch(0.96 0.01 150)",
      "--card": "oklch(0.12 0 0)",
      "--card-foreground": "oklch(0.96 0.01 150)",
      "--popover": "oklch(0.12 0 0)",
      "--popover-foreground": "oklch(0.96 0.01 150)",
      "--primary": "oklch(0.85 0.27 145)",
      "--primary-foreground": "oklch(0.1 0 0)",
      "--primary-glow": "oklch(0.9 0.2 145)",
      "--secondary": "oklch(0.16 0 0)",
      "--secondary-foreground": "oklch(0.96 0.01 150)",
      "--muted": "oklch(0.18 0 0)",
      "--muted-foreground": "oklch(0.75 0.03 150)",
      "--accent": "oklch(0.3 0.1 145)",
      "--accent-foreground": "oklch(0.96 0.01 150)",
      "--border": "oklch(0.85 0.27 145 / 18%)",
      "--input": "oklch(1 0 0 / 12%)",
      "--ring": "oklch(0.85 0.27 145)",
      "--sidebar": "oklch(0 0 0)",
      "--sidebar-foreground": "oklch(0.96 0.01 150)",
      "--sidebar-accent": "oklch(0.14 0 0)",
      "--sidebar-accent-foreground": "oklch(0.96 0.01 150)",
      "--sidebar-border": "oklch(0.85 0.27 145 / 14%)",
      "--sidebar-ring": "oklch(0.85 0.27 145)",
      "--gradient-brand":
        "linear-gradient(135deg, oklch(0.85 0.27 145), oklch(0.4 0.1 145))",
      "--shadow-soft": "0 10px 30px -12px oklch(0.85 0.27 145 / 0.45)",
    },
  },
  {
    id: "carnage",
    name: "Carnage",
    tagline: "Blood red tendrils on pitch black.",
    swatch: ["#8b0000", "#ff1d3a", "#0a0000"],
    vars: {
      "--background": "oklch(0.07 0.04 25)",
      "--foreground": "oklch(0.97 0.02 25)",
      "--card": "oklch(0.13 0.06 25)",
      "--card-foreground": "oklch(0.97 0.02 25)",
      "--popover": "oklch(0.13 0.06 25)",
      "--popover-foreground": "oklch(0.97 0.02 25)",
      "--primary": "oklch(0.6 0.28 25)",
      "--primary-foreground": "oklch(0.99 0 0)",
      "--primary-glow": "oklch(0.7 0.3 15)",
      "--secondary": "oklch(0.18 0.08 25)",
      "--secondary-foreground": "oklch(0.97 0.02 25)",
      "--muted": "oklch(0.18 0.06 25)",
      "--muted-foreground": "oklch(0.78 0.05 25)",
      "--accent": "oklch(0.4 0.18 25)",
      "--accent-foreground": "oklch(0.99 0 0)",
      "--border": "oklch(0.6 0.28 25 / 20%)",
      "--input": "oklch(1 0 0 / 12%)",
      "--ring": "oklch(0.6 0.28 25)",
      "--sidebar": "oklch(0.05 0.03 25)",
      "--sidebar-foreground": "oklch(0.96 0.02 25)",
      "--sidebar-accent": "oklch(0.16 0.07 25)",
      "--sidebar-accent-foreground": "oklch(0.97 0.02 25)",
      "--sidebar-border": "oklch(0.6 0.28 25 / 16%)",
      "--sidebar-ring": "oklch(0.6 0.28 25)",
      "--gradient-brand":
        "linear-gradient(135deg, oklch(0.6 0.28 25), oklch(0.3 0.15 25))",
      "--shadow-soft": "0 10px 30px -12px oklch(0.6 0.28 25 / 0.55)",
    },
  },
  {
    id: "miles",
    name: "Miles Morales",
    tagline: "Brooklyn black with electric red.",
    swatch: ["#0a0a0a", "#ff003c", "#ff5fa2"],
    vars: {
      "--background": "oklch(0.08 0.01 350)",
      "--foreground": "oklch(0.97 0.01 350)",
      "--card": "oklch(0.14 0.02 350)",
      "--card-foreground": "oklch(0.97 0.01 350)",
      "--popover": "oklch(0.14 0.02 350)",
      "--popover-foreground": "oklch(0.97 0.01 350)",
      "--primary": "oklch(0.62 0.27 15)",
      "--primary-foreground": "oklch(0.99 0 0)",
      "--primary-glow": "oklch(0.72 0.22 350)",
      "--secondary": "oklch(0.18 0.03 350)",
      "--secondary-foreground": "oklch(0.97 0.01 350)",
      "--muted": "oklch(0.18 0.02 350)",
      "--muted-foreground": "oklch(0.78 0.03 350)",
      "--accent": "oklch(0.45 0.2 350)",
      "--accent-foreground": "oklch(0.99 0 0)",
      "--border": "oklch(0.62 0.27 15 / 18%)",
      "--input": "oklch(1 0 0 / 12%)",
      "--ring": "oklch(0.62 0.27 15)",
      "--sidebar": "oklch(0.04 0.01 350)",
      "--sidebar-foreground": "oklch(0.96 0.01 350)",
      "--sidebar-accent": "oklch(0.16 0.03 350)",
      "--sidebar-accent-foreground": "oklch(0.97 0.01 350)",
      "--sidebar-border": "oklch(0.62 0.27 15 / 16%)",
      "--sidebar-ring": "oklch(0.62 0.27 15)",
      "--gradient-brand":
        "linear-gradient(135deg, oklch(0.62 0.27 15), oklch(0.72 0.22 350))",
      "--shadow-soft": "0 10px 30px -12px oklch(0.62 0.27 15 / 0.5)",
    },
  },
];

export type NameplateId =
  | "default"
  | "spider-web"
  | "symbiote"
  | "carnage-tendrils"
  | "miles-glitch"
  | "gold-foil"
  | "neon-pulse";

export type Nameplate = {
  id: NameplateId;
  name: string;
  // CSS background applied to a banner strip behind the user's name
  background: string;
  textClass?: string;
};

export const NAMEPLATES: Nameplate[] = [
  {
    id: "default",
    name: "None",
    background: "transparent",
  },
  {
    id: "spider-web",
    name: "Spider Web",
    background:
      "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.18) 0 1px, transparent 1px) 0 0/22px 22px, linear-gradient(135deg, #b71c1c, #0d47a1)",
  },
  {
    id: "symbiote",
    name: "Symbiote",
    background:
      "linear-gradient(135deg, #000 0%, #0a0a0a 50%, #0f3d0f 100%), repeating-linear-gradient(45deg, transparent 0 6px, rgba(57,255,20,0.08) 6px 7px)",
  },
  {
    id: "carnage-tendrils",
    name: "Carnage",
    background:
      "radial-gradient(ellipse at 30% 40%, #ff1d3a 0%, #5b0000 55%, #1a0000 100%)",
  },
  {
    id: "miles-glitch",
    name: "Glitch",
    background:
      "linear-gradient(90deg, #000 0%, #1a001a 45%, #ff003c 100%), repeating-linear-gradient(0deg, transparent 0 3px, rgba(255,0,60,0.12) 3px 4px)",
  },
  {
    id: "gold-foil",
    name: "Gold Foil",
    background:
      "linear-gradient(135deg, #b8860b 0%, #ffd700 50%, #b8860b 100%)",
  },
  {
    id: "neon-pulse",
    name: "Neon Pulse",
    background:
      "linear-gradient(135deg, #00f0ff 0%, #7a00ff 50%, #ff00d4 100%)",
  },
];

export function applyTheme(themeId: string) {
  if (typeof document === "undefined") return;
  const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];
  const root = document.documentElement;
  // Always start dark for non-default themes
  if (theme.id !== "default") root.classList.add("dark");
  root.setAttribute("data-theme", theme.id);
  // Clear previously-set theme vars
  const prev = (root.dataset.themeVars ?? "").split(",").filter(Boolean);
  prev.forEach((v) => root.style.removeProperty(v));
  const keys = Object.keys(theme.vars);
  keys.forEach((k) => root.style.setProperty(k, theme.vars[k]));
  root.dataset.themeVars = keys.join(",");
}

export function getNameplate(id?: string | null): Nameplate {
  return NAMEPLATES.find((n) => n.id === (id ?? "default")) ?? NAMEPLATES[0];
}

export function getTheme(id?: string | null): Theme {
  return THEMES.find((t) => t.id === (id ?? "default")) ?? THEMES[0];
}