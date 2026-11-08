// Adds a "Quick to-do" entry to Obsidian's "No file is open" screen, beside
// "New note", "Go to file" and the rest.
//
// Obsidian has no official way to add to that screen, so this finds its list of
// actions in the page and adds one more. To look like the others, the entry copies
// the layout of a neighbouring button (its outline, icon slot and label slot) rather
// than assuming how Obsidian draws them, so it keeps matching if Obsidian restyles
// the screen. If the list cannot be found, nothing is added and nothing breaks.

import { setIcon } from "obsidian";

const LIST_CLASS = "empty-state-action-list";
const ACTION_CLASS = "empty-state-action";
const OURS_CLASS = "quick-todo-empty-action";
const ICON = "plus-circle";

function emptyLeaves(app) {
	return app.workspace.getLeavesOfType("empty");
}

function listOf(leaf) {
	const root = leaf.view && leaf.view.containerEl;
	return root ? root.querySelector(`.${LIST_CLASS}`) : null;
}

const text = (el) => (el.textContent || "").trim();
const isSvg = (el) => el.tagName.toLowerCase() === "svg";

/** The child of a button that holds its icon, if it has one. */
function iconPart(button) {
	return [...button.children].find((c) => isSvg(c) || c.getElementsByTagName("svg").length > 0) || null;
}

/** A button of Obsidian's to copy: one with an icon, preferably without a shortcut shown. */
function templateButton(list) {
	const buttons = [...list.children].filter((el) => ![...el.classList].includes(OURS_CLASS) && iconPart(el));
	return buttons.sort((a, b) => a.children.length - b.children.length)[0] || null;
}

/** Classes worth copying: everything except temporary states like "is-selected". */
function lastingClasses(el) {
	return [...el.classList].filter((c) => !/^is-/.test(c));
}

/** Build the entry with the same layout as `template` (or plain text if there is none). */
function buildEntry(list, label, template) {
	const cls = template ? [...new Set([...lastingClasses(template), ACTION_CLASS, OURS_CLASS])] : [ACTION_CLASS, OURS_CLASS];
	const entry = list.createDiv({ cls, attr: { role: "button", tabindex: "0", "aria-label": label } });
	if (!template) {
		entry.setText(label);
		return entry;
	}
	const icon = iconPart(template);
	let labelled = false;
	for (const part of template.children) {
		if (part === icon) {
			// An icon given directly as <svg> gets a wrapper; otherwise copy the wrapper's tag and classes.
			const holder = entry.createEl(isSvg(part) ? "span" : part.tagName.toLowerCase(), { cls: isSvg(part) ? [] : lastingClasses(part) });
			setIcon(holder, ICON);
		} else if (!labelled && text(part)) {
			entry.createEl(part.tagName.toLowerCase(), { cls: lastingClasses(part), text: label });
			labelled = true;
		}
		// Anything else (such as a keyboard shortcut badge) is left out.
	}
	if (!labelled) entry.createSpan({ text: label });
	return entry;
}

/** Add the entry to every empty tab that does not have it yet. Safe to call repeatedly. */
export function addEmptyStateAction(app, label, onClick) {
	for (const leaf of emptyLeaves(app)) {
		const list = listOf(leaf);
		if (!list || list.querySelector(`.${OURS_CLASS}`)) continue;

		const action = buildEntry(list, label, templateButton(list));
		action.addEventListener("click", () => onClick());
		action.addEventListener("keydown", (evt) => {
			if (evt.key === "Enter" || evt.key === " ") {
				evt.preventDefault();
				onClick();
			}
		});

		// After Obsidian's "New …" buttons if there are any; otherwise before its last entry (Close).
		const others = [...list.children].filter((el) => el !== action);
		const lastNew = others.filter((el) => /^new\b/i.test(text(el))).pop();
		const before = lastNew ? others[others.indexOf(lastNew) + 1] : others[others.length - 1];
		if (before) list.insertBefore(action, before);
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
