import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { MENU_TITLE, MenuBarItem, registerInAppMenus, toAccelerator } from "../src/menus.js";
import { Platform } from "./stub-obsidian.mjs";

/* ---------- Obsidian's in-app menus ---------- */

class FakeMenuItem {
	setTitle(t) { this.title = t; return this; }
	setIcon(i) { this.icon = i; return this; }
	setSection(s) { this.section = s; return this; }
	onClick(cb) { this.click = cb; return this; }
}
class FakeMenu {
	constructor() { this.items = []; }
	addItem(build) { const item = new FakeMenuItem(); build(item); this.items.push(item); return this; }
}

function fakePlugin() {
	const listeners = {};
	return {
		app: { workspace: { on: (name, cb) => ((listeners[name] = cb), { name }) } },
		events: [],
		registerEvent(ref) { this.events.push(ref); },
		listeners,
	};
}

test("New to-do appears in the note's More options menu and the right-click menu", () => {
	const plugin = fakePlugin();
	let opened = 0;
	registerInAppMenus(plugin, () => true, () => opened++);
	assert.deepEqual(plugin.events.map((e) => e.name).sort(), ["editor-menu", "file-menu"]);

	const more = new FakeMenu();
	plugin.listeners["file-menu"](more, {}, "more-options");
	assert.equal(more.items.length, 1);
	assert.equal(more.items[0].title, MENU_TITLE);
	assert.equal(more.items[0].icon, "plus-circle");
	more.items[0].click();

	const right = new FakeMenu();
	plugin.listeners["editor-menu"](right);
	assert.equal(right.items[0].title, MENU_TITLE);
	right.items[0].click();
	assert.equal(opened, 2, "each item opens the add box");
});

test("it is left out of other file menus, such as the file explorer's", () => {
	const plugin = fakePlugin();
	registerInAppMenus(plugin, () => true, () => {});
	const explorer = new FakeMenu();
	plugin.listeners["file-menu"](explorer, {}, "file-explorer-context-menu");
	assert.equal(explorer.items.length, 0);
});

test("the setting turns the in-app items off", () => {
	const plugin = fakePlugin();
	let on = false;
	registerInAppMenus(plugin, () => on, () => {});
	const menu = new FakeMenu();
	plugin.listeners["file-menu"](menu, {}, "more-options");
	plugin.listeners["editor-menu"](menu);
	assert.equal(menu.items.length, 0);
	on = true;
	plugin.listeners["editor-menu"](menu);
	assert.equal(menu.items.length, 1);
});

/* ---------- Desktop menu bar (Electron) ---------- */

class ElectronItem {
	constructor(opts) { Object.assign(this, { visible: true }, opts); }
}
class ElectronMenu {
	constructor(items = []) { this.items = items; }
	insert(at, item) { this.items.splice(at, 0, item); }
	getMenuItemById(id) {
		for (const i of this.items) {
			if (i.id === id) return i;
			const found = i.submenu && i.submenu.getMenuItemById(id);
			if (found) return found;
		}
		return null;
	}
}

function fakeElectron() {
	const file = new ElectronMenu([new ElectronItem({ label: "New note" }), new ElectronItem({ label: "New canvas" }), new ElectronItem({ label: "Open vault…" })]);
	const appMenu = new ElectronMenu([new ElectronItem({ label: "Obsidian", submenu: new ElectronMenu() }), new ElectronItem({ label: "File", submenu: file })]);
	const remote = {
		Menu: { getApplicationMenu: () => appMenu, setApplicationMenu: () => remote.setCount++ },
		MenuItem: ElectronItem,
		setCount: 0,
	};
	const win = { require: (name) => { if (name === "@electron/remote") return remote; throw new Error("no module"); } };
	return { remote, file, win };
}

beforeEach(() => {
	Platform.isDesktopApp = true;
	Platform.isMacOS = true;
});

test("on desktop, New to-do goes into the File menu after Obsidian's New items, showing the hotkey", () => {
	const { remote, file, win } = fakeElectron();
	let opened = 0;
	const bar = new MenuBarItem(() => opened++, () => ({ modifiers: ["Mod", "Shift"], key: "t" }), win);
	assert.equal(bar.ensure(), true);
	assert.deepEqual(file.items.map((i) => i.label), ["New note", "New canvas", MENU_TITLE, "Open vault…"]);
	const ours = file.items[2];
	assert.equal(ours.accelerator, "CmdOrCtrl+Shift+T");
	assert.equal(remote.setCount, 1, "the menu is set again so macOS shows the change");
	ours.click();
	assert.equal(opened, 1);
});

test("checking again doesn't add a second copy", () => {
	const { remote, file, win } = fakeElectron();
	const bar = new MenuBarItem(() => {}, () => undefined, win);
	bar.ensure();
	bar.ensure();
	bar.ensure();
	assert.equal(file.items.filter((i) => i.label === MENU_TITLE && i.visible).length, 1);
	assert.equal(remote.setCount, 1);
});

test("a changed hotkey replaces the item, leaving one visible copy", () => {
	const { file, win } = fakeElectron();
	let hotkey = { modifiers: ["Mod"], key: "T" };
	const bar = new MenuBarItem(() => {}, () => hotkey, win);
	bar.ensure();
	hotkey = { modifiers: ["Alt"], key: "N" };
	bar.ensure();
	bar.ensure();
	const visible = file.items.filter((i) => i.label === MENU_TITLE && i.visible);
	assert.equal(visible.length, 1);
	assert.equal(visible[0].accelerator, "Alt+N");
});

test("turning it off hides the item and ignores clicks", () => {
	const { file, win } = fakeElectron();
	let opened = 0;
	const bar = new MenuBarItem(() => opened++, () => undefined, win);
	bar.ensure();
	const ours = file.items.find((i) => i.label === MENU_TITLE);
	bar.remove();
	assert.equal(ours.visible, false);
	ours.click();
	assert.equal(opened, 0);
	bar.ensure(); // turned back on
	assert.equal(file.items.filter((i) => i.label === MENU_TITLE && i.visible).length, 1);
});

test("on mobile, or where Electron can't be reached, the menu bar is skipped without errors", () => {
	Platform.isDesktopApp = false;
	assert.equal(new MenuBarItem(() => {}, () => undefined, fakeElectron().win).ensure(), false);
	Platform.isDesktopApp = true;
	const noRemote = { require: () => { throw new Error("not available"); } };
	const bar = new MenuBarItem(() => {}, () => undefined, noRemote);
	assert.equal(bar.ensure(), false);
	bar.remove();
	const broken = { require: () => ({ Menu: { getApplicationMenu: () => { throw new Error("boom"); } }, MenuItem: ElectronItem }) };
	assert.equal(new MenuBarItem(() => {}, () => undefined, broken).ensure(), false);
});

test("hotkeys convert to menu shortcuts", () => {
	assert.equal(toAccelerator({ modifiers: ["Mod", "Shift"], key: "e" }), "CmdOrCtrl+Shift+E");
	assert.equal(toAccelerator({ modifiers: ["Alt"], key: "'" }), "Alt+'");
	assert.equal(toAccelerator(undefined), undefined);
});
