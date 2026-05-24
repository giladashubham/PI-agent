# Advisor Mode

Advisor mode lets the primary model call a larger advisor model for high-value review.

## Commands

- `/advisor` — toggle mode
- `/advisor on` — enable
- `/advisor off` — disable
- `/advisor model` — open model selector UI
- `/advisor model <provider/model-id>` — set advisor model directly
- `/advisor model current` — show current advisor model
- `/advisor <task>` — enable mode (if needed) and submit task as user input

## Tool

- `consult_advisor`
  - Runs a Pi subprocess with a configured advisor model
  - Supports two profiles:
    - `strict`: no tools
    - `research`: read-only repo tools + `web_fetch`

## Safety guardrails

- Advisor subprocess runs with `PI_ADVISOR_SUBAGENT=1`
- Parent extension does not register advisor command/tool when running as sub-agent
- `strict` profile uses `--no-tools --no-extensions`
- `research` profile uses `--tools read,grep,find,ls` and only re-adds `web_fetch`
- Per-turn and per-session advisor call budgets are enforced
- Advisor model selection is persisted to `~/.pi/agent/pi-agent-custom.json` (`advisorMode.advisorModel`)
