# Configuration Reference

This bundle reads config from Pi's agent directory (`~/.pi/agent`).

## Files

- `pi-agent-custom.json` — primary bundle config
- `settings.json` — Pi settings; some bundle keys read as fallback
- legacy fallbacks:
  - `plan-mode.json`
  - `web-fetch.json`

## `planMode`

Read order:

1. `pi-agent-custom.json.planMode`
2. `settings.json.planMode`
3. `plan-mode.json`

Schema:

```json
{
  "planMode": {
    "defaults": {
      "model": "openai-codex/gpt-5.4",
      "thinkingLevel": "high"
    },
    "plan": {
      "model": "openai-codex/gpt-5.4-mini",
      "thinkingLevel": "medium"
    }
  }
}
```

Fields:

- `defaults.model` (string)
- `defaults.thinkingLevel` (`off|low|medium|high|xhigh`)
- `plan.model` (string)
- `plan.thinkingLevel` (`off|low|medium|high|xhigh`)

Resolution for `/plan on` profile:

1. `plan.*`
2. `defaults.*`
3. keep current session values

On `/plan off`, pre-plan model/thinking are restored when available.

## `advisorMode`

Read order:

1. `pi-agent-custom.json.advisorMode`
2. `settings.json.advisorMode`

Schema:

```json
{
  "advisorMode": {
    "enabled": false,
    "advisorModel": "anthropic/claude-sonnet-4-5",
    "thinkingLevel": "high",
    "toolProfile": "research",
    "timeoutMs": 60000,
    "maxAdvisorCallsPerTurn": 1,
    "maxAdvisorCallsPerSession": 20,
    "maxFiles": 3,
    "maxFileBytes": 12000,
    "maxDraftBytes": 16000,
    "maxSnippetBytes": 8000,
    "allowReadOnlyBash": false,
    "autoSuggest": true,
    "triggers": {
      "architecture": true,
      "migration": true,
      "security": true,
      "riskyRefactor": false
    }
  }
}
```

Fields:

- `enabled` — default advisor mode state at session start
- `advisorModel` — model ref for advisor subprocess (`provider/model-id`)
- `thinkingLevel` — `off|low|medium|high|xhigh`
- `toolProfile` — `strict` (no tools) or `research` (read-only tools + `web_fetch`)
- `timeoutMs` — subprocess timeout in milliseconds
- `maxAdvisorCallsPerTurn` — per-turn budget limit
- `maxAdvisorCallsPerSession` — per-session budget limit
- `maxFiles`, `maxFileBytes`, `maxDraftBytes`, `maxSnippetBytes` — payload caps for context packaging
- `allowReadOnlyBash` — optionally include `bash` in advisor research profile tool allowlist
- `autoSuggest`, `triggers.*` — reserved for future auto-consult suggestions

Enable requirements:

- `advisorModel` must be configured
- `thinkingLevel` must be valid
- `toolProfile` must be `strict` or `research`
- `timeoutMs` must be positive

You can set `advisorModel` interactively with `/advisor model` or directly via `/advisor model <provider/model-id>`.

## `webFetch`

Read order:

1. `pi-agent-custom.json.webFetch`
2. `settings.json.webFetch`
3. `web-fetch.json`

Schema:

```json
{
  "webFetch": {
    "model": "openai-codex/gpt-5.4-mini",
    "thinkingLevel": "low",
    "extensionsDir": "~/.pi/extensions/web-fetch",
    "pageTimeoutMs": 10000,
    "extractTimeoutMs": 10000,
    "subagentTimeoutMs": 45000
  }
}
```

Fields:

- `model` — sub-agent model used for prompt distillation/summarization
- `thinkingLevel` — `off|low|medium|high|xhigh` (invalid values fallback to `low`)
- `extensionsDir` — local web-fetch extension directory
- `pageTimeoutMs` — page load timeout (minimum accepted `1000`)
- `extractTimeoutMs` — extraction timeout (minimum accepted `1000`)
- `subagentTimeoutMs` — sub-agent timeout (minimum accepted `1000`)

## `ui.banner`

Read from `pi-agent-custom.json` via `ui.banner`.

Schema:

```json
{
  "ui": {
    "banner": true
  }
}
```

If omitted, banner defaults to enabled.

## Themes

Theme selection is managed by Pi natively:

- `/settings`
- `settings.json.theme`

Bundled themes remain available via `package.json#pi.themes`.
