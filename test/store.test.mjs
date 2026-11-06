import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { DEFAULT_SETTINGS } from "../src/settings.js";
import { TodoStore } from "../src/store.js";
import { MockVault } from "./mock-vault.mjs";
import { moment } from "./stub-obsidian.mjs";

let settings;

function makeStore(files = {}) {
	const vault = new MockVault(files);
	const store = new TodoStore({ vault }, () => settings);
	return { vault, store };
}

beforeEach(() => {
	moment.setNow("2026-11-06");
	settings = { ...DEFAULT_SETTINGS };
});

test("addTodo creates the note, and the folders above it, on first use", async () => {
	settings.notePath = "Lists/Personal/To-do";
	const { vault, store } = makeStore();
	assert.equal(await store.addTodo("buy milk"), true);
	assert.equal(vault.text("Lists/Personal/To-do.md"), "- [ ] buy milk\n");
	assert.ok(vault.getAbstractFileByPath("Lists"));
	assert.ok(vault.getAbstractFileByPath("Lists/Personal"));
});

test("addTodo ignores empty text and does not create the note", async () => {
	const { vault, store } = makeStore();
	assert.equal(await store.addTodo("  \n "), false);
	assert.equal(vault.getAbstractFileByPath("To-do.md"), null);
});

test("addTodo adds at the bottom or the top, with an optional date", async () => {
	const { vault, store } = makeStore({ "To-do.md": "# To-do\n- [ ] a\n- [ ] b\n" });
	await store.addTodo("c");
	settings.addPosition = "top";
	settings.addCreatedDate = true;
	await store.addTodo("d");
	assert.equal(vault.text("To-do.md"), "# To-do\n- [ ] d ➕ 2026-11-06\n- [ ] a\n- [ ] b\n- [ ] c\n");
});

test("addTodo adds to an existing note without disturbing other content", async () => {
	const original = "---\ntitle: Stuff\n---\nSome intro\n\n- [x] old\n\n## Notes\nhello\n";
	const { vault, store } = makeStore({ "To-do.md": original });
	await store.addTodo("new");
	assert.equal(vault.text("To-do.md"), "---\ntitle: Stuff\n---\nSome intro\n\n- [x] old\n- [ ] new\n\n## Notes\nhello\n");
});

test("a note path without .md gets one, and odd slashes are tidied", async () => {
	settings.notePath = "/Inbox//Tasks/";
	const { store } = makeStore();
	assert.deepEqual(store.targetPaths(), ["Inbox/Tasks.md"]);
	settings.notePath = "   ";
	assert.deepEqual(store.targetPaths(), ["To-do.md"]);
});

test("loadLists reads items with their note, and copes with a missing note", async () => {
	const { store } = makeStore();
	let lists = await store.loadLists();
	assert.deepEqual(lists, [{ path: "To-do.md", label: "To-do", exists: false, items: [] }]);

	const made = makeStore({ "To-do.md": "- [ ] a\n- [x] b\n" });
	lists = await made.store.loadLists();
	assert.equal(lists[0].exists, true);
	assert.deepEqual(lists[0].items.map((i) => [i.path, i.text, i.checked]), [["To-do.md", "a", false], ["To-do.md", "b", true]]);
});

test("toggleItem ticks and unticks", async () => {
	const { vault, store } = makeStore({ "To-do.md": "- [ ] a\n- [ ] b\n" });
	let [{ items }] = await store.loadLists();
	assert.equal(await store.toggleItem(items[1]), true);
	assert.equal(vault.text("To-do.md"), "- [ ] a\n- [x] b\n");
	[{ items }] = await store.loadLists();
	assert.equal(await store.toggleItem(items[1]), true);
	assert.equal(vault.text("To-do.md"), "- [ ] a\n- [ ] b\n");
});

test("toggleItem still finds its line after the note changed elsewhere", async () => {
	const { vault, store } = makeStore({ "To-do.md": "- [ ] a\n- [ ] b\n" });
	const [{ items }] = await store.loadLists();
	// Another device inserts two lines above before the tap is processed.
	vault.contents.set("To-do.md", "- [ ] new 1\n- [ ] new 2\n- [ ] a\n- [ ] b\n");
	assert.equal(await store.toggleItem(items[1]), true);
	assert.equal(vault.text("To-do.md"), "- [ ] new 1\n- [ ] new 2\n- [ ] a\n- [x] b\n");
});

test("changes are refused, and nothing is written, if the item is gone", async () => {
	const { vault, store } = makeStore({ "To-do.md": "- [ ] a\n- [ ] b\n" });
	const [{ items }] = await store.loadLists();
	vault.contents.set("To-do.md", "- [ ] a\n- [ ] b renamed\n");
	assert.equal(await store.toggleItem(items[1]), false);
	assert.equal(await store.editItem(items[1], "x"), false);
	assert.equal(await store.deleteItem(items[1]), false);
	assert.equal(vault.text("To-do.md"), "- [ ] a\n- [ ] b renamed\n");
});

test("editItem changes the text and keeps the box, marker and date stamp", async () => {
	const { vault, store } = makeStore({ "To-do.md": "- [x] a typo ➕ 2026-10-01\n- [ ] b\n" });
	const [{ items }] = await store.loadLists();
	assert.equal(await store.editItem(items[0], "a fix"), true);
	assert.equal(vault.text("To-do.md"), "- [x] a fix ➕ 2026-10-01\n- [ ] b\n");
	assert.equal(await store.editItem(items[0], "   "), false);
});

test("deleteItem removes the item and the notes under it, but keeps nested tasks", async () => {
	const { vault, store } = makeStore({ "To-do.md": "- [ ] a\n  - note\n  - [ ] child\n- [ ] b\n" });
	const [{ items }] = await store.loadLists();
	assert.equal(await store.deleteItem(items[0]), true);
	assert.equal(vault.text("To-do.md"), "  - [ ] child\n- [ ] b\n");
});

test("clearCompleted removes ticked items, with their notes", async () => {
	const { vault, store } = makeStore({ "To-do.md": "# List\n- [x] a\n  - note\n- [ ] b\n- [x] c\n" });
	assert.equal(await store.clearCompleted(), 2);
	assert.equal(vault.text("To-do.md"), "# List\n- [ ] b\n");
	assert.equal(await store.clearCompleted(), 0);
});

test("clearCompleted moves items to the archive note first when one is set", async () => {
	settings.archivePath = "Archive/To-do archive";
	const { vault, store } = makeStore({ "To-do.md": "- [x] a\n- [ ] b\n- [x] c\n" });
	assert.equal(await store.clearCompleted(), 2);
	assert.equal(vault.text("To-do.md"), "- [ ] b\n");
	assert.equal(vault.text("Archive/To-do archive.md"), "- [x] a\n- [x] c\n");
	// A second run appends rather than replaces.
	await store.addTodo("d");
	const [{ items }] = await store.loadLists();
	await store.toggleItem(items.find((i) => i.text === "d"));
	await store.clearCompleted();
	assert.equal(vault.text("Archive/To-do archive.md"), "- [x] a\n- [x] c\n- [x] d\n");
});

test("an archive note that is also the to-do note is ignored, so nothing is duplicated", async () => {
	settings.archivePath = "To-do.md";
	const { vault, store } = makeStore({ "To-do.md": "- [x] a\n- [ ] b\n" });
	assert.equal(await store.clearCompleted(), 1);
	assert.equal(vault.text("To-do.md"), "- [ ] b\n");
});

test("daily mode: today's note, with earlier days listed newest first", async () => {
	settings.location = "daily";
	settings.dailyFolder = "Daily";
	settings.dailyDaysBack = 2;
	const { vault, store } = makeStore({
		"Daily/2026-11-05.md": "- [ ] yesterday\n",
		"Daily/2026-11-03.md": "- [ ] older\n",
	});
	assert.deepEqual(store.targetPaths(), ["Daily/2026-11-06.md", "Daily/2026-11-05.md", "Daily/2026-11-04.md"]);

	await store.addTodo("today");
	assert.equal(vault.text("Daily/2026-11-06.md"), "- [ ] today\n");

	const lists = await store.loadLists();
	assert.deepEqual(lists.map((l) => [l.label, l.exists, l.items.map((i) => i.text)]), [
		["2026-11-06", true, ["today"]],
		["2026-11-05", true, ["yesterday"]],
		["2026-11-04", false, []],
	]);

	// Ticking an item from an earlier day changes that day's note, not today's.
	await store.toggleItem(lists[1].items[0]);
	assert.equal(vault.text("Daily/2026-11-05.md"), "- [x] yesterday\n");
	assert.equal(vault.text("Daily/2026-11-06.md"), "- [ ] today\n");
});

test("daily mode with a date format that has no day gives one note, not several copies", () => {
	settings.location = "daily";
	settings.dailyFormat = "YYYY-MM";
	settings.dailyDaysBack = 5;
	const { store } = makeStore();
	assert.deepEqual(store.targetPaths(), ["2026-11.md"]);
});

test("ensureFile refuses a folder with the note's name", async () => {
	const { vault, store } = makeStore();
	await vault.createFolder("To-do.md");
	await assert.rejects(() => store.ensureFile("To-do.md"), /is a folder/);
});

test("ensureFile waits for a note that exists on disk but is not indexed yet, instead of overwriting it", async () => {
	const { vault, store } = makeStore();
	vault.unindexed.add("To-do.md");
	setTimeout(() => {
		vault.unindexed.delete("To-do.md");
		vault.seed("To-do.md", "- [ ] from sync\n");
	}, 400);
	const file = await store.ensureFile("To-do.md");
	assert.equal(file.path, "To-do.md");
	assert.equal(vault.text("To-do.md"), "- [ ] from sync\n");
});

test("ensureFile gives up with an error if the note never appears", async () => {
	const { vault, store } = makeStore();
	vault.unindexed.add("To-do.md");
	await assert.rejects(() => store.addTodo("x"), /already exists/);
	assert.equal(vault.contents.has("To-do.md"), false);
});
