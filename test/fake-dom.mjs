// A tiny stand-in for the DOM plus the helper methods Obsidian adds to elements
// (createDiv, createEl, addClass, setText, ...). Just enough to render the list and click things.

function checkClass(name) {
	if (/\s/.test(name)) throw new Error(`Invalid class name "${name}" (the real DOM rejects spaces)`);
}

export class FakeEl {
	constructor(tag = "div") {
		this.tag = tag;
		this.children = [];
		this.parent = null;
		this.classes = new Set();
		this.attrs = {};
		this.listeners = {};
		this.text = "";
		this.value = "";
		this.checked = false;
		this.scrollTop = 0;
		this.focused = false;
	}

	applyInfo(info = {}) {
		for (const name of [].concat(info.cls ?? [])) {
			checkClass(name);
			this.classes.add(name);
		}
		if (info.text !== undefined) this.text = info.text;
		if (info.value !== undefined) this.value = info.value;
		if (info.type) this.attrs.type = info.type;
		if (info.placeholder) this.attrs.placeholder = info.placeholder;
		if (info.attr) Object.assign(this.attrs, info.attr);
	}

	createEl(tag, info) {
		const el = new FakeEl(tag);
		el.applyInfo(info);
		el.parent = this;
		this.children.push(el);
		return el;
	}

	createDiv(info) {
		return this.createEl("div", info);
	}

	createSpan(info) {
		return this.createEl("span", info);
	}

	empty() {
		this.children = [];
		this.text = "";
	}

	addClass(...names) {
		for (const name of names) {
			checkClass(name);
			this.classes.add(name);
		}
	}

	removeClass(...names) {
		for (const name of names) this.classes.delete(name);
	}

	hasClass(name) {
		return this.classes.has(name);
	}

	setText(text) {
		this.text = text;
	}

	addEventListener(type, handler) {
		(this.listeners[type] ??= []).push(handler);
	}

	/** Run the handlers for an event and wait for any that are async. */
	async fire(type, event = {}) {
		for (const handler of this.listeners[type] ?? []) {
			await handler({ preventDefault() {}, ...event });
		}
	}

	click() {
		return this.fire("click");
	}

	focus() {
		this.focused = true;
	}

	/** Every descendant element matching `test`. */
	all(test) {
		const found = [];
		for (const child of this.children) {
			if (test(child)) found.push(child);
			found.push(...child.all(test));
		}
		return found;
	}

	findAll(cls) {
		return this.all((el) => el.classes.has(cls));
	}

	find(cls) {
		return this.findAll(cls)[0] ?? null;
	}

	get allText() {
		return [this.text, ...this.children.map((child) => child.allText)].filter(Boolean).join(" ");
	}
}
