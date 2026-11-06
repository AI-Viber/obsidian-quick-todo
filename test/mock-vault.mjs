import { TFile, TFolder } from "./stub-obsidian.mjs";

/** An in-memory vault with the handful of methods the plugin calls. */
export class MockVault {
	constructor(files = {}) {
		this.nodes = new Map();
		this.contents = new Map();
		// Paths that exist on disk but are not in the index yet (like a note still syncing).
		this.unindexed = new Set();
		this.listeners = [];
		for (const [path, content] of Object.entries(files)) this.seed(path, content);
	}

	seed(path, content) {
		const parts = path.split("/").slice(0, -1);
		let dir = "";
		for (const part of parts) {
			dir = dir ? `${dir}/${part}` : part;
			if (!this.nodes.has(dir)) this.nodes.set(dir, new TFolder(dir));
		}
		const file = new TFile(path);
		this.nodes.set(path, file);
		this.contents.set(path, content);
		return file;
	}

	text(path) {
		return this.contents.get(path);
	}

	getAbstractFileByPath(path) {
		return this.nodes.get(path) ?? null;
	}

	async read(file) {
		return this.contents.get(file.path);
	}

	async process(file, fn) {
		const next = fn(this.contents.get(file.path));
		if (typeof next !== "string") throw new Error("process callback must return a string");
		this.contents.set(file.path, next);
		return next;
	}

	async create(path, data) {
		if (this.nodes.has(path) || this.unindexed.has(path)) throw new Error("File already exists.");
		return this.seed(path, data);
	}

	async createFolder(path) {
		if (this.nodes.has(path)) throw new Error("Folder already exists.");
		this.nodes.set(path, new TFolder(path));
	}

	on(name, callback) {
		const ref = { name, callback };
		this.listeners.push(ref);
		return ref;
	}
}
