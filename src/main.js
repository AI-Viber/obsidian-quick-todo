import { Notice, Plugin } from "obsidian";
import { addEmptyStateAction, removeEmptyStateActions } from "./empty-state.js";
import { AddModal } from "./modals.js";
import { DEFAULT_SETTINGS, QuickTodoSettingTab } from "./settings.js";
import { TodoStore } from "./store.js";
import { TodoView, VIEW_TYPE } from "./view.js";

export default class QuickTodoPlugin extends Plugin {
	async onload() {
		await this.loadSettings();
		this.store = new TodoStore(this.app, () => this.settings);

		this.registerView(VIEW_TYPE, (leaf) => new TodoView(leaf, this));

		// The icons let these commands be added to Obsidian's mobile toolbar.
		this.addCommand({ id: "add-item", name: "Add item", icon: "plus-circle", callback: () => this.openAddBox() });
		this.addCommand({ id: "open-list", name: "Open list", icon: "list-checks", callback: () => this.openList() });
		this.addCommand({ id: "open-note", name: "Open note", icon: "file-text", callback: () => this.openNote() });

		this.addRibbonIcon("plus-circle", "Quick to-do: add item", () => this.openAddBox());
		this.addRibbonIcon("list-checks", "Quick to-do: open list", () => this.openList());

		this.addSettingTab(new QuickTodoSettingTab(this.app, this));

		// obsidian://quick-todo?vault=<vault>&text=<text> opens the add box, with the text filled in if given.
		// It never adds anything by itself, so a stray link cannot write to your note.
		this.registerObsidianProtocolHandler("quick-todo", (params) => this.openAddBox(params.text));

		const { vault } = this.app;
		this.registerEvent(vault.on("modify", (file) => this.onNoteChanged(file.path)));
		this.registerEvent(vault.on("create", (file) => this.onNoteChanged(file.path)));
		this.registerEvent(vault.on("delete", (file) => this.onNoteChanged(file.path)));
		this.registerEvent(vault.on("rename", (file, oldPath) => this.onNoteChanged(file.path, oldPath)));

		// The "No file is open" screen is drawn by Obsidian after these events, so look again shortly afterwards too.
		const { workspace } = this.app;
		const refresh = () => this.refreshEmptyState();
		this.registerEvent(workspace.on("layout-change", refresh));
		this.registerEvent(workspace.on("active-leaf-change", refresh));
		this.registerEvent(workspace.on("file-open", refresh));
		workspace.onLayoutReady(refresh);
		this.register(() => {
			window.clearTimeout(this.emptyTimer);
			removeEmptyStateActions(this.app);
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(redraw = true) {
		await this.saveData(this.settings);
		if (redraw) {
			this.redrawLists();
			this.refreshEmptyState();
		}
	}

	/** Show or hide the entry on the "No file is open" screen to match the setting. */
	refreshEmptyState() {
		const apply = () => {
			if (this.settings.showOnEmptyTab) addEmptyStateAction(this.app, "Quick to-do", () => this.openAddBox());
			else removeEmptyStateActions(this.app);
		};
		apply();
		window.clearTimeout(this.emptyTimer);
		this.emptyTimer = window.setTimeout(apply, 200);
	}

	openAddBox(prefill = "") {
		new AddModal(this.app, this, prefill).open();
	}

	async openList() {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
		if (!leaf) {
			leaf = workspace.getLeaf("tab");
			await leaf.setViewState({ type: VIEW_TYPE, active: true });
		}
		await workspace.revealLeaf(leaf);
	}

	async openNote() {
		try {
			const file = await this.store.ensureFile(this.store.targetPaths()[0]);
			await this.app.workspace.getLeaf("tab").openFile(file);
		} catch (error) {
			new Notice(`Quick to-do: couldn't open the note. ${error && error.message ? error.message : ""}`);
		}
	}

	onNoteChanged(path, oldPath) {
		const watched = this.store.targetPaths();
		if (watched.includes(path) || (oldPath && watched.includes(oldPath))) this.redrawLists();
	}

	redrawLists() {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
			if (leaf.view instanceof TodoView) leaf.view.requestRefresh();
		}
	}
}
