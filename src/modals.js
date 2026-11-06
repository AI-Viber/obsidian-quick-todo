// The two small dialogs: add an item, and edit or delete one.

import { Modal, Notice } from "obsidian";
import { splitCreated } from "./todo-core.js";
import { confirmTap } from "./ui.js";

function errorNotice(action, error) {
	const reason = error && error.message ? error.message : "Unknown error.";
	new Notice(`Quick to-do: couldn't ${action}. ${reason}`);
}

/** Enter submits, except while an input method (for example Japanese or Chinese) is still composing. */
function onEnter(input, callback) {
	input.addEventListener("keydown", (evt) => {
		if (evt.key === "Enter" && !evt.isComposing) {
			evt.preventDefault();
			return callback();
		}
		return undefined;
	});
}

export class AddModal extends Modal {
	constructor(app, plugin, prefill = "") {
		super(app);
		this.plugin = plugin;
		this.prefill = prefill || "";
		this.added = 0;
		this.busy = false;
	}

	onOpen() {
		const { contentEl } = this;
		this.titleEl.setText("Add to-do");
		contentEl.addClass("quick-todo-modal");

		this.inputEl = contentEl.createEl("input", {
			type: "text",
			cls: "quick-todo-input",
			placeholder: "What needs doing?",
			value: this.prefill,
			attr: { enterkeyhint: "done", autocomplete: "off", autocapitalize: "sentences" },
		});
		this.statusEl = contentEl.createDiv({ cls: "quick-todo-status" });

		const buttons = contentEl.createDiv({ cls: "quick-todo-buttons" });
		const addButton = buttons.createEl("button", { cls: "mod-cta", text: "Add" });
		addButton.addEventListener("click", () => this.submit());
		onEnter(this.inputEl, () => this.submit());

		this.inputEl.focus();
	}

	onClose() {
		this.contentEl.empty();
	}

	async submit() {
		const text = this.inputEl.value;
		if (this.busy || text.trim() === "") return;
		this.busy = true;
		try {
			const added = await this.plugin.store.addTodo(text);
			if (!added) return;
			this.added++;
			if (this.plugin.settings.keepBoxOpen) {
				this.inputEl.value = "";
				this.statusEl.setText(`Added ${this.added}`);
				this.inputEl.focus();
			} else {
				new Notice("Added to your to-do list.", 2000);
				this.close();
			}
		} catch (error) {
			errorNotice("add that", error);
		} finally {
			this.busy = false;
		}
	}
}

export class EditModal extends Modal {
	constructor(app, plugin, item, onChanged) {
		super(app);
		this.plugin = plugin;
		this.item = item;
		this.onChanged = onChanged;
		this.busy = false;
	}

	onOpen() {
		const { contentEl } = this;
		this.titleEl.setText("Edit to-do");
		contentEl.addClass("quick-todo-modal");

		this.inputEl = contentEl.createEl("input", {
			type: "text",
			cls: "quick-todo-input",
			value: splitCreated(this.item.text).main.trim(),
			attr: { enterkeyhint: "done", autocomplete: "off" },
		});

		const buttons = contentEl.createDiv({ cls: "quick-todo-buttons" });
		const deleteButton = buttons.createEl("button", { text: "Delete" });
		confirmTap(deleteButton, "Delete", "Tap again to delete", () => this.run(() => this.plugin.store.deleteItem(this.item), "delete that"));
		const saveButton = buttons.createEl("button", { cls: "mod-cta", text: "Save" });
		saveButton.addEventListener("click", () => this.save());
		onEnter(this.inputEl, () => this.save());

		this.inputEl.focus();
	}

	onClose() {
		this.contentEl.empty();
	}

	save() {
		const text = this.inputEl.value;
		if (text.trim() === "") return Promise.resolve();
		return this.run(() => this.plugin.store.editItem(this.item, text), "save that");
	}

	async run(operation, action) {
		if (this.busy) return;
		this.busy = true;
		try {
			const ok = await operation();
			if (!ok) new Notice("That to-do changed in the note, so the list was refreshed.");
			this.close();
			await this.onChanged();
		} catch (error) {
			errorNotice(action, error);
		} finally {
			this.busy = false;
		}
	}
}
