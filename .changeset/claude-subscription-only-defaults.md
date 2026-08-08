---
"task-master-ai": minor
---

Task Master now runs on your local Claude subscription out of the box — no API keys required.

`task-master init` configures the main, research, and fallback roles to the `claude-code` provider, which authenticates through the Claude Code CLI already installed on your machine. Projects with no config file fall back to the same Claude-only defaults. Set `TM_CLAUDE_LOCAL_OVERLAY=0` to restore the previous Anthropic/Perplexity defaults, or override any single role as usual with `task-master models --set-research sonar-pro`.

This also fixes `--research` being silently downgraded to the main model whenever `PERPLEXITY_API_KEY` was absent. Task Master now checks whichever provider is actually configured for the research role, so keyless providers like `claude-code` work with `--research`, and the warning names the real provider instead of always saying Perplexity.
