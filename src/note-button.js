// An "Add to-do" button in the header of the to-do note itself, so the note can
// be added to however it was opened (a bookmark, search, a link) and in either
// the normal editor or another plugin's editor view, such as WYSIWYG Mode.

export class NoteButtons {
	constructor() {
		// view -> the button element added to it
		this.buttons = new Map();
	}

	/**
	 * Add the button to every open view that is showing one of `paths`, and take it
	 * off any view that is not (Obsidian reuses a view when you move to another
	 * note, so a button added earlier would otherwise stay behind). Safe to call repeatedly.
	 */
	sync(app, paths, enabled, label, onClick) {
		const open = new Set();
		app.workspace.iterateAllLeaves((leaf) => {
			const view = leaf.view;
			if (!view || typeof view.addAction !== "function") return;
			open.add(view);

			const path = view.file ? view.file.path : null;
			const wanted = enabled && path !== null && paths.includes(path);
			const current = this.buttons.get(view);

			if (wanted && (!current || !current.isConnected)) {
				this.buttons.set(view, view.addAction("plus-circle", label, () => onClick()));
			} else if (!wanted && current) {
				current.remove();
				this.buttons.delete(view);
			}
		});

		// Views that have been closed.
		for (const [view, button] of this.buttons) {
			if (open.has(view)) continue;
			button.remove();
			this.buttons.delete(view);
		}
	}

	clear() {
		for (const button of this.buttons.values()) button.remove();
		this.buttons.clear();
	}
}
