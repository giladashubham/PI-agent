export const INPUT_BG = "\x1b[48;2;18;18;18m";
export const INPUT_FG = "\x1b[38;2;230;237;243m";
export const INPUT_DIM = "\x1b[38;2;110;118;129m";
export const INPUT_ACCENT = "\x1b[38;2;88;166;255m";
export const ANSI_RESET = "\x1b[0m";

export function ansi(color: string, text: string): string {
  return `${color}${text}${ANSI_RESET}`;
}
