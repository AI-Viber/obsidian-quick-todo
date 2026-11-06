// Reading and editing to-do lines in a note's text.
// Nothing here touches Obsidian, so it can be tested on its own.

/** The Tasks plugin's "created" marker. Using it keeps our date stamps compatible with that plugin. */
export const CREATED_EMOJI = "➕";

// "- [ ] text", "* [x] text", "1. [ ] text" (with any indent).
const TASK_RE = /^(\s*)([-*+]|\d+[.)])(\s+)\[([ xX])\](\s?)(.*)$/;
const FENCE_RE = /^\s*(```|~~~)/;
const CREATED_RE = /\s*➕\s*(\d{4}-\d{2}-\d{2})\s*$/;

export function splitLines(data) {
	const eol = data.includes("\r\n") ? "\r\n" : "\n";
	return { lines: data.split(/\r?\n/), eol };
}

function indentOf(line) {
	return /^\s*/.exec(line)[0].replace(/\t/g, "    ").length;
}

/** Every checklist line in the note, ignoring front matter and fenced code. */
export function scanItems(lines) {
	const items = [];
	let start = 0;
	if (lines[0] !== undefined && lines[0].trimEnd() === "---") {
		for (let i = 1; i < lines.length; i++) {
			const t = lines[i].trimEnd();
			if (t === "---" || t === "...") {
				start = i + 1;
				break;
			}
		}
	}
	let fence = null;
	for (let i = start; i < lines.length; i++) {
		const line = lines[i];
		const f = FENCE_RE.exec(line);
		if (f) {
			if (fence === null) fence = f[1];
			else if (f[1] === fence) fence = null;
			continue;
		}
		if (fence !== null) continue;
		const m = TASK_RE.exec(line);
		if (!m) continue;
		items.push({ index: i, raw: line, indent: indentOf(line), checked: m[4] !== " ", text: m[6] });
	}
	return items;
}

/** Index just past a line and everything indented under it (including nested tasks). */
export function blockEnd(lines, index) {
	const base = indentOf(lines[index]);
	let end = index + 1;
	while (end < lines.length && lines[end].trim() !== "" && indentOf(lines[end]) > base) end++;
	return end;
}

/**
 * The line itself plus any plain notes written directly under it, up to the
 * first nested task. These are the lines that go when the item is deleted.
 */
export function ownedLines(lines, index) {
	const base = indentOf(lines[index]);
	const owned = [index];
	for (let i = index + 1; i < lines.length; i++) {
		const line = lines[i];
		if (line.trim() === "" || indentOf(line) <= base || TASK_RE.test(line)) break;
		owned.push(i);
	}
	return owned;
}

/** Single-line text with any pasted "- [ ]" prefix removed. Returns "" if nothing is left. */
export function cleanText(text) {
	return String(text ?? "")
		.replace(/\s*[\r\n]+\s*/g, " ")
		.trim()
		.replace(/^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?/, "")
		.trim();
}

/** The new checklist line, or null if the text is empty. `createdDate` is YYYY-MM-DD or null. */
export function makeTodoLine(text, createdDate) {
	const clean = cleanText(text);
	if (!clean) return null;
	return createdDate ? `- [ ] ${clean} ${CREATED_EMOJI} ${createdDate}` : `- [ ] ${clean}`;
}

/** Split off a trailing "➕ YYYY-MM-DD" stamp. `stamp` keeps the original text so it can be put back. */
export function splitCreated(text) {
	const m = CREATED_RE.exec(text);
	if (!m) return { main: text, stamp: "", date: null };
	return { main: text.slice(0, m.index), stamp: `${CREATED_EMOJI} ${m[1]}`, date: m[1] };
}

/**
 * Add a line to the note's text. "top" goes before the first checklist item and
 * "bottom" after the last one (and its sub-lines). With no checklist yet, it goes at the end.
 */
export function insertLine(data, line, position) {
	const { lines, eol } = splitLines(data);
	const items = scanItems(lines);
	if (items.length === 0) {
		if (data === "") return line + eol;
		return (data.endsWith("\n") ? data : data + eol) + line + eol;
	}
	const at = position === "top" ? items[0].index : blockEnd(lines, items[items.length - 1].index);
	lines.splice(at, 0, line);
	return lines.join(eol);
}

/** Where a remembered item is now: the same index if unchanged, else the nearest identical line, else -1. */
export function locateLine(lines, item) {
	if (lines[item.index] === item.raw) return item.index;
	let best = -1;
	for (let i = 0; i < lines.length; i++) {
		if (lines[i] === item.raw && (best === -1 || Math.abs(i - item.index) < Math.abs(best - item.index))) best = i;
	}
	return best;
}

/** The line with its box ticked or unticked, or null if it is not a checklist line. */
export function toggleLine(line) {
	if (!TASK_RE.test(line)) return null;
	return line.replace(TASK_RE, (_all, indent, marker, gap, mark, space, text) => {
		return `${indent}${marker}${gap}[${mark === " " ? "x" : " "}]${space}${text}`;
	});
}

/** The line with its text replaced (box and marker kept), or null if it is not a checklist line. */
export function retextLine(line, text) {
	if (!TASK_RE.test(line)) return null;
	return line.replace(TASK_RE, (_all, indent, marker, gap, mark) => `${indent}${marker}${gap}[${mark}] ${text}`);
}

/** The ticked items, each with the lines it owns, ready for removeEntries(). */
export function collectCompleted(lines) {
	return scanItems(lines)
		.filter((item) => item.checked)
		.map((item) => ({ index: item.index, raws: ownedLines(lines, item.index).map((i) => lines[i]) }));
}

/**
 * Remove collected entries, working from the bottom up. An entry whose lines
 * changed since it was collected is left alone. Returns the new lines and the entries removed.
 */
export function removeEntries(lines, entries) {
	const out = lines.slice();
	const removed = [];
	for (const entry of [...entries].sort((a, b) => b.index - a.index)) {
		if (!entry.raws.every((raw, k) => out[entry.index + k] === raw)) continue;
		out.splice(entry.index, entry.raws.length);
		removed.push(entry);
	}
	return { lines: out, removed: removed.reverse() };
}

/** Add lines to the end of a note's text, starting on a new line. */
export function appendLines(data, add) {
	const eol = data.includes("\r\n") ? "\r\n" : "\n";
	const base = data === "" || data.endsWith("\n") ? data : data + eol;
	return base + add.join(eol) + eol;
}
