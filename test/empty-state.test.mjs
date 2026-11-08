import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { addEmptyStateAction, removeEmptyStateActions } from "../src/empty-state.js";
import QuickTodoPlugin from "../src/main.js";
import { FakeEl } from "./fake-dom.mjs";
import { MockVault } from "./mock-vault.mjs";
import { moment } from "./stub-obsidian.mjs";

/** An empty tab laid out like Obsidian's "No file is open" screen. */
function emptyTab(actions = ["Create new note (⌘ N)", "Go to file (⌘ O)", "See recent files", "Close"]) {
	const containerEl = new FakeEl();
	const state = containerEl.createDiv({ cls: "empty-state" });
	const box = state.createDiv({ cls: "empty-state-container" });
	box.createDiv({ cls: "empty-state-title", text: "No file is open" });
	const list = box.createDiv({ cls: "empty-state-action-list" });
	for (const text of actions) list.createDiv({ cls: "empty-state-action", text });
	return { leaf: { view: { containerEl } }, list };
}

const appWith = (...leaves) => ({ workspace: { getLeavesOfType: (type) => (type === "empty" ? leaves : []) } });
const labels = (list) => list.children.map((el) => el.text);

test("the entry is added before Close, so Close stays last", () => {
	const { leaf, list } = emptyTab();
	addEmptyStateAction(appWith(leaf), "Quick to-do", () => {});
	assert.deepEqual(labels(list), ["Create new note (⌘ N)", "Go to file (⌘ O)", "See recent files", "Quick to-do", "Close"]);
	// It looks like the other entries, so Obsidian's own styling applies.
	assert.equal(list.find("quick-todo-empty-action").hasClass("empty-state-action"), true);
});

test("adding twice does not duplicate the entry", () => {
	const { leaf, list } = emptyTab();
	const app = appWith(leaf);
	addEmptyStateAction(app, "Quick to-do", () => {});
	addEmptyStateAction(app, "Quick to-do", () => {});
	assert.equal(list.findAll("quick-todo-empty-action").length, 1);
});

test("tapping the entry, or pressing Enter or Space on it, runs the action", async () => {
	const { leaf, list } = emptyTab();
	let runs = 0;
	addEmptyStateAction(appWith(leaf), "Quick to-do", () => runs++);
	const entry = list.find("quick-todo-empty-action");
	await entry.click();
	await entry.fire("keydown", { key: "Enter" });
	await entry.fire("keydown", { key: " " });
	await entry.fire("keydown", { key: "a" });
	assert.equal(runs, 3);
});

test("every empty tab gets the entry", () => {
	const a = emptyTab();
	const b = emptyTab();
	addEmptyStateAction(appWith(a.leaf, b.leaf), "Quick to-do", () => {});
	assert.equal(a.list.findAll("quick-todo-empty-action").length, 1);
	assert.equal(b.list.findAll("quick-todo-empty-action").length, 1);
});

test("a screen with no action list is left alone, and so is one that is not drawn yet", () => {
	const noList = { view: { containerEl: new FakeEl() } };
	const noView = { view: null };
	assert.doesNotThrow(() => addEmptyStateAction(appWith(noList, noView), "Quick to-do", () => {}));
	assert.doesNotThrow(() => removeEmptyStateActions(appWith(noList, noView)));
	assert.equal(noList.view.containerEl.children.length, 0);
});

test("a list with nothing else in it still gets the entry", () => {
	const { leaf, list } = emptyTab([]);
	addEmptyStateAction(appWith(leaf), "Quick to-do", () => {});
	assert.deepEqual(labels(list), ["Quick to-do"]);
});

test("the entry can be removed again, leaving Obsidian's own entries as they were", () => {
	const { leaf, list } = emptyTab();
	const app = appWith(leaf);
	addEmptyStateAction(app, "Quick to-do", () => {});
	removeEmptyStateActions(app);
	assert.deepEqual(labels(list), ["Create new note (⌘ N)", "Go to file (⌘ O)", "See recent files", "Close"]);
});

// ---- wiring in the plugin ----

function pluginWith(tab, settings = {}) {
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
		getLeavesOfType: (type) => (type === "empty" ? [tab.leaf] : []),
	};
	const plugin = new QuickTodoPlugin({ vault, workspace }, { id: "quick-todo" });
	plugin.stored = settings;
	return { plugin, workspace };
}

beforeEach(() => moment.setNow("2026-11-06"));

test("the plugin adds the entry when the workspace changes, and removes it when turned off", async () => {
	const tab = emptyTab();
	const { plugin, workspace } = pluginWith(tab);
	await plugin.onload();

	assert.deepEqual(workspace.listeners.map((l) => l.name).sort(), ["active-leaf-change", "editor-menu", "file-menu", "file-open", "layout-change"]);
	assert.equal(typeof workspace.ready, "function");

	workspace.ready();
	assert.equal(tab.list.findAll("quick-todo-empty-action").length, 1);

	// A new empty tab opened later is picked up on the next workspace change.
	const second = emptyTab();
	workspace.getLeavesOfType = (type) => (type === "empty" ? [tab.leaf, second.leaf] : []);
	workspace.listeners.find((l) => l.name === "layout-change").callback();
	assert.equal(second.list.findAll("quick-todo-empty-action").length, 1);
	assert.equal(tab.list.findAll("quick-todo-empty-action").length, 1);

	plugin.unload();
	assert.equal(tab.list.findAll("quick-todo-empty-action").length, 0);
	assert.equal(second.list.findAll("quick-todo-empty-action").length, 0);
});

test("tapping the entry opens the add box", async () => {
	const tab = emptyTab();
	const { plugin, workspace } = pluginWith(tab);
	await plugin.onload();
	const opened = [];
	plugin.openAddBox = () => opened.push("add box");
	workspace.ready();
	await tab.list.find("quick-todo-empty-action").click();
	assert.deepEqual(opened, ["add box"]);
	plugin.unload();
});

test("it is on by default, and the setting turns it off and on", async () => {
	const tab = emptyTab();
	const { plugin, workspace } = pluginWith(tab);
	await plugin.onload();
	assert.equal(plugin.settings.showOnEmptyTab, true);
	workspace.ready();
	assert.equal(tab.list.findAll("quick-todo-empty-action").length, 1);

	plugin.settings.showOnEmptyTab = false;
	await plugin.saveSettings();
	assert.equal(tab.list.findAll("quick-todo-empty-action").length, 0);

	plugin.settings.showOnEmptyTab = true;
	await plugin.saveSettings();
	assert.equal(tab.list.findAll("quick-todo-empty-action").length, 1);
	plugin.unload();
});

test("when the setting is off, the entry is never added", async () => {
	const tab = emptyTab();
	const { plugin, workspace } = pluginWith(tab, { showOnEmptyTab: false });
	await plugin.onload();
	workspace.ready();
	assert.equal(tab.list.findAll("quick-todo-empty-action").length, 0);
	plugin.unload();
});

test("the delayed second look adds the entry to a screen drawn just after the event", async () => {
	const tab = emptyTab();
	tab.list.children.length = 0; // Obsidian has not drawn its entries yet
	const draw = emptyTab();
	const { plugin, workspace } = pluginWith(tab);
	const original = tab.leaf.view.containerEl;
	// First look: the action list does not exist yet.
	tab.leaf.view.containerEl = new FakeEl();
	await plugin.onload();
	workspace.ready();
	assert.equal(original.findAll("quick-todo-empty-action").length, 0);
	// The screen is drawn before the delayed look runs.
	tab.leaf.view.containerEl = draw.leaf.view.containerEl;
	await new Promise((resolve) => setTimeout(resolve, 260));
	assert.equal(draw.list.findAll("quick-todo-empty-action").length, 1);
	plugin.unload();
});
