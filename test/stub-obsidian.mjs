// Just enough of Obsidian's API for the plugin to run under Node. This is not a copy of
// Obsidian: it only has the pieces the plugin uses, with the behaviour the tests rely on.

import { FakeEl } from "./fake-dom.mjs";

export class TFile {
	constructor(path) {
		this.path = path;
		this.name = path.split("/").pop();
	}
}

export class TFolder {
	constructor(path) {
		this.path = path;
	}
}

export class Notice {
	constructor(message) {
		Notice.messages.push(String(message));
	}
}
Notice.messages = [];

export function normalizePath(path) {
	return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/|\/$/g, "") || "/";
}

export function setIcon(el, name) {
	el.icon = name;
}

export function debounce(fn, ms) {
	let timer = null;
	const wrapped = (...args) => {
		if (timer !== null) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = null;
			fn(...args);
		}, ms);
	};
	wrapped.cancel = () => {
		if (timer !== null) clearTimeout(timer);
		timer = null;
	};
	return wrapped;
}

// A minimal moment: today (settable), YYYY / MMMM / MMM / MM / DD / D, subtract days, diff in days.
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
let fixedNow = null;

class M {
	constructor(date) {
		this.date = date;
	}

	isValid() {
		return !Number.isNaN(this.date.getTime());
	}

	format(fmt) {
		const d = this.date;
		const two = (n) => String(n).padStart(2, "0");
		return fmt.replace(/YYYY|MMMM|MMM|MM|DD|D/g, (token) => {
			switch (token) {
				case "YYYY": return String(d.getFullYear());
				case "MMMM": return MONTHS[d.getMonth()];
				case "MMM": return MONTHS[d.getMonth()].slice(0, 3);
				case "MM": return two(d.getMonth() + 1);
				case "DD": return two(d.getDate());
				default: return String(d.getDate());
			}
		});
	}

	subtract(n, unit) {
		if (unit !== "days") throw new Error("stub moment only subtracts days");
		const d = new Date(this.date);
		d.setDate(d.getDate() - n);
		return new M(d);
	}

	diff(other, unit) {
		if (unit !== "days") throw new Error("stub moment only diffs in days");
		const day = (m) => Date.UTC(m.date.getFullYear(), m.date.getMonth(), m.date.getDate());
		return Math.trunc((day(this) - day(other)) / 86400000);
	}
}

export function moment(input) {
	if (input === undefined) return new M(fixedNow ? new Date(fixedNow) : new Date());
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
	if (!m) return new M(new Date(NaN));
	const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
	const valid = date.getMonth() === Number(m[2]) - 1 && date.getDate() === Number(m[3]);
	return new M(valid ? date : new Date(NaN));
}
moment.setNow = (ymd) => {
	fixedNow = ymd === null ? null : moment(ymd).date;
};

export class Plugin {
	constructor(app, manifest) {
		this.app = app;
		this.manifest = manifest;
		this.commands = [];
		this.ribbon = [];
		this.tabs = [];
		this.viewCreators = {};
		this.events = [];
		this.protocolHandlers = {};
		this.stored = null;
	}

	addCommand(command) {
		this.commands.push(command);
		return command;
	}

	addRibbonIcon(icon, title, callback) {
		this.ribbon.push({ icon, title, callback });
		return new FakeEl();
	}

	addSettingTab(tab) {
		this.tabs.push(tab);
	}

	registerView(type, creator) {
		this.viewCreators[type] = creator;
	}

	registerEvent(ref) {
		this.events.push(ref);
	}

	registerObsidianProtocolHandler(action, handler) {
		this.protocolHandlers[action] = handler;
	}

	async loadData() {
		return this.stored;
	}

	async saveData(data) {
		this.stored = JSON.parse(JSON.stringify(data));
	}
}

export class ItemView {
	constructor(leaf) {
		this.leaf = leaf;
		this.app = leaf.app;
		this.containerEl = new FakeEl();
		this.contentEl = this.containerEl.createDiv();
	}
}

export class Modal {
	constructor(app) {
		this.app = app;
		this.contentEl = new FakeEl();
		this.titleEl = new FakeEl();
		this.isOpen = false;
	}

	open() {
		this.isOpen = true;
		this.onOpen();
	}

	close() {
		if (!this.isOpen) return;
		this.isOpen = false;
		this.onClose();
	}
}

export class PluginSettingTab {
	constructor(app, plugin) {
		this.app = app;
		this.plugin = plugin;
		this.containerEl = new FakeEl();
	}
}

/** A form control. It remembers the function passed to onChange so tests can call it. */
class Control {
	constructor() {
		this.options = [];
		this.value = undefined;
		this.change = null;
	}

	addOption(value, label) {
		this.options.push([value, label]);
		return this;
	}

	setValue(value) {
		this.value = value;
		return this;
	}

	onChange(fn) {
		this.change = fn;
		return this;
	}

	setPlaceholder() {
		return this;
	}

	setLimits() {
		return this;
	}

	setDynamicTooltip() {
		return this;
	}
}

export class Setting {
	constructor(containerEl) {
		this.containerEl = containerEl;
		this.control = null;
		Setting.created.push(this);
	}

	setName(name) {
		this.name = name;
		return this;
	}

	setDesc(desc) {
		this.desc = desc;
		return this;
	}

	addControl(callback) {
		this.control = new Control();
		callback(this.control);
		return this;
	}

	addDropdown(callback) {
		return this.addControl(callback);
	}

	addText(callback) {
		return this.addControl(callback);
	}

	addToggle(callback) {
		return this.addControl(callback);
	}

	addSlider(callback) {
		return this.addControl(callback);
	}
}
Setting.created = [];
