import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import QuickTodoPlugin from "../src/main.js";
import { NoteBars } from "../src/note-bar.js";
import { FakeEl } from "./fake-dom.mjs";
import { MockVault } from "./mock-vault.mjs";
import { Notice, moment } from "./stub-obsidian.mjs";

/** A note view with some content already in it, like Obsidian's editor or WYSIWYG Mode. */
function noteView(path) {
	const contentEl = new FakeEl();
	contentEl.createDiv({ cls: "the-note" });
	return { file: path === null ? null : { path }, contentEl };
}

const appWith = (...views) => ({ workspace: { iterateAllLeaves: (cb) => views.forEach((view) => cb({ view })) } });
const barsIn = (view) => view.contentEl.findAll("quick-todo-note-bar");
const noop = async () => true;

beforeEach(() => {
	moment.setNow("2026-11-06");
	Notice.messages.length = 0;
});

test("the bar goes above the note's content, in a view showing the to-do note only", () => {
	const todo = noteView("To-do.md");
	const other = noteView("Other.md");
	new NoteBars().sync(appWith(todo, other), ["To-do.md"], true, noop);
	assert.equal(barsIn(todo).length, 1);
	assert.equal(todo.contentEl.children[0].hasClass("quick-todo-note-bar"), true);
	assert.equal(todo.contentEl.children[1].hasClass("the-note"), true);
	assert.equal(todo.contentEl.hasClass("quick-todo-has-bar"), true);
	assert.equal(barsIn(other).length, 0);
	assert.equal(other.contentEl.hasClass("quick-todo-has-bar"), false);
});

test("the bar has an input, an Add button and the same look as the list's add row", () => {
	const todo = noteView("To-do.md");
	new NoteBars().sync(appWith(todo), ["To-do.md"], true, noop);
	const bar = barsIn(todo)[0];
	assert.equal(bar.hasClass("quick-todo-add"), true);
	assert.equal(bar.find("quick-todo-input").attrs.placeholder, "Add a to-do");
	assert.equal(bar.find("mod-cta").text, "Add");
});

test("typing and pressing Enter or Add adds the item and clears the box", async () => {
	const todo = noteView("To-do.md");
	const added = [];
	new NoteBars().sync(appWith(todo), ["To-do.md"], true, async (text) => {
		added.push(text);
		return true;
	});
	const bar = barsIn(todo)[0];
	const input = bar.find("quick-todo-input");

	input.value = "first";
	await input.fire("keydown", { key: "Enter" });
	assert.deepEqual(added, ["first"]);
	assert.equal(input.value, "");
	assert.equal(input.focused, true);

	input.value = "second";
	await bar.find("mod-cta").click();
	assert.deepEqual(added, ["first", "second"]);
});

test("Enter while an input method is composing, empty text, and other keys add nothing", async () => {
	const todo = noteView("To-do.md");
	const added = [];
	new NoteBars().sync(appWith(todo), ["To-do.md"], true, async (text) => {
		added.push(text);
		return true;
	});
	const input = barsIn(todo)[0].find("quick-todo-input");
	input.value = "typing";
	await input.fire("keydown", { key: "Enter", isComposing: true });
	await input.fire("keydown", { key: "a" });
	input.value = "   ";
	await input.fire("keydown", { key: "Enter" });
	assert.deepEqual(added, []);
});

test("a failed add keeps the typed text and shows a notice", async () => {
	const todo = noteView("To-do.md");
	new NoteBars().sync(appWith(todo), ["To-do.md"], true, async () => {
		throw new Error("disk full");
	});
	const input = barsIn(todo)[0].find("quick-todo-input");
	input.value = "keep me";
	await input.fire("keydown", { key: "Enter" });
	assert.equal(input.value, "keep me");
	assert.match(Notice.messages.at(-1), /disk full/);
});

test("syncing again keeps one bar, and the text typed in it", () => {
	const todo = noteView("To-do.md");
	const app = appWith(todo);
	const bars = new NoteBars();
	bars.sync(app, ["To-do.md"], true, noop);
	barsIn(todo)[0].find("quick-todo-input").value = "half typed";
	bars.sync(app, ["To-do.md"], true, noop);
	assert.equal(barsIn(todo).length, 1);
	assert.equal(barsIn(todo)[0].find("quick-todo-input").value, "half typed");
});

test("when the view moves to another note the bar goes, and comes back on return", () => {
	const view = noteView("To-do.md");
	const app = appWith(view);
	const bars = new NoteBars();
	bars.sync(app, ["To-do.md"], true, noop);
	view.file = { path: "Other.md" };
	bars.sync(app, ["To-do.md"], true, noop);
	assert.equal(barsIn(view).length, 0);
	assert.equal(view.contentEl.hasClass("quick-todo-has-bar"), false);
	view.file = { path: "To-do.md" };
	bars.sync(app, ["To-do.md"], true, noop);
	assert.equal(barsIn(view).length, 1);
});

test("a bar that was thrown away when the view redrew is added again", () => {
	const view = noteView("To-do.md");
	const app = appWith(view);
	const bars = new NoteBars();
	bars.sync(app, ["To-do.md"], true, noop);
	view.contentEl.empty();
	view.contentEl.createDiv({ cls: "the-note" });
	bars.sync(app, ["To-do.md"], true, noop);
	assert.equal(barsIn(view).length, 1);
	assert.equal(view.contentEl.children[0].hasClass("quick-todo-note-bar"), true);
});

test("turning it off, closing a view, and clear all take the bar away", () => {
	const a = noteView("To-do.md");
	const b = noteView("To-do.md");
	const bars = new NoteBars();
	bars.sync(appWith(a, b), ["To-do.md"], true, noop);
	assert.deepEqual([a, b].map((v) => barsIn(v).length), [1, 1]);

	bars.sync(appWith(a), ["To-do.md"], true, noop); // b was closed
	assert.equal(bars.bars.size, 1);

	bars.sync(appWith(a), ["To-do.md"], false, noop); // setting off
	assert.equal(barsIn(a).length, 0);
	assert.equal(a.contentEl.hasClass("quick-todo-has-bar"), false);

	bars.sync(appWith(a, b), ["To-do.md"], true, noop);
	bars.clear();
	assert.deepEqual([a, b].map((v) => barsIn(v).length), [0, 0]);
	assert.equal(bars.bars.size, 0);
});

test("views with no content area or no file are skipped without error", () => {
	const noFile = noteView(null);
	const noContent = { file: { path: "To-do.md" } };
	const nothing = null;
	const app = { workspace: { iterateAllLeaves: (cb) => [noFile, noContent, nothing].forEach((view) => cb({ view })) } };
	assert.doesNotThrow(() => new NoteBars().sync(app, ["To-do.md"], true, noop));
	assert.equal(barsIn(noFile).length, 0);
});

// ---- wiring in the plugin ----

function pluginWith(views, files = {}, settings = {}) {
	const vault = new MockVault(files);
	const workspace = {
		listeners: [],
		on(name, callback) {
			const ref = { name, callback };
			this.listeners.push(ref);
			return ref;
		},
		onLayoutReady(callback) {
			this.ready = callback;
		},
		views,
		iterateAllLeaves(cb) {
			this.views.forEach((view) => cb({ view }));
		},
		getLeavesOfType: () => [],
	};
	const plugin = new QuickTodoPlugin({ vault, workspace }, { id: "quick-todo" });
	plugin.stored = settings;
	return { plugin, workspace, vault };
}

test("opening the to-do note from a bookmark shows the bar, and adding from it writes to the note", async () => {
	const { plugin, workspace, vault } = pluginWith([], { "To-do.md": "- [ ] a\n" });
	await plugin.onload();
	workspace.ready();

	const bookmarked = noteView("To-do.md");
	workspace.views = [bookmarked];
	workspace.listeners.find((l) => l.name === "file-open").callback();
	assert.equal(barsIn(bookmarked).length, 1);

	const input = barsIn(bookmarked)[0].find("quick-todo-input");
	input.value = "from the bar";
	await input.fire("keydown", { key: "Enter" });
	assert.equal(vault.text("To-do.md"), "- [ ] a\n- [ ] from the bar\n");
	assert.equal(input.value, "");
	plugin.unload();
});

test("the setting turns the bar off and on, it is on by default, and unloading removes it", async () => {
	const todo = noteView("To-do.md");
	const { plugin, workspace } = pluginWith([todo]);
	await plugin.onload();
	assert.equal(plugin.settings.showNoteBar, true);
	workspace.ready();
	assert.equal(barsIn(todo).length, 1);

	plugin.settings.showNoteBar = false;
	await plugin.saveSettings();
	assert.equal(barsIn(todo).length, 0);

	plugin.settings.showNoteBar = true;
	await plugin.saveSettings();
	assert.equal(barsIn(todo).length, 1);

	plugin.unload();
	assert.equal(barsIn(todo).length, 0);
	assert.equal(todo.contentEl.hasClass("quick-todo-has-bar"), false);
});

test("changing the to-do note in settings moves the bar to the new note", async () => {
	const todo = noteView("To-do.md");
	const inbox = noteView("Inbox.md");
	const { plugin, workspace } = pluginWith([todo, inbox]);
	await plugin.onload();
	workspace.ready();
	assert.deepEqual([todo, inbox].map((v) => barsIn(v).length), [1, 0]);

	plugin.settings.notePath = "Inbox.md";
	await plugin.saveSettings();
	assert.deepEqual([todo, inbox].map((v) => barsIn(v).length), [0, 1]);
	plugin.unload();
});
