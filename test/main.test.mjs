import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import QuickTodoPlugin from "../src/main.js";
import { DEFAULT_SETTINGS } from "../src/settings.js";
import { TodoView, VIEW_TYPE } from "../src/view.js";
import { MockVault } from "./mock-vault.mjs";
import { Notice, TFile, moment } from "./stub-obsidian.mjs";

/** An app with a vault and just enough workspace to open the list and the note. */
function makeApp(files = {}) {
	const vault = new MockVault(files);
	const workspace = {
		leaves: [],
		revealed: [],
		opened: [],
		getLeavesOfType(type) {
			return this.leaves.filter((leaf) => leaf.type === type);
		},
		getLeaf(mode) {
			const leaf = {
				mode,
				type: null,
				async setViewState(state) {
					leaf.type = state.type;
					leaf.view = new TodoView({ app }, plugin);
				},
				async openFile(file) {
					workspace.opened.push(file.path);
				},
			};
			workspace.leaves.push(leaf);
			return leaf;
		},
		async revealLeaf(leaf) {
			this.revealed.push(leaf);
		},
	};
	const app = { vault, workspace };
	const plugin = new QuickTodoPlugin(app, { id: "quick-todo" });
	return { app, vault, workspace, plugin };
}

beforeEach(() => {
	moment.setNow("2026-11-06");
	Notice.messages.length = 0;
});

test("onload registers the commands, ribbon icons, view, settings tab and link handler", async () => {
	const { plugin, vault } = makeApp();
	await plugin.onload();

	assert.deepEqual(plugin.commands.map((c) => [c.id, c.name, c.icon]), [
		["add-item", "Add item", "plus-circle"],
		["open-list", "Open list", "list-checks"],
		["open-note", "Open note", "file-text"],
	]);
	assert.ok(plugin.commands.every((c) => c.hotkeys === undefined), "no default hotkeys");
	assert.equal(plugin.ribbon.length, 2);
	assert.equal(plugin.tabs.length, 1);
	assert.ok(plugin.viewCreators[VIEW_TYPE]({ app: plugin.app }) instanceof TodoView);
	assert.ok(plugin.protocolHandlers["quick-todo"]);
	assert.deepEqual(vault.listeners.map((l) => l.name).sort(), ["create", "delete", "modify", "rename"]);
});

test("settings are the defaults plus whatever was saved", async () => {
	const { plugin } = makeApp();
	plugin.stored = { notePath: "Inbox.md", keepBoxOpen: true, somethingRemoved: 1 };
	await plugin.onload();
	assert.equal(plugin.settings.notePath, "Inbox.md");
	assert.equal(plugin.settings.keepBoxOpen, true);
	assert.equal(plugin.settings.addPosition, DEFAULT_SETTINGS.addPosition);
	assert.equal(DEFAULT_SETTINGS.location, "fixed", "a fixed note is the default");
	assert.equal(DEFAULT_SETTINGS.addCreatedDate, false);

	await plugin.saveSettings(false);
	assert.equal(plugin.stored.notePath, "Inbox.md");
});

test("the link opens the add box with the text filled in, and never adds anything itself", async () => {
	const { plugin, vault } = makeApp();
	await plugin.onload();
	const seen = [];
	plugin.openAddBox = (text) => seen.push(text);
	plugin.protocolHandlers["quick-todo"]({ action: "quick-todo", text: "buy milk" });
	plugin.protocolHandlers["quick-todo"]({ action: "quick-todo" });
	assert.deepEqual(seen, ["buy milk", undefined]);
	assert.equal(vault.getAbstractFileByPath("To-do.md"), null);
});

test("the Add item command opens the dialog", async () => {
	const { plugin } = makeApp();
	await plugin.onload();
	plugin.commands[0].callback();
	plugin.ribbon[0].callback();
	// Nothing to inspect on a real screen here; the dialog's own behaviour is covered in ui.test.mjs.
	assert.equal(Notice.messages.length, 0);
});

test("Open list creates the list once and reuses it afterwards", async () => {
	const { plugin, workspace } = makeApp();
	await plugin.onload();
	await plugin.openList();
	assert.equal(workspace.leaves.length, 1);
	assert.equal(workspace.leaves[0].mode, "tab");
	assert.equal(workspace.leaves[0].type, VIEW_TYPE);
	await plugin.openList();
	assert.equal(workspace.leaves.length, 1);
	assert.equal(workspace.revealed.length, 2);
});

test("Open note creates the note if needed and opens it", async () => {
	const { plugin, workspace, vault } = makeApp();
	await plugin.onload();
	await plugin.openNote();
	assert.deepEqual(workspace.opened, ["To-do.md"]);
	assert.ok(vault.getAbstractFileByPath("To-do.md") instanceof TFile);
});

test("Open note shows a notice if the note cannot be made", async () => {
	const { plugin, vault } = makeApp();
	await plugin.onload();
	await vault.createFolder("To-do.md");
	await plugin.openNote();
	assert.match(Notice.messages.at(-1), /is a folder/);
});

test("open lists redraw when the to-do note changes, and only then", async () => {
	const { plugin, workspace } = makeApp();
	await plugin.onload();
	await plugin.openList();
	let redraws = 0;
	workspace.leaves[0].view.requestRefresh = () => redraws++;

	const modify = plugin.app.vault.listeners.find((l) => l.name === "modify").callback;
	const rename = plugin.app.vault.listeners.find((l) => l.name === "rename").callback;
	modify({ path: "Other.md" });
	assert.equal(redraws, 0);
	modify({ path: "To-do.md" });
	assert.equal(redraws, 1);
	rename({ path: "Renamed.md" }, "To-do.md");
	assert.equal(redraws, 2);

	await plugin.saveSettings(false);
	assert.equal(redraws, 2);
	await plugin.saveSettings();
	assert.equal(redraws, 3);
});

test("changing the note in settings makes the plugin watch the new one", async () => {
	const { plugin, workspace } = makeApp();
	await plugin.onload();
	await plugin.openList();
	let redraws = 0;
	workspace.leaves[0].view.requestRefresh = () => redraws++;
	plugin.settings.notePath = "Inbox.md";
	const modify = plugin.app.vault.listeners.find((l) => l.name === "modify").callback;
	modify({ path: "To-do.md" });
	assert.equal(redraws, 0);
	modify({ path: "Inbox.md" });
	assert.equal(redraws, 1);
});
