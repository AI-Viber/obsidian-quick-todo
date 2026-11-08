# Quick To-do for Obsidian

Capture a to-do in one tap and tick items off from a simple list. Everything is saved as ordinary Markdown checklist lines (`- [ ] like this`) in one note, so it works with the rest of Obsidian and with other plugins.

Built for the phone first, but it works the same on desktop.

## Features

- **Add box**: a small dialog with one text field. Type, press Enter (or Add), and the item is saved to your to-do note. It can stay open so you can add several items in a row.
- **To-do list**: a tidy list of open items with large tap targets. Tick the box to finish an item, tap the text (or the pencil) to edit it or delete it. Finished items collect in a **Done** section.
- **One fixed note by default**: everything lands in `To-do.md` (change the name in settings) so open items never get scattered. It is created the first time you add something. Your own headings and text in that note are left alone.
- **Daily note option**: save to today's daily note instead, and optionally list open items from the last few days too.
- **Added date (optional)**: stamps new items with `➕ 2026-11-06`, the format the [Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks) plugin uses. The list shows it as a small date, highlighted once an item has waited two weeks.
- **Clear or archive**: one button removes finished items, or moves them to an archive note if you set one. It asks for a second tap first.
- **On the empty tab screen**: adds **Quick to-do** beside *Create new note*, *Go to file* and the other options on Obsidian's "No file is open" screen. Tap it to open the add box. It can be turned off in settings.
- **In the menus**: **New to-do** is in each note's *More options* (⋯) menu and in the right-click menu while editing (long-press on a phone or tablet). On a Mac (and Windows or Linux) desktop it is also in the **File** menu of the menu bar, showing your *Add item* hotkey if you have set one. Each opens the add box. They can be turned off in settings.
- **Add from a link**: `obsidian://quick-todo?vault=YOUR_VAULT&text=Buy%20milk` opens the add box with the text filled in (handy for an iOS Shortcut). It never adds anything by itself.

## Using it on a phone

The plugin adds three commands, all under *Quick to-do* in the command palette:

| Command | What it does |
| --- | --- |
| Add item | Opens the add box |
| Open list | Opens the list |
| Open note | Opens the to-do note itself |

The empty tab entry has no command of its own: it opens the same add box as *Add item*.

To make capturing quick:

- **Pull-down**: **Settings → Interface → Configure** (next to *Mobile quick action*), then choose *Quick to-do: Add item*. Pulling down from the top of the app then opens the add box.
- **Toolbar**: **Settings → Interface → Configure mobile toolbar**, then add the *Add item* or *Open list* command. The toolbar shows while you are editing a note.
- **Ribbon**: tap the *Open menu* icon at the end of the navigation bar to find *Quick to-do: add item* and *Quick to-do: open list*.

On desktop you can give any of the commands a hotkey under **Settings → Hotkeys**. The plugin sets none by default.

## The note

New items look like this:

```markdown
- [ ] Buy milk
- [ ] Book dentist ➕ 2026-11-06
- [x] Send invoice
```

- Only `[ ]` and `[x]` items are shown. Items with other markers (such as `[-]` or `[/]`) are left alone and not listed.
- Items nested under other items are shown indented. Deleting an item removes any plain notes written directly under it, but never a nested to-do.
- Check boxes inside code blocks and front matter are ignored.
- If the note is changed by another device (for example by sync) just as you tap an item, the plugin finds the item again, or tells you it changed and refreshes. It never edits a line it cannot match.

## Settings

- **Save to-dos in**: one fixed note, or today's daily note.
- **To-do note** (fixed note): the note's path, for example `Inbox/To-do.md`.
- **Daily note folder / date format / include earlier days** (daily note): set these to match how your daily notes are named. If today's note does not exist yet it is created empty, so a daily note template is not applied.
- **Add new items at**: the end or the start of the list.
- **Add the date to new items**: the `➕` date described above.
- **Keep the add box open**: stay in the box after each item.
- **Show on the empty tab screen**: the entry described above (on by default).
- **Show in menus**: the New to-do menu items described above (on by default).
- **Archive note**: where *Clear* moves finished items (blank means delete them).

## Installation

Once it is listed in the community directory: **Settings → Community plugins → Browse**, search for *Quick To-do*, then install and enable it.

To try it before then, install it with [BRAT](https://github.com/TfTHacker/obsidian42-brat) using `AI-Viber/obsidian-quick-todo`, or copy `main.js`, `manifest.json` and `styles.css` from the latest release into `<your vault>/.obsidian/plugins/quick-todo/` and enable the plugin.

## Known limits

Obsidian has no official way for plugins to add to the menu bar. On desktop, Quick To-do adds its File menu item through Electron, the framework Obsidian's desktop app is built on. If a future Obsidian version blocks that, the item simply doesn't appear (the ⋯ and right-click items keep working). The iPad's menu bar belongs to the Obsidian app itself and can't be changed by plugins.

Obsidian has no official way to add to the "No file is open" screen, so the plugin adds its entry to the page directly. If a future Obsidian version changes that screen, the entry may stop appearing (nothing else is affected). The commands, ribbon icons and pull-down action keep working.

## Privacy

The plugin works entirely on your device. It sends nothing over the network and collects no data. It stores only its settings (in the plugin's own `data.json`) and the to-do lines in your notes.

## Development

```bash
npm install
npm run dev      # rebuild on change (writes main.js)
npm run build    # production build
npm run lint
npm test         # runs without npm install
```

The source is plain JavaScript in `src/`, bundled by esbuild. The tests run the real code under Node against a stand-in for Obsidian's API (`test/`), so they check the logic and the screens' behaviour but not how it looks in Obsidian itself.

| File | What it does |
| --- | --- |
| `main.js` | Plugin entry: commands, ribbon, link handler, redraw on note changes |
| `menus.js` | New to-do in the ⋯ menu, the right-click menu and the desktop File menu |
| `todo-core.js` | Reading and editing to-do lines in a note's text (no Obsidian code) |
| `store.js` | Reads and writes the to-do note(s) in the vault |
| `view.js` | The list |
| `empty-state.js` | The entry on the "No file is open" screen |
| `modals.js` | The add and edit dialogs |
| `settings.js` | Settings and the settings screen |
| `ui.js` | The two-tap confirm used by Delete and Clear |

### Releasing

1. Update the version: `npm version patch` (or `minor` / `major`). This updates `manifest.json` and `versions.json` and creates a git tag with no `v` prefix.
2. `git push --follow-tags`. The *Release Obsidian plugin* workflow builds the plugin and creates a **draft** release containing `main.js`, `manifest.json` and `styles.css`.
3. Review and publish the draft release.

## License

[MIT](LICENSE)
