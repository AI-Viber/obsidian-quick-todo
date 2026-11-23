import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import QuickTodoPlugin from "../src/main.js";
import { NoteButtons } from "../src/note-button.js";
import { FakeEl } from "./fake-dom.mjs";
import { MockVault } from "./mock-vault.mjs";
import { moment } from "./stub-obsidian.mjs";

/** A note view like Obsidian's, with a header that actions are added to. */
function noteView(path) {
	const header = new FakeEl();
	return {
		file: path === null ? null : { path },
		header,
		actions: [],
		addAction(icon, title, callback) {
			const el = header.createDiv({ cls: "view-action", attr: { "aria-label": title } });
			el.icon = icon;
			el.callback = callback;
			this.actions.push(el);
			return el;
		},
	};
}

const appWith = (...views) => ({ workspace: { iterateAllLeaves: (cb) => views.forEach((view) => cb({ view })) } });
const buttonsIn = (view) => view.header.findAll("view-action");

test("the button is added to a view showing the to-do note, and only that one", () => {
	const todo = noteView("To-do.md");
	const other = noteView("Other.md");
	new NoteButtons().sync(appWith(todo, other), ["To-do.md"], true, "Add to-do", () => {});
	assert.equal(buttonsIn(todo).length, 1);
	assert.equal(buttonsIn(todo)[0].icon, "plus-circle");
	assert.equal(buttonsIn(todo)[0].attrs["aria-label"], "Add to-do");
	assert.equal(buttonsIn(other).length, 0);
});

test("clicking the button runs the action", async () => {
	const todo = noteView("To-do.md");
	let runs = 0;
	new NoteButtons().sync(appWith(todo), ["To-do.md"], true, "Add to-do", () => runs++);
	todo.actions[0].callback();
	assert.equal(runs, 1);
});

test("syncing again does not add a second button", () => {
	const todo = noteView("To-do.md");
	const app = appWith(todo);
	const buttons = new NoteButtons();
	buttons.sync(app, ["To-do.md"], true, "Add to-do", () => {});
	buttons.sync(app, ["To-do.md"], true, "Add to-do", () => {});
	assert.equal(buttonsIn(todo).length, 1);
});

test("when the view moves to another note the button goes, and comes back on return", () => {
	const view = noteView("To-do.md");
	const app = appWith(view);
	const buttons = new NoteButtons();
	buttons.sync(app, ["To-do.md"], true, "Add to-do", () => {});
	view.file = { path: "Other.md" };
	buttons.sync(app, ["To-do.md"], true, "Add to-do", () => {});
	assert.equal(buttonsIn(view).length, 0);
	view.file = { path: "To-do.md" };
	buttons.sync(app, ["To-do.md"], true, "Add to-do", () => {});
	assert.equal(buttonsIn(view).length, 1);
});

test("a button that Obsidian threw away when it redrew the header is added again", () => {
	const view = noteView("To-do.md");
	const app = appWith(view);
	const buttons = new NoteButtons();
	buttons.sync(app, ["To-do.md"], true, "Add to-do", () => {});
	view.header.empty();
	buttons.sync(app, ["To-do.md"], true, "Add to-do", () => {});
	assert.equal(buttonsIn(view).length, 1);
});

test("turning the setting off removes the buttons", () => {
	const view = noteView("To-do.md");
	const app = appWith(view);
	const buttons = new NoteButtons();
	buttons.sync(app, ["To-do.md"], true, "Add to-do", () => {});
	buttons.sync(app, ["To-do.md"], false, "Add to-do", () => {});
	assert.equal(buttonsIn(view).length, 0);
});

test("every watched note gets one (daily notes), and clear removes them all", () => {
	const a = noteView("Daily/2026-11-06.md");
	const b = noteView("Daily/2026-11-05.md");
	const c = noteView("Daily/2026-10-01.md");
	const buttons = new NoteButtons();
	buttons.sync(appWith(a, b, c), ["Daily/2026-11-06.md", "Daily/2026-11-05.md"], true, "Add to-do", () => {});
	assert.deepEqual([a, b, c].map((v) => buttonsIn(v).length), [1, 1, 0]);
	buttons.clear();
	assert.deepEqual([a, b, c].map((v) => buttonsIn(v).length), [0, 0, 0]);
});

test("views that cannot take actions, or show no file, are skipped without error", () => {
	const noFile = noteView(null);
	const noActions = { file: { path: "To-do.md" } };
	const nothing = null;
	const buttons = new NoteButtons();
	const app = { workspace: { iterateAllLeaves: (cb) => [noFile, noActions, nothing].forEach((view) => cb({ view })) } };
	assert.doesNotThrow(() => buttons.sync(app, ["To-do.md"], true, "Add to-do", () => {}));
	assert.equal(buttonsIn(noFile).length, 0);
});

test("a closed view's button is dropped from the bookkeeping", () => {
	const view = noteView("To-do.md");
	const buttons = new NoteButtons();
	buttons.sync(appWith(view), ["To-do.md"], true, "Add to-do", () => {});
	assert.equal(buttons.buttons.size, 1);
	buttons.sync(appWith(), ["To-do.md"], true, "Add to-do", () => {});
	assert.equal(buttons.buttons.size, 0);
});

// ---- wiring in the plugin ----

function pluginWith(views, settings = {}) {
	const vault = new MockVault({});
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
	return { plugin, workspace };
}

beforeEach(() => moment.setNow("2026-11-06"));

test("the plugin adds the button to the to-do note when it is opened, and tapping it opens the add box", async () => {
	const todo = noteView("To-do.md");
	const { plugin, workspace } = pluginWith([todo]);
	await plugin.onload();
	const opened = [];
	plugin.openAddBox = () => opened.push("add box");

	workspace.ready();
	assert.equal(buttonsIn(todo).length, 1);
	todo.actions[0].callback();
	assert.deepEqual(opened, ["add box"]);

	// Open from a bookmark: a different view now shows the note.
	const bookmarked = noteView("To-do.md");
	workspace.views = [bookmarked];
	workspace.listeners.find((l) => l.name === "file-open").callback();
	assert.equal(buttonsIn(bookmarked).length, 1);
	plugin.unload();
});

test("the setting turns the button off and on, and unloading removes it", async () => {
	const todo = noteView("To-do.md");
	const { plugin, workspace } = pluginWith([todo]);
	await plugin.onload();
	assert.equal(plugin.settings.showOnNote, true, "on by default");
	workspace.ready();
	assert.equal(buttonsIn(todo).length, 1);

	plugin.settings.showOnNote = false;
	await plugin.saveSettings();
	assert.equal(buttonsIn(todo).length, 0);

	plugin.settings.showOnNote = true;
	await plugin.saveSettings();
	assert.equal(buttonsIn(todo).length, 1);

	plugin.unload();
	assert.equal(buttonsIn(todo).length, 0);
});

test("changing the to-do note in settings moves the button to the new note", async () => {
	const todo = noteView("To-do.md");
	const inbox = noteView("Inbox.md");
	const { plugin, workspace } = pluginWith([todo, inbox]);
	await plugin.onload();
	workspace.ready();
	assert.deepEqual([todo, inbox].map((v) => buttonsIn(v).length), [1, 0]);

	plugin.settings.notePath = "Inbox.md";
	await plugin.saveSettings();
	assert.deepEqual([todo, inbox].map((v) => buttonsIn(v).length), [0, 1]);
	plugin.unload();
});

test("a view drawn just after the event gets its button on the delayed second look", async () => {
	const { plugin, workspace } = pluginWith([]);
	await plugin.onload();
	workspace.ready();
	const late = noteView("To-do.md");
	workspace.views = [late];
	await new Promise((resolve) => setTimeout(resolve, 260));
	assert.equal(buttonsIn(late).length, 1);
	plugin.unload();
});
