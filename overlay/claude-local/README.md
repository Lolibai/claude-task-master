# Fork layer: `claude-local`

Runs Task Master entirely on the **Claude subscription installed on this
machine**, through the Claude Code CLI. No API key, no billing setup, no `.env`.

This directory is not part of upstream Task Master. It exists so the fork's
opinion lives in files upstream never touches, which keeps
`git merge upstream/main` conflict-free.

## Using it

```bash
npm install -g @anthropic-ai/claude-code
claude                     # sign in once with your subscription
task-master init           # main/research/fallback all set to claude-code
task-master models         # confirm: three roles, provider `claude-code`, cost Free
```

To turn the layer off and get stock upstream behaviour — useful when
reproducing an upstream bug or diffing against it:

```bash
TM_CLAUDE_LOCAL_OVERLAY=0 task-master models
```

Per-role overrides still work normally; the layer only supplies **defaults**:

```bash
task-master models --set-research sonar-pro     # opt back into Perplexity
```

## What the layer changes

| Behaviour | Mechanism |
| --- | --- |
| `main`, `research`, `fallback` default to `claude-code` | `applyModelDefaults()` overlays the upstream `DEFAULTS` object at load |
| `task-master init` writes a Claude-only `.taskmaster/config.json` | `transformAsset()` rewrites the `assets/config.json` template as it is read. (The `DEFAULTS` overlay also lands this today, since upstream's init writes merged defaults over its own template — the transform is what keeps it correct if that write order ever changes.) |
| The generated `.env.example` says no key is needed | `transformAsset()` prepends a note to the `assets/env.example` template as it is read |

Model IDs and token limits live in [`models.json`](./models.json) — edit that
one file to change what the fork defaults to.

## Hook inventory

The layer's entire footprint in upstream files. Every hook is marked with a
`FORK LAYER:` comment, so `grep -rn "FORK LAYER:" --include='*.js' .` always
gives you the current list.

| File | Edit | Why it can't live in this directory |
| --- | --- | --- |
| `scripts/modules/config-manager.js` | 1 import + 1 call | `DEFAULTS` is a module-private literal |
| `src/utils/asset-resolver.js` | 1 import + wraps `readAsset`'s return | every template read funnels through here |

Both hooks *wrap or follow* upstream code rather than sitting inside it, and the
upstream code itself stays byte-identical. Upstream can bump the models in its
`DEFAULTS` literal or add keys to `assets/env.example` and git merges those
edits cleanly with the hook still applying on top.

`readAsset` was chosen over a hook in `scripts/init.js` deliberately. An earlier
version inserted a call into init's post-copy sequence; a simulated upstream
merge that added a step at the same point conflicted. `asset-resolver.js` is a
small, stable utility and every template read already passes through it, so
there is nothing for upstream to insert next to.

Separately, this repo's own `.taskmaster/config.json` sets the research role to
`claude-code` (upstream ships it as Perplexity). That's fork configuration, not
a hook — the layer only supplies defaults, and an existing config file wins.

## Not part of the layer

The research-provider changes on this branch are **upstream bug fixes**, not
fork opinion. They are kept in their own commit so they can be sent upstream,
after which these edits disappear from the fork:

- `scripts/modules/task-manager/update-task-by-id.js` and
  `scripts/modules/commands.js`: the research-role key check was hardcoded to
  Perplexity, so `--research` was silently downgraded to the main model whenever
  `PERPLEXITY_API_KEY` was absent — regardless of which provider the research
  role was actually configured with. Now it checks the configured provider.
- `scripts/modules/task-manager/update-subtask-by-id.js`: an "AI overloaded"
  hint told users to set `PERPLEXITY_API_KEY` for the fallback role, which has
  nothing to do with Perplexity.

Also deliberately **not** touched, to keep the merge surface small:

- `assets/AGENTS.md`, `assets/rules/taskmaster.mdc`, `assets/scripts_README.md`
  and the `apps/docs/**` pages still describe API keys as a prerequisite. They
  are prose upstream rewrites often; patching them would conflict on nearly
  every merge for no behavioural gain. This README is the fork's answer instead.
- `packages/tm-core`'s `DEFAULT_CONFIG_VALUES.MODELS` still names Anthropic
  models. Nothing in the CLI or MCP server reads it for provider selection
  (`getModelConfig()` has no callers outside a doc example), so overlaying it
  would add merge surface for no effect. **Watch item:** if tm-core's config
  manager ever becomes the real source of model selection, this layer needs a
  third hook there.

## Merging upstream

```bash
git remote add upstream https://github.com/eyaltoledano/claude-task-master.git   # once
git fetch upstream
git merge upstream/main
```

Expect no conflicts. Afterwards, verify the layer still bites:

```bash
grep -rn "FORK LAYER:" --include='*.js' scripts/ src/   # both hooks still present?
npm test -- tests/unit/overlay                     # layer behaviour
task-master models                                 # three claude-code roles
```

If upstream reorganises `config-manager.js` or `asset-resolver.js` enough that a
hook is dropped during a merge, the `tests/unit/overlay/claude-local.test.js`
suite fails — that's the tripwire.
