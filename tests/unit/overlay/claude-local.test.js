/**
 * Tests for the `claude-local` fork layer (overlay/claude-local).
 *
 * Two jobs:
 *  1. The layer does what it claims — Claude-only defaults, opt-out honoured.
 *  2. Tripwire: the hooks are still wired into the upstream files. If an
 *     upstream merge drops one, these fail instead of the fork silently
 *     reverting to Anthropic/Perplexity defaults.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
	CLAUDE_LOCAL_MODELS,
	DISABLE_ENV_VAR,
	applyModelDefaults,
	isOverlayEnabled,
	transformAsset
} from '../../../overlay/claude-local/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

const readProjectFile = (relativePath) =>
	fs.readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf-8');

const supportedModels = JSON.parse(
	readProjectFile('scripts/modules/supported-models.json')
);

const ROLES = ['main', 'research', 'fallback'];

describe('claude-local layer: model defaults', () => {
	it.each(ROLES)('uses the keyless claude-code provider for %s', (role) => {
		expect(CLAUDE_LOCAL_MODELS[role].provider).toBe('claude-code');
	});

	it.each(ROLES)('points %s at a model that allows the role', (role) => {
		const modelData = supportedModels['claude-code'].find(
			(model) => model.id === CLAUDE_LOCAL_MODELS[role].modelId
		);

		expect(modelData).toBeDefined();
		expect(modelData.allowed_roles).toContain(role);
	});

	it.each(ROLES)('declares the supported maxTokens for %s', (role) => {
		const modelData = supportedModels['claude-code'].find(
			(model) => model.id === CLAUDE_LOCAL_MODELS[role].modelId
		);

		expect(CLAUDE_LOCAL_MODELS[role].maxTokens).toBe(modelData.max_tokens);
	});
});

describe('claude-local layer: applyModelDefaults', () => {
	const upstreamDefaults = () => ({
		models: {
			main: { provider: 'anthropic', modelId: 'claude-sonnet-4-20250514' },
			research: { provider: 'perplexity', modelId: 'sonar' },
			fallback: { provider: 'anthropic', modelId: 'claude-3-7-sonnet-20250219' }
		},
		global: { logLevel: 'info' }
	});

	it('replaces every role with the claude-code equivalent', () => {
		const defaults = applyModelDefaults(upstreamDefaults(), {});

		for (const role of ROLES) {
			expect(defaults.models[role]).toEqual(CLAUDE_LOCAL_MODELS[role]);
		}
	});

	it('leaves non-model settings alone', () => {
		const defaults = applyModelDefaults(upstreamDefaults(), {});

		expect(defaults.global).toEqual({ logLevel: 'info' });
	});

	it('does not share mutable state with the layer constants', () => {
		const defaults = applyModelDefaults(upstreamDefaults(), {});
		defaults.models.main.modelId = 'mutated';

		expect(CLAUDE_LOCAL_MODELS.main.modelId).not.toBe('mutated');
	});

	it('is a no-op when the layer is disabled', () => {
		const defaults = applyModelDefaults(upstreamDefaults(), {
			[DISABLE_ENV_VAR]: '0'
		});

		expect(defaults.models.main.provider).toBe('anthropic');
		expect(defaults.models.research.provider).toBe('perplexity');
	});
});

describe('claude-local layer: isOverlayEnabled', () => {
	it('defaults to enabled', () => {
		expect(isOverlayEnabled({})).toBe(true);
	});

	it.each(['0', 'false', 'off', 'no', 'OFF', ' false '])(
		'treats %p as disabled',
		(value) => {
			expect(isOverlayEnabled({ [DISABLE_ENV_VAR]: value })).toBe(false);
		}
	);

	it.each(['1', 'true', 'yes'])('treats %p as enabled', (value) => {
		expect(isOverlayEnabled({ [DISABLE_ENV_VAR]: value })).toBe(true);
	});
});

describe('claude-local layer: transformAsset', () => {
	// The real upstream templates, so the transform is exercised against what
	// `task-master init` actually copies rather than a hand-written fixture.
	const upstreamConfigTemplate = readProjectFile('assets/config.json');
	const upstreamEnvTemplate = readProjectFile('assets/env.example');

	it('rewrites the config template to claude-code, keeping other settings', () => {
		const result = transformAsset('config.json', upstreamConfigTemplate, {});
		const config = JSON.parse(result);

		for (const role of ROLES) {
			expect(config.models[role]).toEqual(CLAUDE_LOCAL_MODELS[role]);
		}
		// Untouched upstream settings survive the round trip.
		const upstream = JSON.parse(upstreamConfigTemplate);
		expect(config.global).toEqual(upstream.global);
	});

	it('emits tab-indented JSON to match the upstream template style', () => {
		const result = transformAsset('config.json', upstreamConfigTemplate, {});

		expect(result).toContain('\n\t"models"');
		expect(result.endsWith('\n')).toBe(true);
	});

	it('prepends the no-key note to the env template exactly once', () => {
		const once = transformAsset('env.example', upstreamEnvTemplate, {});

		expect(once).toContain('No API key is required');
		expect(once).toContain('ANTHROPIC_API_KEY');
		expect(transformAsset('env.example', once, {})).toBe(once);
	});

	it('resolves templates by file name, not exact path', () => {
		const result = transformAsset('env.example', upstreamEnvTemplate, {});

		expect(
			transformAsset('./assets/env.example', upstreamEnvTemplate, {})
		).toBe(result);
	});

	it('passes through templates it does not own', () => {
		expect(transformAsset('gitignore', 'node_modules\n', {})).toBe(
			'node_modules\n'
		);
	});

	it('passes through Buffers untouched', () => {
		const buffer = Buffer.from(upstreamEnvTemplate);

		expect(transformAsset('env.example', buffer, {})).toBe(buffer);
	});

	it('is a no-op when the layer is disabled', () => {
		const env = { [DISABLE_ENV_VAR]: '0' };

		expect(transformAsset('config.json', upstreamConfigTemplate, env)).toBe(
			upstreamConfigTemplate
		);
		expect(transformAsset('env.example', upstreamEnvTemplate, env)).toBe(
			upstreamEnvTemplate
		);
	});

	it('returns the original template rather than throwing on malformed input', () => {
		expect(transformAsset('config.json', 'not json', {})).toBe('not json');
	});
});

describe('claude-local layer: upstream hooks are still wired in', () => {
	// Tripwire for upstream merges. If a merge drops a hook, the fork silently
	// reverts to Anthropic/Perplexity defaults — these tests catch that.
	it('config-manager.js applies the model defaults overlay', () => {
		const source = readProjectFile('scripts/modules/config-manager.js');

		expect(source).toContain('overlay/claude-local/index.js');
		expect(source).toMatch(/applyModelDefaults\(DEFAULTS\)/);
	});

	it('asset-resolver.js transforms templates on read', () => {
		const source = readProjectFile('src/utils/asset-resolver.js');

		expect(source).toContain('overlay/claude-local/index.js');
		expect(source).toMatch(/transformAsset\(\s*relativePath/);
	});
});
