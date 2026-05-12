// User-facing extension config. Loaded once at extension registration from
// ~/.pi/agent/claude-bridge.json and .pi/claude-bridge.json, project overriding
// global. Missing or unparseable files are ignored (error to console.error,
// empty object returned) so the extension always starts.

import type { SettingSource } from "@anthropic-ai/claude-agent-sdk";
import type { SystemPromptForwardingConfig } from "./system-prompt-forwarding.js";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

/**
 * Which CLAUDE.md files Claude Code should auto-load into context.
 * - "project" → the project's CLAUDE.md (under cwd)
 * - "global"  → the user's ~/.claude/CLAUDE.md
 * An empty array attaches no CLAUDE.md at all.
 */
export type ClaudeMdScope = "project" | "global";

export interface Config {
	/**
	 * Controls which CLAUDE.md files Claude Code attaches to its context
	 * (applies to both the provider path and the AskClaude tool).
	 * Omit to keep historical defaults; pass [] to disable entirely.
	 */
	claudeMdScope?: ClaudeMdScope[];
	askClaude?: {
		enabled?: boolean;
		name?: string;
		label?: string;
		description?: string;
		defaultMode?: "full" | "read" | "none";
		defaultIsolated?: boolean;
		allowFullMode?: boolean;
		appendSkills?: boolean;
		systemPromptForwarding?: SystemPromptForwardingConfig;
	};
	/** Low-level Claude Agent SDK plumbing. Most users won't need these. */
	provider?: {
		appendSystemPrompt?: boolean;
		systemPromptForwarding?: SystemPromptForwardingConfig;
		settingSources?: SettingSource[];
		strictMcpConfig?: boolean;
		pathToClaudeCodeExecutable?: string;
	};
}

export function tryParseJson(path: string): Partial<Config> {
	if (!existsSync(path)) return {};
	try {
		return JSON.parse(readFileSync(path, "utf-8"));
	} catch (e) {
		console.error(`claude-bridge: failed to parse ${path}: ${e}`);
		return {};
	}
}

export function loadConfig(cwd: string): Config {
	const global = tryParseJson(join(homedir(), ".pi", "agent", "claude-bridge.json"));
	const project = tryParseJson(join(cwd, ".pi", "claude-bridge.json"));
	return {
		...(project.claudeMdScope !== undefined
			? { claudeMdScope: project.claudeMdScope }
			: global.claudeMdScope !== undefined
				? { claudeMdScope: global.claudeMdScope }
				: {}),
		askClaude: { ...global.askClaude, ...project.askClaude },
		provider: { ...global.provider, ...project.provider },
	};
}

const SCOPE_TO_SETTING_SOURCE: Record<ClaudeMdScope, SettingSource> = {
	project: "project",
	global: "user",
};

/** Map the user-facing scope list to Claude Agent SDK SettingSource entries. */
export function scopeToSettingSources(scope: ClaudeMdScope[]): SettingSource[] {
	return scope.map((s) => SCOPE_TO_SETTING_SOURCE[s]);
}
