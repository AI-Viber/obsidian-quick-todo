// The to-do list: an add box on top, open items, and a collapsible Done section.

import { ItemView, Notice, debounce, moment, setIcon } from "obsidian";
import { EditModal } from "./modals.js";
import { splitCreated } from "./todo-core.js";
import { confirmTap } from "./ui.js";

export const VIEW_TYPE = "quick-todo-list";

/** An item waiting this many days or more is highlighted. */
const STALE_DAYS = 14;

export class TodoView extends ItemView {
	constructor(leaf, plugin) {
		super(leaf);
		this.plugin = plugin;
		this.busy = false;
		this.requestRefresh = debounce(() => this.refresh(), 250, true);
	}

	getViewType() {
		return VIEW_TYPE;
	}

	getDisplayText() {
		return "To-do list";
	}

	getIcon() {
		return "list-checks";
	}

	async onOpen() {
		const root = this.contentEl;
		root.empty();
		root.addClass("quick-todo-view");

		// The add row stays put while the list below it is redrawn, so text being typed is never lost.
		const addRow = root.createDiv({ cls: "quick-todo-add" });
		this.inputEl = addRow.createEl("input", {
			type: "text",
			cls: "quick-todo-input",
			placeholder: "Add a to-do",
			attr: { enterkeyhint: "done", autocomplete: "off", autocapitalize: "sentences" },
		});
		const addButton = addRow.createEl("button", { cls: "mod-cta", text: "Add" });
		addButton.addEventListener("click", () => this.add());
		this.inputEl.addEventListener("keydown", (evt) => {
			if (evt.key === "Enter" && !evt.isComposing) {
				evt.preventDefault();
				return this.add();
			}
			return undefined;
		});

		this.listEl = root.createDiv({ cls: "quick-todo-list" });
		await this.refresh();
	}

	async onClose() {
		this.requestRefresh.cancel();
		this.contentEl.empty();
	}

	async add() {
		const text = this.inputEl.value;
		if (this.busy || text.trim() === "") return;
		this.busy = true;
		try {
			if (await this.plugin.store.addTodo(text)) this.inputEl.value = "";
			await this.refresh();
		} catch (error) {
			new Notice(`Quick to-do: couldn't add that. ${error && error.message ? error.message : ""}`);
		} finally {
			this.busy = false;
			this.inputEl.focus();
		}
	}

	async refresh() {
		if (!this.listEl) return;
		let lists;
		try {
			lists = await this.plugin.store.loadLists();
		} catch (error) {
			this.listEl.empty();
			this.listEl.createDiv({ cls: "quick-todo-empty", text: `Couldn't read the to-do note. ${error && error.message ? error.message : ""}` });
			return;
		}
		const scrollTop = this.contentEl.scrollTop;
		this.render(lists);
		this.contentEl.scrollTop = scrollTop;
	}

	render(lists) {
		const el = this.listEl;
		el.empty();
		this.renderSource(el);

		const open = lists.map((list) => ({ label: list.label, items: list.items.filter((item) => !item.checked) }));
		const done = lists.flatMap((list) => list.items.filter((item) => item.checked));
		const openCount = open.reduce((n, list) => n + list.items.length, 0);

		if (openCount === 0) {
			el.createDiv({ cls: "quick-todo-empty", text: done.length > 0 ? "All done." : "Nothing to do yet. Add an item above." });
		}

		const showGroupTitles = lists.length > 1;
		for (const list of open) {
			if (list.items.length === 0) continue;
			const group = el.createDiv({ cls: "quick-todo-group" });
			if (showGroupTitles) group.createDiv({ cls: "quick-todo-group-title", text: list.label });
			for (const item of list.items) this.renderItem(group, item);
		}

		if (done.length > 0) this.renderDone(el, done);
	}

	renderSource(el) {
		const s = this.plugin.settings;
		const days = Number(s.dailyDaysBack) || 0;
		let text;
		if (s.location === "daily") text = days > 0 ? `Today and the last ${days} days` : "Today's daily note";
		else text = this.plugin.store.targetPaths()[0];
		const source = el.createDiv({ cls: "quick-todo-source" });
		const link = source.createEl("a", { text, attr: { role: "button", tabindex: "0" } });
		link.addEventListener("click", () => this.plugin.openNote());
	}

	renderItem(parent, item) {
		const row = parent.createDiv({ cls: ["quick-todo-item", item.checked ? "is-done" : "is-open"] });
		const depth = Math.min(3, Math.ceil(item.indent / 4));
		if (depth > 0) row.addClass(`quick-todo-depth-${depth}`);

		const checkbox = row.createEl("input", { type: "checkbox", cls: "quick-todo-check", attr: { "aria-label": item.checked ? "Mark as not done" : "Mark as done" } });
		checkbox.checked = item.checked;
		checkbox.addEventListener("change", () => this.toggle(item));

		const { main, date } = splitCreated(item.text);
		const added = date ? moment(date, "YYYY-MM-DD", true) : null;
		const hasDate = added !== null && added.isValid();
		const label = row.createDiv({ cls: "quick-todo-text", attr: { role: "button", tabindex: "0" } });
		label.setText((hasDate ? main : item.text).trim() || "(empty)");
		label.addEventListener("click", () => this.edit(item));
		label.addEventListener("keydown", (evt) => {
			if (evt.key === "Enter") this.edit(item);
		});

		if (hasDate) {
			const stale = !item.checked && moment().diff(added, "days") >= STALE_DAYS;
			row.createSpan({ cls: stale ? ["quick-todo-date", "is-stale"] : ["quick-todo-date"], text: added.format("D MMM"), attr: { "aria-label": `Added ${added.format("D MMMM YYYY")}` } });
		}

		const editButton = row.createEl("button", { cls: ["quick-todo-edit", "clickable-icon"], attr: { "aria-label": "Edit" } });
		setIcon(editButton, "pencil");
		editButton.addEventListener("click", () => this.edit(item));
	}

	renderDone(el, done) {
		const s = this.plugin.settings;
		const wrap = el.createDiv({ cls: "quick-todo-done" });
		const header = wrap.createDiv({ cls: "quick-todo-done-header" });

		const toggle = header.createEl("button", { cls: "quick-todo-done-toggle", attr: { "aria-expanded": String(s.doneOpen) } });
		setIcon(toggle.createSpan({ cls: "quick-todo-chevron" }), s.doneOpen ? "chevron-down" : "chevron-right");
		toggle.createSpan({ text: `Done (${done.length})` });
		toggle.addEventListener("click", async () => {
			s.doneOpen = !s.doneOpen;
			await this.plugin.saveSettings(false);
			await this.refresh();
		});

		const archiving = this.plugin.store.archivePath() !== null;
		const clear = header.createEl("button", { cls: "quick-todo-clear", text: archiving ? "Archive" : "Clear" });
		confirmTap(clear, archiving ? "Archive" : "Clear", "Tap again to confirm", () => this.clearCompleted());

		if (!s.doneOpen) return;
		const list = wrap.createDiv({ cls: "quick-todo-group" });
		for (const item of done) this.renderItem(list, item);
	}

	async toggle(item) {
		try {
			if (!(await this.plugin.store.toggleItem(item))) new Notice("That to-do changed in the note, so the list was refreshed.");
		} catch (error) {
			new Notice(`Quick to-do: couldn't update that. ${error && error.message ? error.message : ""}`);
		}
		await this.refresh();
	}

	edit(item) {
		new EditModal(this.app, this.plugin, item, () => this.refresh()).open();
	}

	async clearCompleted() {
		try {
			const count = await this.plugin.store.clearCompleted();
			if (count > 0) new Notice(`${this.plugin.store.archivePath() ? "Archived" : "Cleared"} ${count} finished ${count === 1 ? "item" : "items"}.`);
		} catch (error) {
			new Notice(`Quick to-do: couldn't clear those. ${error && error.message ? error.message : ""}`);
		}
		await this.refresh();
	}
}
