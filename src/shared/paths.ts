import { join } from "node:path";
import { homedir } from "node:os";

export const PI_AGENT_DIR = join(homedir(), ".pi", "agent");
export const SETTINGS_PATH = join(PI_AGENT_DIR, "settings.json");
export const CUSTOM_CONFIG_PATH = join(PI_AGENT_DIR, "pi-agent-custom.json");
export const PLAN_MODE_LEGACY_CONFIG_PATH = join(PI_AGENT_DIR, "plan-mode.json");
export const LEGACY_WEB_FETCH_CONFIG_PATH = join(PI_AGENT_DIR, "web-fetch.json");
export const DEFAULT_ENV_PATHS = [join(PI_AGENT_DIR, ".env")];
export const BANNER_PATHS = [join(PI_AGENT_DIR, "agent-banner.txt"), join(homedir(), "Desktop", "agent.txt")];
export const DEFAULT_WEB_FETCH_EXTENSIONS_DIR = join(homedir(), ".pi", "extensions", "web-fetch");
