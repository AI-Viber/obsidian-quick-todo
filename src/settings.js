import { PluginSettingTab, Setting } from "obsidian";

export const DEFAULT_SETTINGS = {
	// "fixed": one note. "daily": today's daily note.
	location: "fixed",
	notePath: "To-do.md",
	dailyFolder: "",
	dailyFormat: "YYYY-MM-DD",
	// In daily mode, also list open items from this many earlier days.
	dailyDaysBack: 0,
	// "bottom": after the last item. "top": before the first.
	addPosition: "bottom",
	addCreatedDate: false,
	keepBoxOpen: false,
	// Show "Quick to-do" on Obsidian's "No file is open" screen.
	showOnEmptyTab: true,
	// "New to-do" in the note's ⋯ menu, the right-click menu and the desktop File menu.
	showInMenus: true,
	// Optional note that "Clear" moves finished items into.
	archivePath: "",
	// Whether the Done section in the list is expanded.
	doneOpen: true,
};

export class QuickTodoSettingTab extends PluginSettingTab {
	constructor(app, plugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		const { containerEl } = this;
		const s = this.plugin.settings;
		containerEl.empty();

		const save = async (key, value) => {
			s[key] = value;
			await this.plugin.saveSettings();
		};

		new Setting(containerEl)
			.setName("Save to-dos in")
			.setDesc("One fixed note keeps everything together over time. A daily note puts each day's items beside that day's other notes.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("fixed", "One fixed note")
					.addOption("daily", "Today's daily note")
					.setValue(s.location)
					.onChange(async (value) => {
						await save("location", value);
						this.display();
					}),
			);

		if (s.location === "daily") {
			new Setting(containerEl)
				.setName("Daily note folder")
				.setDesc("Leave blank if your daily notes are in the top level of the vault. If today's note does not exist yet it is created empty, so your daily note template is not applied.")
				.addText((text) =>
					text
						.setPlaceholder("Daily")
						.setValue(s.dailyFolder)
						.onChange((value) => save("dailyFolder", value.trim())),
				);

			new Setting(containerEl)
				.setName("Daily note date format")
				.setDesc("Must match how your daily notes are named.")
				.addText((text) =>
					text
						.setPlaceholder("YYYY-MM-DD")
						.setValue(s.dailyFormat)
						.onChange((value) => save("dailyFormat", value.trim() || DEFAULT_SETTINGS.dailyFormat)),
				);

			new Setting(containerEl)
				.setName("Include earlier days")
				.setDesc("Also list open items from this many previous daily notes. 0 shows today only.")
				.addSlider((slider) =>
					slider
						.setLimits(0, 30, 1)
						.setValue(s.dailyDaysBack)
						.setDynamicTooltip()
						.onChange((value) => save("dailyDaysBack", value)),
				);
		} else {
			new Setting(containerEl)
				.setName("To-do note")
				.setDesc("The note that holds your to-dos. It is created the first time you add one.")
				.addText((text) =>
					text
						.setPlaceholder(DEFAULT_SETTINGS.notePath)
						.setValue(s.notePath)
						.onChange((value) => save("notePath", value.trim() || DEFAULT_SETTINGS.notePath)),
				);
		}

		new Setting(containerEl)
			.setName("Add new items at")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("bottom", "The end of the list")
					.addOption("top", "The start of the list")
					.setValue(s.addPosition)
					.onChange((value) => save("addPosition", value)),
			);

		new Setting(containerEl)
			.setName("Add the date to new items")
			.setDesc("Adds ➕ and today's date, in the format the Tasks plugin uses. The list shows it as a small date so you can see how long an item has been waiting.")
			.addToggle((toggle) => toggle.setValue(s.addCreatedDate).onChange((value) => save("addCreatedDate", value)));

		new Setting(containerEl)
			.setName("Keep the add box open")
			.setDesc("Stay in the add box after each item, ready for the next one.")
			.addToggle((toggle) => toggle.setValue(s.keepBoxOpen).onChange((value) => save("keepBoxOpen", value)));

		new Setting(containerEl)
			.setName("Show on the empty tab screen")
			.setDesc("Adds Quick to-do beside Create new note, Go to file and the other options when no note is open.")
			.addToggle((toggle) => toggle.setValue(s.showOnEmptyTab).onChange((value) => save("showOnEmptyTab", value)));

		new Setting(containerEl)
			.setName("Show in menus")
			.setDesc("Adds New to-do to each note's More options menu and right-click menu, and on desktop to the File menu in the menu bar.")
			.addToggle((toggle) => toggle.setValue(s.showInMenus).onChange((value) => save("showInMenus", value)));

		new Setting(containerEl)
			.setName("Archive note")
			.setDesc("Optional. Clear moves finished items into this note instead of deleting them.")
			.addText((text) =>
				text
					.setPlaceholder("To-do archive.md")
					.setValue(s.archivePath)
					.onChange((value) => save("archivePath", value.trim())),
			);
	}
}
