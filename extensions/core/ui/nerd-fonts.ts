export type FooterTone = "accent" | "dim" | "muted" | "warning" | "error" | "success";

export interface FooterGlyphs {
  separator: string;
  model: string;
  context: string;
  dir: string;
  git: string;
  thinking: string;
  plan: string;
}

export function hasNerdFonts(): boolean {
  if (process.env.POWERLINE_NERD_FONTS === "1") return true;
  if (process.env.POWERLINE_NERD_FONTS === "0") return false;

  if (process.env.GHOSTTY_RESOURCES_DIR || process.env.KITTY_WINDOW_ID) return true;

  const termProgram = (process.env.TERM_PROGRAM || "").toLowerCase();
  const lcTerminal = (process.env.LC_TERMINAL || "").toLowerCase();
  const term = (process.env.TERM || "").toLowerCase();
  return ["iterm", "wezterm", "kitty", "ghostty", "alacritty"].some(
    (value) => termProgram.includes(value) || lcTerminal.includes(value) || term.includes(value),
  );
}

export function footerGlyphs(): FooterGlyphs {
  if (hasNerdFonts()) {
    return {
      separator: "\uE0B1",
      model: "\uEC19",
      context: "󰆼",
      dir: "\uF115",
      git: "\uF126",
      thinking: "\uF085",
      plan: "\uF0E7",
    };
  }

  return {
    separator: "·",
    model: "◈",
    context: "◫",
    dir: "◉",
    git: "⎇",
    thinking: "◌",
    plan: "⚡",
  };
}
