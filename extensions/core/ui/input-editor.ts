import { CustomEditor, type ExtensionContext } from "@mariozechner/pi-coding-agent";
import { CURSOR_MARKER, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { INPUT_BG, INPUT_FG, INPUT_DIM, INPUT_ACCENT, ANSI_RESET, ansi } from "../../../src/shared/ansi.js";

const INPUT_PLACEHOLDER = "Type @ to mention files, / for commands";

const ESC = String.fromCharCode(0x1b);
const BEL = String.fromCharCode(0x07);
const OSC_SEQUENCE_PATTERN = new RegExp(`${ESC}\\][^${BEL}]*${BEL}`, "g");
const ANSI_SEQUENCE_PATTERN = new RegExp(`${ESC}\\[[0-?]*[ -/]*[@-~]`, "g");

function styleInputBar(content: string, width: number): string {
  const safeWidth = Math.max(1, width);
  const normalized = `${INPUT_FG}${content}`.replaceAll("\x1b[0m", `${ANSI_RESET}${INPUT_BG}${INPUT_FG}`);
  const padded = truncateToWidth(normalized, safeWidth, "");
  const pad = " ".repeat(Math.max(0, safeWidth - visibleWidth(padded)));
  return `${INPUT_BG}${padded}${pad}${ANSI_RESET}`;
}

export function stripTerminalCodes(text: string): string {
  return text.replaceAll(CURSOR_MARKER, "").replace(OSC_SEQUENCE_PATTERN, "").replace(ANSI_SEQUENCE_PATTERN, "");
}

export function isEditorBorderLine(line: string): boolean {
  const plain = stripTerminalCodes(line).trim();
  return /^─+$/.test(plain) || /^─── [↑↓] \d+ more ─*$/.test(plain);
}

export class ScreenshotInputEditor extends CustomEditor {
  override render(width: number): string[] {
    const innerWidth = Math.max(1, width - 4);
    const rawLines = super.render(innerWidth);
    const contentLines = rawLines.filter((line) => !isEditorBorderLine(line));
    const prefix = `${ansi(INPUT_ACCENT, "❯")} `;

    if (!this.getText() && !this.isShowingAutocomplete()) {
      const marker = this.focused ? CURSOR_MARKER : "";
      const cursor = this.focused ? "\x1b[7m \x1b[0m" : "";
      const placeholder = ansi(INPUT_DIM, INPUT_PLACEHOLDER);
      return [
        styleInputBar("", width),
        styleInputBar(` ${prefix}${marker}${cursor}${placeholder}`, width),
        styleInputBar("", width),
      ];
    }

    const lines = [styleInputBar("", width)];
    const visibleLines = contentLines.length > 0 ? contentLines : [""];
    for (let i = 0; i < visibleLines.length; i++) {
      const line = i === 0 ? ` ${prefix}${visibleLines[i]}` : `   ${visibleLines[i]}`;
      lines.push(styleInputBar(line, width));
    }
    lines.push(styleInputBar("", width));
    return lines;
  }
}

export function installInputEditor(ctx: ExtensionContext): void {
  if (!ctx.hasUI) return;
  ctx.ui.setEditorComponent((tui, theme, keybindings) => new ScreenshotInputEditor(tui, theme, keybindings));
}
