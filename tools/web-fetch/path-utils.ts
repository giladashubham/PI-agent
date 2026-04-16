import { homedir } from "node:os";
import { join } from "node:path";

export function expandHomePath(pathValue: string): string {
  if (pathValue === "~") return homedir();
  if (pathValue.startsWith("~/")) return join(homedir(), pathValue.slice(2));
  return pathValue;
}
