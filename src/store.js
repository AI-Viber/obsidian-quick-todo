// Reads and writes the to-do note(s) in the vault.

import { TFile, moment, normalizePath } from "obsidian";
import {
	appendLines,
	cleanText,
	collectCompleted,
	insertLine,
	locateLine,
	makeTodoLine,
	ownedLines,
	removeEntries,
	retextLine,
	scanItems,
	splitCreated,
	splitLines,
	toggleLine,
} from "./todo-core.js";

const DATE_FORMAT = "YYYY-MM-DD";
const DEFAULT_NOTE = "To-do.md";

const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

/** A tidy vault path ending in .md. Tidied first, so a trailing slash cannot leave a note called ".md". */
function notePathOf(path) {
	const p = normalizePath((path || "").trim() || DEFAULT_NOTE);
	return /\.md$/i.test(p) ? p : `${p}.md`;
}

function labelOf(path) {
	return path.split("/").pop().replace(/\.md$/i, "");
}

export class TodoStore {
	constructor(app, getSettings) {
		this.app = app;
		this.getSettings = getSettings;
	}

	get settings() {
		return this.getSettings();
	}

	dailyPath(date) {
		const s = this.settings;
		const name = date.format(s.dailyFormat || DATE_FORMAT);
		const folder = (s.dailyFolder || "").trim();
		return normalizePath(`${folder ? `${folder}/` : ""}${name}.md`);
	}

	/** Notes the list reads, newest first. New items go into the first one. */
	targetPaths() {
		const s = this.settings;
		if (s.location !== "daily") return [notePathOf(s.notePath)];
		const days = Math.min(Math.max(0, Number(s.dailyDaysBack) || 0), 60);
		const paths = [];
		for (let d = 0; d <= days; d++) paths.push(this.dailyPath(moment().subtract(d, "days")));
		// A date format with no day in it would give the same note for every day.
		return [...new Set(paths)];
	}

	archivePath() {
		const p = (this.settings.archivePath || "").trim();
		return p ? notePathOf(p) : null;
	}

	getFile(path) {
		const file = this.app.vault.getAbstractFileByPath(path);
		return file instanceof TFile ? file : null;
	}

	/** The note at `path`, created (with its folders) if it does not exist yet. */
	async ensureFile(path) {
		const { vault } = this.app;
		const existing = vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) return existing;
		if (existing) throw new Error(`"${path}" is a folder, not a note.`);

		const folders = path.split("/").slice(0, -1);
		let dir = "";
		for (const part of folders) {
			dir = dir ? `${dir}/${part}` : part;
			if (vault.getAbstractFileByPath(dir)) continue;
			try {
				await vault.createFolder(dir);
			} catch (error) {
				if (!vault.getAbstractFileByPath(dir)) throw error;
			}
		}

		try {
			return await vault.create(path, "");
		} catch (error) {
			// The note may already exist on disk but not be indexed yet (for example
			// while it is still syncing). Wait for it instead of risking an overwrite.
			for (let i = 0; i < 5; i++) {
				await wait(300);
				const file = vault.getAbstractFileByPath(path);
				if (file instanceof TFile) return file;
			}
			throw error;
		}
	}

	/** Add an item. Returns false if the text was empty. */
	async addTodo(text) {
		const s = this.settings;
		const line = makeTodoLine(text, s.addCreatedDate ? moment().format(DATE_FORMAT) : null);
		if (!line) return false;
		const file = await this.ensureFile(this.targetPaths()[0]);
		await this.app.vault.process(file, (data) => insertLine(data, line, s.addPosition));
		return true;
	}

	/** One entry per note in the list: { path, label, exists, items }. */
	async loadLists() {
		const lists = [];
		for (const path of this.targetPaths()) {
			const file = this.getFile(path);
			if (!file) {
				lists.push({ path, label: labelOf(path), exists: false, items: [] });
				continue;
			}
			const { lines } = splitLines(await this.app.vault.read(file));
			const items = scanItems(lines).map((item) => ({ ...item, path }));
			lists.push({ path, label: labelOf(path), exists: true, items });
		}
		return lists;
	}

	/**
	 * Run `edit(lines, index)` on the line an item came from. Returns false if
	 * that line is no longer in the note (it was changed elsewhere, say by sync).
	 */
	async mutate(item, edit) {
		const file = this.getFile(item.path);
		if (!file) return false;
		let applied = false;
		await this.app.vault.process(file, (data) => {
			const { lines, eol } = splitLines(data);
			const index = locateLine(lines, item);
			if (index === -1) return data;
			if (edit(lines, index) === false) return data;
			applied = true;
			return lines.join(eol);
		});
		return applied;
	}

	toggleItem(item) {
		return this.mutate(item, (lines, i) => {
			const next = toggleLine(lines[i]);
			if (next === null) return false;
			lines[i] = next;
			return true;
		});
	}

	/** Change an item's text, keeping its "added" date stamp. */
	async editItem(item, text) {
		const clean = cleanText(text);
		if (!clean) return false;
		const { stamp } = splitCreated(item.text);
		const full = stamp ? `${clean} ${stamp}` : clean;
		return this.mutate(item, (lines, i) => {
			const next = retextLine(lines[i], full);
			if (next === null) return false;
			lines[i] = next;
			return true;
		});
	}

	deleteItem(item) {
		return this.mutate(item, (lines, i) => {
			lines.splice(i, ownedLines(lines, i).length);
			return true;
		});
	}

	/**
	 * Remove ticked items from every note in the list. If an archive note is set
	 * they are copied there first. Returns how many items were cleared.
	 */
	async clearCompleted() {
		const targets = this.targetPaths();
		const archive = this.archivePath();
		const archiveTo = archive && !targets.includes(archive) ? archive : null;
		let cleared = 0;
		for (const path of targets) {
			const file = this.getFile(path);
			if (!file) continue;
			const { lines } = splitLines(await this.app.vault.read(file));
			const entries = collectCompleted(lines);
			if (entries.length === 0) continue;

			if (archiveTo) {
				const archiveFile = await this.ensureFile(archiveTo);
				const moved = entries.flatMap((entry) => entry.raws);
				await this.app.vault.process(archiveFile, (data) => appendLines(data, moved));
			}

			await this.app.vault.process(file, (data) => {
				const split = splitLines(data);
				const result = removeEntries(split.lines, entries);
				if (result.removed.length === 0) return data;
				cleared += result.removed.length;
				return result.lines.join(split.eol);
			});
		}
		return cleared;
	}
}
