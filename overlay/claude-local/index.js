/**
 * overlay/claude-local — fork layer: run Task Master on the local Claude subscription.
 *
 * This directory is NOT part of upstream Task Master. It exists so that this
 * fork's "no API keys, use the Claude Code CLI" opinion lives in files upstream
 * never touches, keeping `git merge upstream/main` conflict-free.
 *
 * Everything here is pure: it imports nothing from `scripts/`, `src/`, or
 * `packages/`, so it can be imported from anywhere without creating a cycle.
 *
 * See ./README.md for the hook inventory and the upstream-merge playbook.
 */

import path from 'path';
import CLAUDE_LOCAL_MODELS from './models.json' with { type: 'json' };

export { CLAUDE_LOCAL_MODELS };

/** Env var that turns the layer off, restoring stock upstream behaviour. */
export const DISABLE_ENV_VAR = 'TM_CLAUDE_LOCAL_OVERLAY';

const ENV_NOTE = `# This project runs on the local Claude subscription (the \`claude-code\`
# provider) via the Claude Code CLI. No API key is required — you can leave
# this file untouched.
#
# Fill in a key below only if you switch a role to a hosted provider, e.g.:
#   task-master models --set-research sonar-pro    # needs PERPLEXITY_API_KEY
`;

/**
 * Whether the layer is active. Set TM_CLAUDE_LOCAL_OVERLAY=0 (or false/off) to
 * disable it and get stock upstream defaults — useful when diffing behaviour
 * against upstream.
 * @param {Record<string, string|undefined>} [env] - Environment to read
 * @returns {boolean}
 */
export function isOverlayEnabled(env = process.env) {
	const raw = env?.[DISABLE_ENV_VAR];
	if (raw === undefined) return true;
	return !['0', 'false', 'off', 'no'].includes(
		String(raw).trim().toLowerCase()
	);
}

/**
 * Overlay the Claude-local model roles onto a defaults object, in place.
 *
 * Mutating rather than replacing is deliberate: the upstream `DEFAULTS` literal
 * stays byte-identical, so upstream edits to it merge cleanly and this layer is
 * a single added call underneath.
 *
 * @template {{ models?: Record<string, object> }} T
 * @param {T} defaults - Upstream defaults object to overlay
 * @param {Record<string, string|undefined>} [env] - Environment to read
 * @returns {T} The same object, for convenience
 */
export function applyModelDefaults(defaults, env = process.env) {
	if (!defaults || !isOverlayEnabled(env)) return defaults;

	defaults.models = defaults.models || {};
	for (const [role, model] of Object.entries(CLAUDE_LOCAL_MODELS)) {
		defaults.models[role] = { ...model };
	}
	// The provider reads its optional settings from this key; make sure it
	// exists so `task-master init` writes a config users can extend.
	defaults.claudeCode = defaults.claudeCode || {};

	return defaults;
}

/** Per-template rewrites, keyed by the asset's file name. */
const ASSET_TRANSFORMS = {
	// `task-master init` copies this to .taskmaster/config.json
	'config.json': (contents, env) => {
		const config = JSON.parse(contents);
		applyModelDefaults(config, env);
		// Templates in assets/ are tab-indented; match so diffs stay quiet.
		return `${JSON.stringify(config, null, '\t')}\n`;
	},
	// `task-master init` copies this to .env.example
	'env.example': (contents) =>
		contents.startsWith(ENV_NOTE) ? contents : `${ENV_NOTE}\n${contents}`
};

/**
 * Rewrite an upstream template as it is read, so the files in `assets/` stay
 * byte-identical to upstream and never conflict on merge.
 *
 * Hooked into `readAsset()` — the single funnel every template read goes
 * through — rather than into `init`, which is a busier file to insert into.
 *
 * @param {string} relativePath - Asset path, as passed to readAsset()
 * @param {string|Buffer} contents - Raw asset contents
 * @param {Record<string, string|undefined>} [env] - Environment to read
 * @returns {string|Buffer} Transformed contents, or the input unchanged
 */
export function transformAsset(relativePath, contents, env = process.env) {
	if (typeof contents !== 'string' || !isOverlayEnabled(env)) return contents;

	const transform = ASSET_TRANSFORMS[path.basename(String(relativePath))];
	if (!transform) return contents;

	try {
		return transform(contents, env);
	} catch {
		// A malformed template is upstream's problem, not the layer's — hand
		// back the original rather than breaking `task-master init`.
		return contents;
	}
}
