import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { AddModal, EditModal } from "../src/modals.js";
import { DEFAULT_SETTINGS, QuickTodoSettingTab } from "../src/settings.js";
import { TodoStore } from "../src/store.js";
import { TodoView } from "../src/view.js";
import { Notice, Setting, moment } from "./stub-obsidian.mjs";
import { MockVault } from "./mock-vault.mjs";

function setup(files = {}, overrides = {}) {
	const vault = new MockVault(files);
	const settings = { ...DEFAULT_SETTINGS, ...overrides };
	const store = new TodoStore({ vault }, () => settings);
	const plugin = {
		settings,
		store,
		saves: 0,
		opened: 0,
		saveSettings: async () => {
			plugin.saves++;
		},
		openNote: async () => {
			plugin.opened++;
		},
	};
	const app = { vault };
	return { vault, settings, store, plugin, app };
}

async function openView(files, overrides) {
	const s = setup(files, overrides);
	const view = new TodoView({ app: s.app }, s.plugin);
	await view.onOpen();
	return { ...s, view };
}

const texts = (view, cls) => view.listEl.findAll(cls).map((row) => row.find("quick-todo-text").text);

beforeEach(() => {
	moment.setNow("2026-11-06");
	Notice.messages.length = 0;
});

// ---- list view ----

test("the list shows open items, and finished ones in a Done section", async () => {
	const { view } = await openView({ "To-do.md": "- [ ] a\n- [x] b\n- [ ] c\n" });
	assert.deepEqual(texts(view, "is-open"), ["a", "c"]);
	assert.deepEqual(texts(view, "is-done"), ["b"]);
	assert.match(view.listEl.find("quick-todo-done").allText, /Done \(1\)/);
	assert.equal(view.listEl.find("quick-todo-source").allText, "To-do.md");
});

test("the list says so when there is nothing to do, or everything is done", async () => {
	let { view } = await openView({});
	assert.match(view.listEl.find("quick-todo-empty").text, /Nothing to do yet/);
	({ view } = await openView({ "To-do.md": "- [x] a\n" }));
	assert.equal(view.listEl.find("quick-todo-empty").text, "All done.");
});

test("ticking an item moves it to Done", async () => {
	const { view, vault } = await openView({ "To-do.md": "- [ ] a\n- [ ] b\n" });
	const box = view.listEl.findAll("quick-todo-check")[0];
	box.checked = true;
	await box.fire("change");
	assert.equal(vault.text("To-do.md"), "- [x] a\n- [ ] b\n");
	assert.deepEqual(texts(view, "is-open"), ["b"]);
	assert.deepEqual(texts(view, "is-done"), ["a"]);
});

test("unticking an item in Done brings it back", async () => {
	const { view, vault } = await openView({ "To-do.md": "- [x] a\n" });
	await view.listEl.findAll("quick-todo-check")[0].fire("change");
	assert.equal(vault.text("To-do.md"), "- [ ] a\n");
	assert.deepEqual(texts(view, "is-open"), ["a"]);
});

test("a tap on an item that changed underneath it explains and refreshes", async () => {
	const { view, vault } = await openView({ "To-do.md": "- [ ] a\n" });
	vault.contents.set("To-do.md", "- [ ] a changed\n");
	await view.listEl.findAll("quick-todo-check")[0].fire("change");
	assert.match(Notice.messages.at(-1), /changed in the note/);
	assert.equal(vault.text("To-do.md"), "- [ ] a changed\n");
	assert.deepEqual(texts(view, "is-open"), ["a changed"]);
});

test("the add box adds an item with Enter or the Add button, and ignores Enter mid-composition", async () => {
	const { view, vault } = await openView({ "To-do.md": "- [ ] a\n" });
	view.inputEl.value = "b";
	await view.inputEl.fire("keydown", { key: "Enter", isComposing: true });
	assert.equal(vault.text("To-do.md"), "- [ ] a\n");

	await view.inputEl.fire("keydown", { key: "Enter" });
	assert.equal(vault.text("To-do.md"), "- [ ] a\n- [ ] b\n");
	assert.equal(view.inputEl.value, "");
	assert.equal(view.inputEl.focused, true);
	assert.deepEqual(texts(view, "is-open"), ["a", "b"]);

	view.inputEl.value = "c";
	await view.contentEl.find("mod-cta").click();
	assert.equal(vault.text("To-do.md"), "- [ ] a\n- [ ] b\n- [ ] c\n");

	view.inputEl.value = "   ";
	await view.add();
	assert.equal(vault.text("To-do.md"), "- [ ] a\n- [ ] b\n- [ ] c\n");
});

test("the add box keeps the typed text and shows a notice when adding fails", async () => {
	const { view, store } = await openView({});
	store.addTodo = async () => {
		throw new Error("disk full");
	};
	view.inputEl.value = "keep me";
	await view.add();
	assert.equal(view.inputEl.value, "keep me");
	assert.match(Notice.messages.at(-1), /disk full/);
	assert.equal(view.busy, false);
});

test("the Done section collapses and remembers it", async () => {
	const { view, settings, plugin } = await openView({ "To-do.md": "- [ ] a\n- [x] b\n" });
	await view.listEl.find("quick-todo-done-toggle").click();
	assert.equal(settings.doneOpen, false);
	assert.equal(plugin.saves, 1);
	assert.deepEqual(texts(view, "is-done"), []);
	assert.match(view.listEl.find("quick-todo-done").allText, /Done \(1\)/);
	await view.listEl.find("quick-todo-done-toggle").click();
	assert.deepEqual(texts(view, "is-done"), ["b"]);
});

test("Clear needs two taps, then removes finished items", async () => {
	const { view, vault } = await openView({ "To-do.md": "- [ ] a\n- [x] b\n" });
	const clear = view.listEl.find("quick-todo-clear");
	assert.equal(clear.text, "Clear");
	await clear.click();
	assert.equal(clear.text, "Tap again to confirm");
	assert.equal(vault.text("To-do.md"), "- [ ] a\n- [x] b\n");
	await clear.click();
	assert.equal(vault.text("To-do.md"), "- [ ] a\n");
	assert.match(Notice.messages.at(-1), /Cleared 1 finished item\./);
	assert.equal(view.listEl.find("quick-todo-done"), null);
});

test("Clear is called Archive when an archive note is set", async () => {
	const { view, vault } = await openView({ "To-do.md": "- [x] b\n" }, { archivePath: "Archive.md" });
	const button = view.listEl.find("quick-todo-clear");
	assert.equal(button.text, "Archive");
	await button.click();
	await button.click();
	assert.equal(vault.text("Archive.md"), "- [x] b\n");
	assert.match(Notice.messages.at(-1), /Archived 1 finished item\./);
});

test("added dates show as short dates, and open items waiting two weeks or more are flagged", async () => {
	const note = "- [ ] old ➕ 2026-10-01\n- [ ] recent ➕ 2026-11-05\n- [x] finished long ago ➕ 2026-09-01\n- [ ] undated\n- [ ] bad ➕ 2026-13-45\n";
	const { view } = await openView({ "To-do.md": note });
	const rows = view.listEl.findAll("quick-todo-item");
	const dateOf = (row) => row.find("quick-todo-date");
	assert.equal(dateOf(rows[0]).text, "1 Oct");
	assert.equal(dateOf(rows[0]).hasClass("is-stale"), true);
	assert.equal(dateOf(rows[1]).text, "5 Nov");
	assert.equal(dateOf(rows[1]).hasClass("is-stale"), false);
	assert.equal(dateOf(rows[2]), null);
	// The stamp is not repeated in the item's text.
	assert.equal(rows[0].find("quick-todo-text").text, "old");
	// An impossible date is left as plain text instead of crashing.
	assert.equal(rows[3].find("quick-todo-text").text, "bad ➕ 2026-13-45");
	// Finished items are never flagged.
	const done = view.listEl.findAll("is-done")[0];
	assert.equal(dateOf(done).hasClass("is-stale"), false);
});

test("nested items are indented by level, capped at three", async () => {
	const { view } = await openView({ "To-do.md": "- [ ] a\n  - [ ] b\n    - [ ] c\n        - [ ] d\n                - [ ] e\n" });
	const classes = view.listEl.findAll("quick-todo-item").map((row) => [1, 2, 3].find((n) => row.hasClass(`quick-todo-depth-${n}`)) ?? 0);
	assert.deepEqual(classes, [0, 1, 1, 2, 3]);
});

test("daily mode groups open items under their day", async () => {
	const { view } = await openView(
		{ "Daily/2026-11-06.md": "- [ ] today\n", "Daily/2026-11-05.md": "- [ ] yesterday\n" },
		{ location: "daily", dailyFolder: "Daily", dailyDaysBack: 1 },
	);
	assert.deepEqual(view.listEl.findAll("quick-todo-group-title").map((el) => el.text), ["2026-11-06", "2026-11-05"]);
	assert.equal(view.listEl.find("quick-todo-source").allText, "Today and the last 1 days");
});

test("tapping an item or its pencil opens the editor; tapping the note name opens the note", async () => {
	const { view, plugin } = await openView({ "To-do.md": "- [ ] a\n" });
	const opened = [];
	view.edit = (item) => opened.push(item.text);
	await view.listEl.find("quick-todo-text").click();
	await view.listEl.find("quick-todo-edit").click();
	await view.listEl.find("quick-todo-text").fire("keydown", { key: "Enter" });
	await view.listEl.find("quick-todo-text").fire("keydown", { key: "a" });
	assert.deepEqual(opened, ["a", "a", "a"]);
	await view.listEl.find("quick-todo-source").children[0].click();
	assert.equal(plugin.opened, 1);
});

test("a redraw keeps the scroll position", async () => {
	const { view } = await openView({ "To-do.md": "- [ ] a\n" });
	view.contentEl.scrollTop = 120;
	await view.refresh();
	assert.equal(view.contentEl.scrollTop, 120);
});

test("the list shows an error message instead of crashing when the note cannot be read", async () => {
	const { view, store } = await openView({ "To-do.md": "- [ ] a\n" });
	store.loadLists = async () => {
		throw new Error("boom");
	};
	await view.refresh();
	assert.match(view.listEl.find("quick-todo-empty").text, /boom/);
});

// ---- dialogs ----

test("the add dialog adds, closes and confirms", async () => {
	const { app, plugin, vault } = setup({ "To-do.md": "- [ ] a\n" });
	const modal = new AddModal(app, plugin);
	modal.open();
	assert.equal(modal.inputEl.focused, true);
	modal.inputEl.value = "b";
	await modal.inputEl.fire("keydown", { key: "Enter" });
	assert.equal(vault.text("To-do.md"), "- [ ] a\n- [ ] b\n");
	assert.equal(modal.isOpen, false);
	assert.equal(Notice.messages.at(-1), "Added to your to-do list.");
});

test("the add dialog can stay open for several items", async () => {
	const { app, plugin, vault } = setup({}, { keepBoxOpen: true });
	const modal = new AddModal(app, plugin);
	modal.open();
	for (const text of ["one", "two"]) {
		modal.inputEl.value = text;
		await modal.contentEl.find("mod-cta").click();
	}
	assert.equal(vault.text("To-do.md"), "- [ ] one\n- [ ] two\n");
	assert.equal(modal.isOpen, true);
	assert.equal(modal.inputEl.value, "");
	assert.equal(modal.statusEl.text, "Added 2");
});

test("the add dialog can be pre-filled, ignores empty text, and stays open on an error", async () => {
	const { app, plugin, vault } = setup();
	const modal = new AddModal(app, plugin, "from a link");
	modal.open();
	assert.equal(modal.inputEl.value, "from a link");

	modal.inputEl.value = "  ";
	await modal.submit();
	assert.equal(vault.getAbstractFileByPath("To-do.md"), null);

	plugin.store.addTodo = async () => {
		throw new Error("no space");
	};
	modal.inputEl.value = "x";
	await modal.submit();
	assert.equal(modal.isOpen, true);
	assert.match(Notice.messages.at(-1), /no space/);
	assert.equal(modal.busy, false);
});

test("the edit dialog shows the text without its date, saves it with the date kept, and closes", async () => {
	const { app, plugin, vault, store } = setup({ "To-do.md": "- [ ] typo ➕ 2026-10-01\n" });
	const [{ items }] = await store.loadLists();
	let changed = 0;
	const modal = new EditModal(app, plugin, items[0], async () => {
		changed++;
	});
	modal.open();
	assert.equal(modal.inputEl.value, "typo");
	modal.inputEl.value = "fixed";
	await modal.inputEl.fire("keydown", { key: "Enter" });
	assert.equal(vault.text("To-do.md"), "- [ ] fixed ➕ 2026-10-01\n");
	assert.equal(modal.isOpen, false);
	assert.equal(changed, 1);
});

test("the edit dialog needs two taps to delete", async () => {
	const { app, plugin, vault, store } = setup({ "To-do.md": "- [ ] a\n- [ ] b\n" });
	const [{ items }] = await store.loadLists();
	let changed = 0;
	const modal = new EditModal(app, plugin, items[0], async () => {
		changed++;
	});
	modal.open();
	const del = modal.contentEl.findAll("quick-todo-buttons")[0].children[0];
	assert.equal(del.text, "Delete");
	await del.click();
	assert.equal(del.text, "Tap again to delete");
	assert.equal(vault.text("To-do.md"), "- [ ] a\n- [ ] b\n");
	await del.click();
	assert.equal(vault.text("To-do.md"), "- [ ] b\n");
	assert.equal(modal.isOpen, false);
	assert.equal(changed, 1);
});

test("the edit dialog does not save empty text, and explains when the item has changed", async () => {
	const { app, plugin, vault, store } = setup({ "To-do.md": "- [ ] a\n" });
	const [{ items }] = await store.loadLists();
	const modal = new EditModal(app, plugin, items[0], async () => {});
	modal.open();
	modal.inputEl.value = "   ";
	await modal.save();
	assert.equal(modal.isOpen, true);
	assert.equal(vault.text("To-do.md"), "- [ ] a\n");

	vault.contents.set("To-do.md", "- [ ] a changed\n");
	modal.inputEl.value = "new";
	await modal.save();
	assert.match(Notice.messages.at(-1), /changed in the note/);
	assert.equal(vault.text("To-do.md"), "- [ ] a changed\n");
});

// ---- settings screen ----

function showSettings(overrides = {}) {
	const { app, plugin } = setup({}, overrides);
	const tab = new QuickTodoSettingTab(app, plugin);
	Setting.created.length = 0;
	tab.display();
	const names = () => Setting.created.map((s) => s.name);
	const get = (name) => Setting.created.find((s) => s.name === name);
	return { plugin, tab, names, get };
}

test("settings for a fixed note", () => {
	const { names } = showSettings();
	assert.deepEqual(names(), ["Save to-dos in", "To-do note", "Add new items at", "Add the date to new items", "Keep the add box open", "Archive note"]);
});

test("settings for the daily note, reached by switching the first setting", async () => {
	const { get, plugin } = showSettings();
	const dropdown = get("Save to-dos in").control;
	assert.deepEqual(dropdown.options.map(([value]) => value), ["fixed", "daily"]);

	Setting.created.length = 0; // from here on, only what the redraw builds
	await dropdown.change("daily");
	assert.equal(plugin.settings.location, "daily");
	assert.deepEqual(Setting.created.map((x) => x.name), [
		"Save to-dos in",
		"Daily note folder",
		"Daily note date format",
		"Include earlier days",
		"Add new items at",
		"Add the date to new items",
		"Keep the add box open",
		"Archive note",
	]);
});

test("changing a setting saves it", async () => {
	const { get, plugin } = showSettings();
	await get("To-do note").control.change("  Inbox  ");
	assert.equal(plugin.settings.notePath, "Inbox");
	await get("To-do note").control.change("   ");
	assert.equal(plugin.settings.notePath, "To-do.md");
	await get("Add new items at").control.change("top");
	await get("Add the date to new items").control.change(true);
	await get("Keep the add box open").control.change(true);
	await get("Archive note").control.change(" Done.md ");
	assert.deepEqual(
		[plugin.settings.addPosition, plugin.settings.addCreatedDate, plugin.settings.keepBoxOpen, plugin.settings.archivePath],
		["top", true, true, "Done.md"],
	);
	assert.equal(plugin.saves, 6);
});
