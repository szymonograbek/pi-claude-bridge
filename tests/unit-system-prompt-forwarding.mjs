import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	buildForwardedSystemPrompt,
	DEFAULT_ASKCLAUDE_SYSTEM_PROMPT_FORWARDING,
	DEFAULT_PROVIDER_SYSTEM_PROMPT_FORWARDING,
} from "../src/system-prompt-forwarding.js";

const PROMPT = `Intro.

Available tools:
- read

<mcporter>
mcporter details
</mcporter>

<memories>
remember this
</memories>

# Project Context

Project notes.

## Child

Child notes.

# Other

Other notes.

The following skills provide specialized instructions for specific tasks.
Use the read tool to load a skill's file when the task matches its description.
<available_skills>
  <skill><name>x</name></skill>
</available_skills>`;

describe("system prompt forwarding", () => {
	it("defaults provider forwarding through configurable selectors", () => {
		const result = buildForwardedSystemPrompt(PROMPT, {
			defaultConfig: DEFAULT_PROVIDER_SYSTEM_PROMPT_FORWARDING,
			includeAgentsMd: false,
		});
		assert.ok(result.includes("<mcporter>"));
		assert.ok(result.includes("<memories>"));
		assert.ok(result.includes("<available_skills>"));
		assert.ok(result.includes("mcp__custom-tools__read"));
		assert.ok(!result.includes("Available tools:"));
	});

	it("lets config select non-xml fragments", () => {
		const result = buildForwardedSystemPrompt(PROMPT, {
			defaultConfig: DEFAULT_ASKCLAUDE_SYSTEM_PROMPT_FORWARDING,
			config: {
				mode: "selected",
				include: [
					{ kind: "heading", heading: "Project Context" },
					{ kind: "between", start: "Available tools:", end: "<mcporter>", includeMarkers: false },
				],
			},
		});
		assert.ok(result.includes("Project notes."));
		assert.ok(result.includes("Child notes."));
		assert.ok(!result.includes("# Other"));
		assert.ok(result.includes("- read"));
		assert.ok(!result.includes("Available tools:"));
	});

	it("supports full mode with exclusions", () => {
		const result = buildForwardedSystemPrompt(PROMPT, {
			defaultConfig: DEFAULT_PROVIDER_SYSTEM_PROMPT_FORWARDING,
			config: {
				mode: "full",
				exclude: [
					{ kind: "xmlTag", tag: "mcporter" },
					{ kind: "heading", heading: "Project Context" },
				],
			},
		});
		assert.ok(result.includes("Intro."));
		assert.ok(!result.includes("mcporter details"));
		assert.ok(!result.includes("Project notes."));
		assert.ok(result.includes("# Other"));
	});

	it("none mode disables forwarding", () => {
		const result = buildForwardedSystemPrompt(PROMPT, {
			defaultConfig: DEFAULT_PROVIDER_SYSTEM_PROMPT_FORWARDING,
			config: { mode: "none" },
		});
		assert.equal(result, "");
	});
});
