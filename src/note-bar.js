// An "Add a to-do" bar at the top of the to-do note itself, like the one in the
// list, so you can add an item however the note was opened (a bookmark, search, a
// link). It works in the normal editor and in another plugin's view of the same
// note, such as WYSIWYG Mode.

import { Notice } from "obsidian";

const BAR_CLASS = "quick-todo-note-bar";
// Put on the view's content area while it has a bar, so the bar sits above the note instead of over it.
const HOST_CLASS = "quick-todo-has-bar";

function buildBar(host, add) {
	const bar = host.createDiv({ cls: ["quick-todo-add", BAR_CLASS] });
	const input = bar.createEl("input", {
		type: "text",
		cls: "quick-todo-input",
		placeholder: "Add a to-do",
		attr: { enterkeyhint: "done", autocomplete: "off", autocapitalize: "sentences" },
	});
	const button = bar.createEl("button", { cls: "mod-cta", text: "Add" });

	let busy = false;
	const submit = async () => {
		const text = input.value;
		if (busy || text.trim() === "") return;
		busy = true;
		try {
			if (await add(text)) input.value = "";
		} catch (error) {
			new Notice(`Quick to-do: couldn't add that. ${error && error.message ? error.message : ""}`);
		} finally {
			busy = false;
			input.focus();
		}
	};
	button.addEventListener("click", () => submit());
	input.addEventListener("keydown", (evt) => {
		// Enter submits, except while an input method (for example Japanese or Chinese) is still composing.
		if (evt.key === "Enter" && !evt.isComposing) {
			evt.preventDefault();
			return submit();
		}
		return undefined;
	});
	return bar;
}

export class NoteBars {
	constructor() {
		// view -> the bar added to it
		this.bars = new Map();
	}

	/**
	 * Add the bar to every open view that is showing one of `paths`, and take it off any
	 * view that is not (Obsidian reuses a view when you move to another note). Text typed
	 * into a bar is kept while the view stays on the to-do note. Safe to call repeatedly.
	 */
	sync(app, paths, enabled, add) {
		const open = new Set();
		app.workspace.iterateAllLeaves((leaf) => {
			const view = leaf.view;
			if (!view || !view.contentEl) return;
			open.add(view);

			const path = view.file ? view.file.path : null;
			const wanted = enabled && path !== null && paths.includes(path);
			const current = this.bars.get(view);

			if (wanted && (!current || !current.isConnected)) {
				const host = view.contentEl;
				const bar = buildBar(host, add);
				// Above everything else in the view.
				const first = [...host.children].find((el) => el !== bar);
				if (first) host.insertBefore(bar, first);
				host.addClass(HOST_CLASS);
				this.bars.set(view, bar);
			} else if (!wanted && current) {
				this.drop(view, current);
			}
		});

		// Views that have been closed.
		for (const [view, bar] of this.bars) {
			if (!open.has(view)) this.drop(view, bar);
		}
	}

	drop(view, bar) {
		bar.remove();
		this.bars.delete(view);
		if (view.contentEl) view.contentEl.removeClass(HOST_CLASS);
	}

	clear() {
		for (const [view, bar] of [...this.bars]) this.drop(view, bar);
	}
}
