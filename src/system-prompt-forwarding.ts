import { extractAgentsAppend } from "./agents-md.js";
import { extractSkillsBlock } from "./skills.js";

export type PromptForwardingMode = "selected" | "full" | "none";

export type PromptFragmentSelector =
	| { kind: "agentsMd" }
	| { kind: "skills" }
	| { kind: "xmlTag"; tag: string }
	| { kind: "between"; start: string; end: string; includeMarkers?: boolean }
	| { kind: "heading"; heading: string };

export interface SystemPromptForwardingConfig {
	mode?: PromptForwardingMode;
	include?: PromptFragmentSelector[];
	exclude?: PromptFragmentSelector[];
}

export interface BuildForwardedSystemPromptOptions {
	config?: SystemPromptForwardingConfig;
	defaultConfig: SystemPromptForwardingConfig;
	includeAgentsMd?: boolean;
}

interface Range {
	start: number;
	end: number;
}

const SKILLS_SELECTOR: PromptFragmentSelector = { kind: "skills" };

export const DEFAULT_PROVIDER_SYSTEM_PROMPT_FORWARDING: SystemPromptForwardingConfig = {
	mode: "selected",
	include: [
		{ kind: "agentsMd" },
		SKILLS_SELECTOR,
		{ kind: "xmlTag", tag: "mcporter" },
		{ kind: "xmlTag", tag: "memories" },
	],
};

export const DEFAULT_ASKCLAUDE_SYSTEM_PROMPT_FORWARDING: SystemPromptForwardingConfig = {
	mode: "selected",
	include: [SKILLS_SELECTOR],
};

export function buildForwardedSystemPrompt(
	systemPrompt: string | undefined,
	options: BuildForwardedSystemPromptOptions,
): string {
	const config = mergeForwardingConfig(options.defaultConfig, options.config);
	const mode = config.mode ?? "selected";
	if (mode === "none") return "";

	const prompt = systemPrompt ?? "";
	const parts = mode === "full"
		? [removeRanges(prompt, rangesForSelectors(prompt, config.exclude ?? []))]
		: partsForSelectors(prompt, config.include ?? [], options.includeAgentsMd !== false);

	return parts.map((part) => part.trim()).filter((part) => part.length > 0).join("\n\n");
}

function mergeForwardingConfig(
	defaults: SystemPromptForwardingConfig,
	override: SystemPromptForwardingConfig | undefined,
): SystemPromptForwardingConfig {
	if (!override) return defaults;
	return {
		mode: override.mode ?? defaults.mode,
		include: override.include ?? defaults.include,
		exclude: override.exclude ?? defaults.exclude,
	};
}

function partsForSelectors(prompt: string, selectors: PromptFragmentSelector[], includeAgentsMd: boolean): string[] {
	const parts: string[] = [];
	for (const selector of selectors) {
		if (selector.kind === "agentsMd") {
			if (!includeAgentsMd) continue;
			const agents = extractAgentsAppend();
			if (agents) parts.push(agents);
			continue;
		}
		if (selector.kind === "skills") {
			const skills = extractSkillsBlock(prompt);
			if (skills) parts.push(skills);
			continue;
		}
		for (const range of rangesForSelector(prompt, selector)) {
			parts.push(prompt.slice(range.start, range.end));
		}
	}
	return parts;
}

function rangesForSelectors(prompt: string, selectors: PromptFragmentSelector[]): Range[] {
	const ranges: Range[] = [];
	for (const selector of selectors) {
		ranges.push(...rangesForSelector(prompt, selector));
	}
	return ranges;
}

function rangesForSelector(prompt: string, selector: PromptFragmentSelector): Range[] {
	if (selector.kind === "xmlTag") return xmlTagRanges(prompt, selector.tag);
	if (selector.kind === "between") return betweenRanges(prompt, selector.start, selector.end, selector.includeMarkers !== false);
	if (selector.kind === "heading") return headingRanges(prompt, selector.heading);
	return [];
}

function xmlTagRanges(prompt: string, tag: string): Range[] {
	if (!isSafeXmlTagName(tag)) return [];
	const ranges: Range[] = [];
	const startMarker = `<${tag}>`;
	const endMarker = `</${tag}>`;
	let offset = 0;
	while (offset < prompt.length) {
		const start = prompt.indexOf(startMarker, offset);
		if (start === -1) break;
		const end = prompt.indexOf(endMarker, start + startMarker.length);
		if (end === -1) break;
		const rangeEnd = end + endMarker.length;
		ranges.push({ start, end: rangeEnd });
		offset = rangeEnd;
	}
	return ranges;
}

function isSafeXmlTagName(tag: string): boolean {
	return /^[A-Za-z][A-Za-z0-9_-]*$/.test(tag);
}

function betweenRanges(prompt: string, startMarker: string, endMarker: string, includeMarkers: boolean): Range[] {
	if (!startMarker || !endMarker) return [];
	const ranges: Range[] = [];
	let offset = 0;
	while (offset < prompt.length) {
		const markerStart = prompt.indexOf(startMarker, offset);
		if (markerStart === -1) break;
		const markerEnd = prompt.indexOf(endMarker, markerStart + startMarker.length);
		if (markerEnd === -1) break;
		const rangeStart = includeMarkers ? markerStart : markerStart + startMarker.length;
		const rangeEnd = includeMarkers ? markerEnd + endMarker.length : markerEnd;
		ranges.push({ start: rangeStart, end: rangeEnd });
		offset = markerEnd + endMarker.length;
	}
	return ranges;
}

function headingRanges(prompt: string, heading: string): Range[] {
	const lines = prompt.split(/\n/);
	const starts = lineStarts(lines);
	const ranges: Range[] = [];
	const wanted = normalizeHeading(heading);

	for (let i = 0; i < lines.length; i++) {
		const current = parseHeadingLine(lines[i]);
		if (!current || current.text !== wanted) continue;
		let endLine = lines.length;
		for (let j = i + 1; j < lines.length; j++) {
			const next = parseHeadingLine(lines[j]);
			if (next && next.level <= current.level) {
				endLine = j;
				break;
			}
		}
		ranges.push({ start: starts[i], end: endLine < starts.length ? starts[endLine] : prompt.length });
	}
	return ranges;
}

function lineStarts(lines: string[]): number[] {
	const starts: number[] = [];
	let offset = 0;
	for (const line of lines) {
		starts.push(offset);
		offset += line.length + 1;
	}
	return starts;
}

function parseHeadingLine(line: string): { level: number; text: string } | undefined {
	const markdown = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
	if (markdown) return { level: markdown[1].length, text: normalizeHeading(markdown[2]) };
	const plain = /^([^\n:]+):\s*$/.exec(line);
	if (plain) return { level: 1, text: normalizeHeading(plain[1]) };
	return undefined;
}

function normalizeHeading(heading: string): string {
	return heading.replace(/^#{1,6}\s+/, "").replace(/:\s*$/, "").trim().toLowerCase();
}

function removeRanges(prompt: string, ranges: Range[]): string {
	const merged = mergeRanges(ranges);
	let output = "";
	let offset = 0;
	for (const range of merged) {
		output += prompt.slice(offset, range.start);
		offset = range.end;
	}
	output += prompt.slice(offset);
	return output.replace(/\n{3,}/g, "\n\n").trim();
}

function mergeRanges(ranges: Range[]): Range[] {
	const sorted = [...ranges]
		.filter((range) => range.end > range.start)
		.sort((left, right) => left.start - right.start);
	const merged: Range[] = [];
	for (const range of sorted) {
		const previous = merged[merged.length - 1];
		if (previous && range.start <= previous.end) {
			previous.end = Math.max(previous.end, range.end);
		} else {
			merged.push({ ...range });
		}
	}
	return merged;
}
