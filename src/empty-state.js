// Adds a "Quick to-do" entry to Obsidian's "No file is open" screen, beside
// "Create new note", "Go to file" and the rest.
//
// Obsidian has no official way to add to that screen, so this finds its list of
// actions in the page and adds one more. If Obsidian changes the screen so the
// list cannot be found, nothing is added and nothing breaks.

const LIST_CLASS = "empty-state-action-list";
const ACTION_CLASS = "empty-state-action";
const OURS_CLASS = "quick-todo-empty-action";

function emptyLeaves(app) {
	return app.workspace.getLeavesOfType("empty");
}

function listOf(leaf) {
	const root = leaf.view && leaf.view.containerEl;
	return root ? root.querySelector(`.${LIST_CLASS}`) : null;
}

/** Add the entry to every empty tab that does not have it yet. Safe to call repeatedly. */
export function addEmptyStateAction(app, label, onClick) {
	for (const leaf of emptyLeaves(app)) {
		const list = listOf(leaf);
		if (!list || list.querySelector(`.${OURS_CLASS}`)) continue;

		const action = list.createDiv({ cls: [ACTION_CLASS, OURS_CLASS], text: label, attr: { role: "button", tabindex: "0" } });
		action.addEventListener("click", () => onClick());
		action.addEventListener("keydown", (evt) => {
			if (evt.key === "Enter" || evt.key === " ") {
				evt.preventDefault();
				onClick();
			}
		});

		// Keep Obsidian's last entry (Close) last.
		const others = [...list.children].filter((el) => el !== action);
		if (others.length > 0) list.insertBefore(action, others[others.length - 1]);
	}
}

/** Take the entry out of every empty tab. */
export function removeEmptyStateActions(app) {
	for (const leaf of emptyLeaves(app)) {
		const list = listOf(leaf);
		if (!list) continue;
		for (const el of list.querySelectorAll(`.${OURS_CLASS}`)) el.remove();
	}
}
