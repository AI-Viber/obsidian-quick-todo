// "New to-do" in Obsidian's menus:
//   - the "More options" (⋯) menu at the top right of a note
//   - the right-click (long-press on iPad and iPhone) menu inside a note being edited
//   - on desktop, the File menu in the app's menu bar
//
// The first two use Obsidian's plugin API. The menu bar has no plugin API: it is
// reached through Electron, the framework the desktop app is built on. That part is
// optional: if Electron's menu can't be reached (mobile, or a future Obsidian
// version), it is skipped and nothing else is affected.

import { Platform } from "obsidian";

export const MENU_TITLE = "New to-do";
const MENU_ICON = "plus-circle";
const MENU_BAR_ID = "quick-todo-new";

/** Add the item to an Obsidian Menu. */
function addTo(menu, onClick) {
	menu.addItem((item) => {
		item.setTitle(MENU_TITLE).setIcon(MENU_ICON).onClick(() => onClick());
		// Group it with other actions where Obsidian supports menu sections.
		if (typeof item.setSection === "function") item.setSection("action");
	});
}

/** Register the in-app menu items. `enabled()` is read each time a menu opens. */
export function registerInAppMenus(plugin, enabled, onClick) {
	const { workspace } = plugin.app;
	plugin.registerEvent(
		workspace.on("file-menu", (menu, file, source) => {
			if (enabled() && source === "more-options") addTo(menu, onClick);
		}),
	);
	plugin.registerEvent(
		workspace.on("editor-menu", (menu) => {
			if (enabled()) addTo(menu, onClick);
		}),
	);
}

/* ------------------------------------------------------------------ */
/* Desktop menu bar                                                    */
/* ------------------------------------------------------------------ */

/** Electron's remote module, if this is the desktop app and it can be reached. */
function electronRemote(win = window) {
	if (!Platform.isDesktopApp || typeof win.require !== "function") return null;
	for (const load of [() => win.require("@electron/remote"), () => win.require("electron").remote]) {
		try {
			const remote = load();
			if (remote && remote.Menu && remote.MenuItem) return remote;
		} catch {
			// try the next way
		}
	}
	return null;
}

/** The File menu: by its role, or its English label, or else the menu after the app menu on a Mac. */
function fileMenu(appMenu) {
	const items = appMenu.items || [];
	const found = items.find((i) => i.role === "filemenu" || i.role === "fileMenu" || i.label === "File" || i.label === "&File");
	const pick = found || (Platform.isMacOS ? items[1] : items[0]);
	return pick && pick.submenu ? pick.submenu : null;
}

const MAC_KEYS = { Mod: "CmdOrCtrl", Ctrl: "Ctrl", Meta: "Cmd", Alt: "Alt", Shift: "Shift" };

/** Obsidian hotkey → Electron accelerator ("CmdOrCtrl+Shift+T"), so the menu shows the shortcut. */
export function toAccelerator(hotkey) {
	if (!hotkey || !hotkey.key) return undefined;
	const key = hotkey.key.length === 1 ? hotkey.key.toUpperCase() : hotkey.key;
	const mods = (hotkey.modifiers || []).map((m) => MAC_KEYS[m]).filter(Boolean);
	return [...mods, key].join("+");
}

/**
 * Keeps "New to-do" in the desktop app's File menu. Obsidian can rebuild its menu
 * (for example when a window opens), so `ensure()` checks and re-adds it; it is
 * cheap to call often.
 */
export class MenuBarItem {
	constructor(onClick, getHotkey, win = window) {
		this.onClick = onClick;
		this.getHotkey = getHotkey;
		this.win = win;
		this.active = false;
		this.remote = undefined; // looked up on first use
	}

	ensure() {
		this.active = true;
		if (this.remote === undefined) this.remote = electronRemote(this.win);
		const remote = this.remote;
		if (!remote) return false;
		try {
			const appMenu = remote.Menu.getApplicationMenu();
			if (!appMenu) return false;
			const menu = fileMenu(appMenu);
			if (!menu) return false;
			const accelerator = toAccelerator(this.getHotkey());
			const ours = (menu.items || []).filter((i) => typeof i.id === "string" && i.id.startsWith(MENU_BAR_ID));
			const current = ours.find((i) => i.visible !== false);
			if (current && (current.accelerator || undefined) === accelerator) return true;
			// Menu items can't be removed or changed once added, only hidden; add a fresh one.
			for (const i of ours) i.visible = false;
			const item = new remote.MenuItem({
				id: `${MENU_BAR_ID}-${ours.length}`,
				label: MENU_TITLE,
				accelerator,
				// Ignore clicks once the plugin has been turned off.
				click: () => {
					if (this.active) this.onClick();
				},
			});
			// After Obsidian's "New …" items, or first if there are none.
			const items = menu.items || [];
			let at = 0;
			items.forEach((i, n) => {
				if (typeof i.label === "string" && /^new\b/i.test(i.label) && i.visible !== false) at = n + 1;
			});
			menu.insert(at, item);
			this.item = item;
			// macOS only shows changes to the menu bar once the menu is set again.
			remote.Menu.setApplicationMenu(appMenu);
			return true;
		} catch {
			return false;
		}
	}

	/** Hide the item (when the plugin is turned off or the setting is switched off). */
	remove() {
		this.active = false;
		const remote = this.remote;
		if (!remote) return;
		try {
			const appMenu = remote.Menu.getApplicationMenu();
			for (const i of (appMenu && fileMenu(appMenu) && fileMenu(appMenu).items) || []) {
				if (typeof i.id === "string" && i.id.startsWith(MENU_BAR_ID)) i.visible = false;
			}
			if (this.item) this.item.visible = false;
			if (appMenu) remote.Menu.setApplicationMenu(appMenu);
		} catch {
			// nothing to undo
		}
	}
}
