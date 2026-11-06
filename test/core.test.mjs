import assert from "node:assert/strict";
import { test } from "node:test";
import {
	appendLines,
	blockEnd,
	cleanText,
	collectCompleted,
	insertLine,
	locateLine,
	makeTodoLine,
	ownedLines,
	removeEntries,
	retextLine,
	scanItems,
	splitCreated,
	splitLines,
	toggleLine,
} from "../src/todo-core.js";

const lines = (text) => splitLines(text).lines;

test("scanItems finds checklist lines of every style", () => {
	const items = scanItems(lines("- [ ] a\n* [x] b\n+ [X] c\n1. [ ] d\n2) [ ] e\n  - [ ] f\n- [ ]\n- not a task\n- [-] custom"));
	assert.deepEqual(items.map((i) => [i.index, i.checked, i.text]), [
		[0, false, "a"],
		[1, true, "b"],
		[2, true, "c"],
		[3, false, "d"],
		[4, false, "e"],
		[5, false, "f"],
		[6, false, ""],
	]);
	assert.equal(items[5].indent, 2);
});

test("scanItems skips front matter and fenced code", () => {
	const text = "---\ntags: [x]\n- [ ] in front matter\n---\n- [ ] real\n```\n- [ ] in code\n```\n~~~\n- [ ] in tilde code\n~~~\n- [ ] also real";
	assert.deepEqual(scanItems(lines(text)).map((i) => i.text), ["real", "also real"]);
});

test("scanItems treats a lone --- at the top as ordinary text", () => {
	assert.deepEqual(scanItems(lines("---\n- [ ] a")).map((i) => i.text), ["a"]);
});

test("cleanText flattens lines and drops a pasted list prefix", () => {
	assert.equal(cleanText("  buy milk  "), "buy milk");
	assert.equal(cleanText("buy\nmilk\r\n  and eggs"), "buy milk and eggs");
	assert.equal(cleanText("- [ ] buy milk"), "buy milk");
	assert.equal(cleanText("- buy milk"), "buy milk");
	assert.equal(cleanText("1. buy milk"), "buy milk");
	assert.equal(cleanText("-5 degrees"), "-5 degrees");
	assert.equal(cleanText("   \n "), "");
	assert.equal(cleanText(null), "");
});

test("makeTodoLine", () => {
	assert.equal(makeTodoLine("buy milk", null), "- [ ] buy milk");
	assert.equal(makeTodoLine("buy milk", "2026-11-06"), "- [ ] buy milk ➕ 2026-11-06");
	assert.equal(makeTodoLine("   ", null), null);
});

test("splitCreated separates a trailing date stamp", () => {
	assert.deepEqual(splitCreated("buy milk ➕ 2026-11-06"), { main: "buy milk", stamp: "➕ 2026-11-06", date: "2026-11-06" });
	assert.deepEqual(splitCreated("buy milk"), { main: "buy milk", stamp: "", date: null });
	// Only a stamp at the very end counts; Tasks plugin dates after it are left as text.
	assert.equal(splitCreated("buy milk ➕ 2026-11-06 📅 2026-11-10").date, null);
});

test("insertLine into empty and newline-less notes", () => {
	assert.equal(insertLine("", "- [ ] a", "bottom"), "- [ ] a\n");
	assert.equal(insertLine("# To-do", "- [ ] a", "bottom"), "# To-do\n- [ ] a\n");
	assert.equal(insertLine("# To-do\n", "- [ ] a", "top"), "# To-do\n- [ ] a\n");
});

test("insertLine bottom goes after the last item and its sub-lines, keeping trailing text", () => {
	const note = "# To-do\n- [ ] a\n- [ ] b\n  - note under b\n  - [ ] nested\n\nSome other text\n";
	assert.equal(insertLine(note, "- [ ] new", "bottom"), "# To-do\n- [ ] a\n- [ ] b\n  - note under b\n  - [ ] nested\n- [ ] new\n\nSome other text\n");
});

test("insertLine top goes before the first item", () => {
	const note = "# To-do\n- [ ] a\n- [x] b\n";
	assert.equal(insertLine(note, "- [ ] new", "top"), "# To-do\n- [ ] new\n- [ ] a\n- [x] b\n");
});

test("insertLine ignores tasks in code blocks and appends after front matter", () => {
	assert.equal(insertLine("---\na: 1\n---\n```\n- [ ] code\n```\n", "- [ ] new", "bottom"), "---\na: 1\n---\n```\n- [ ] code\n```\n- [ ] new\n");
});

test("insertLine keeps CRLF line endings", () => {
	assert.equal(insertLine("- [ ] a\r\n- [ ] b\r\n", "- [ ] c", "bottom"), "- [ ] a\r\n- [ ] b\r\n- [ ] c\r\n");
	assert.equal(insertLine("# T\r\n", "- [ ] c", "bottom"), "# T\r\n- [ ] c\r\n");
});

test("blockEnd and ownedLines", () => {
	const l = lines("- [ ] a\n  - note 1\n  - note 2\n  - [ ] nested\n    - under nested\n- [ ] b\n\n  - after blank");
	assert.equal(blockEnd(l, 0), 5);
	assert.deepEqual(ownedLines(l, 0), [0, 1, 2]);
	assert.deepEqual(ownedLines(l, 3), [3, 4]);
	assert.deepEqual(ownedLines(l, 5), [5]);
});

test("toggleLine and retextLine keep the marker and indent", () => {
	assert.equal(toggleLine("- [ ] a"), "- [x] a");
	assert.equal(toggleLine("  * [x] a"), "  * [ ] a");
	assert.equal(toggleLine("1. [X] a"), "1. [ ] a");
	assert.equal(toggleLine("- [ ]"), "- [x]");
	assert.equal(toggleLine("- plain"), null);
	assert.equal(retextLine("  1. [x] old text", "new text"), "  1. [x] new text");
	assert.equal(retextLine("- [ ]", "now with text"), "- [ ] now with text");
	assert.equal(retextLine("- plain", "x"), null);
});

test("locateLine finds the same line, or the nearest identical one", () => {
	const l = ["x", "- [ ] a", "y", "- [ ] a", "- [ ] b"];
	assert.equal(locateLine(l, { index: 1, raw: "- [ ] a" }), 1);
	assert.equal(locateLine(l, { index: 2, raw: "- [ ] a" }), 1); // tie goes to the earlier one
	assert.equal(locateLine(l, { index: 4, raw: "- [ ] a" }), 3);
	assert.equal(locateLine(l, { index: 0, raw: "- [ ] gone" }), -1);
});

test("collectCompleted and removeEntries", () => {
	const text = "- [x] done 1\n  - note on done 1\n- [ ] open\n- [x] done parent\n  - [ ] open child\n  - [x] done child\n- [x] done 2";
	const l = lines(text);
	const entries = collectCompleted(l);
	assert.deepEqual(entries.map((e) => e.raws), [["- [x] done 1", "  - note on done 1"], ["- [x] done parent"], ["  - [x] done child"], ["- [x] done 2"]]);
	const { lines: out, removed } = removeEntries(l, entries);
	assert.deepEqual(out, ["- [ ] open", "  - [ ] open child"]);
	assert.equal(removed.length, 4);
});

test("removeEntries leaves alone anything that changed since it was collected", () => {
	const entries = collectCompleted(lines("- [x] a\n- [x] b"));
	const { lines: out, removed } = removeEntries(["- [x] a edited", "- [x] b"], entries);
	assert.deepEqual(out, ["- [x] a edited"]);
	assert.equal(removed.length, 1);
});

test("appendLines", () => {
	assert.equal(appendLines("", ["- [x] a"]), "- [x] a\n");
	assert.equal(appendLines("# Archive", ["- [x] a", "- [x] b"]), "# Archive\n- [x] a\n- [x] b\n");
	assert.equal(appendLines("x\r\n", ["- [x] a"]), "x\r\n- [x] a\r\n");
});
