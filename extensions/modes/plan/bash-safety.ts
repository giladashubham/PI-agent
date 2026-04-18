const DANGEROUS_BASH_PATTERNS = [
  /\brm\b/i, /\brmdir\b/i, /\bmv\b/i, /\bcp\b/i, /\bmkdir\b/i, /\btouch\b/i,
  /\bchmod\b/i, /\bchown\b/i, /\bchgrp\b/i, /\bln\b/i, /\btee\b/i, /\btruncate\b/i, /\bdd\b/i,
  /(^|[^<])>(?!>)/, />>/,
  /\bnpm\s+(install|uninstall|update|ci|link|publish)\b/i,
  /\byarn\s+(add|remove|install|publish)\b/i,
  /\bpnpm\s+(add|remove|install|publish)\b/i,
  /\bpip\s+(install|uninstall)\b/i,
  /\bapt(-get)?\s+(install|remove|purge|update|upgrade)\b/i,
  /\bbrew\s+(install|uninstall|upgrade)\b/i,
  /\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|stash|cherry-pick|revert|tag|init|clone)\b/i,
  /\bsudo\b/i, /\bsu\b/i, /\bkill(all)?\b/i, /\breboot\b/i, /\bshutdown\b/i,
  /\b(vim?|nano|emacs|code|subl)\b/i,
];

const SAFE_BASH_PATTERNS = [
  /^\s*cat\b/i, /^\s*head\b/i, /^\s*tail\b/i, /^\s*less\b/i, /^\s*more\b/i,
  /^\s*grep\b/i, /^\s*find\b/i, /^\s*ls\b/i, /^\s*pwd\b/i, /^\s*echo\b/i,
  /^\s*printf\b/i, /^\s*wc\b/i, /^\s*sort\b/i, /^\s*uniq\b/i, /^\s*diff\b/i,
  /^\s*file\b/i, /^\s*stat\b/i, /^\s*du\b/i, /^\s*df\b/i, /^\s*tree\b/i,
  /^\s*which\b/i, /^\s*whereis\b/i, /^\s*type\b/i, /^\s*uname\b/i, /^\s*whoami\b/i,
  /^\s*id\b/i, /^\s*date\b/i, /^\s*uptime\b/i, /^\s*ps\b/i,
  /^\s*git\s+(status|log|diff|show|branch|remote|config\s+--get|ls-)\b/i,
  /^\s*npm\s+(list|ls|view|info|search|outdated|audit)\b/i,
  /^\s*yarn\s+(list|info|why|audit)\b/i,
  /^\s*pnpm\s+(list|why|view|audit)\b/i,
  /^\s*node\s+--version\b/i, /^\s*python\s+--version\b/i, /^\s*python3\s+--version\b/i,
  /^\s*jq\b/i, /^\s*sed\s+-n\b/i, /^\s*awk\b/i, /^\s*rg\b/i, /^\s*fd\b/i, /^\s*bat\b/i,
];

export function isSafePlanCommand(command: string): boolean {
  if (!command.trim()) return false;
  if (DANGEROUS_BASH_PATTERNS.some((pattern) => pattern.test(command))) return false;
  return SAFE_BASH_PATTERNS.some((pattern) => pattern.test(command));
}
