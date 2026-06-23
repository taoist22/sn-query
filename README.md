"WARNING: This plugin is currently shelved due to a severe memory leak in the Supernote OS getElements API (Error 206) which causes the device to crash when scanning multiple files. The plugin will not function correctly for queries larger than 3-4 files until Ratta patches this native OS bug." 

# SNQuery

SNQuery is a powerful plugin for Supernote that brings Obsidian Dataview-like querying capabilities to your device, enabling dashboard creation and note management without needing to export your notes to a PC.

> [!IMPORTANT]
> SNQuery searches the same folder as the note where you run the plugin. It does not scan the entire device.
>
> For reliability and performance, `[SNQ]` property blocks and loose inline properties must be on page 1 of each note to be found during folder scans. Native Supernote keywords can still be used across matching notes, but full-note property scanning is intentionally not performed.

## Features

- **Dataview-like Syntax**: Query your notes using familiar `TABLE` and `LIST` commands tailored for Supernote's offline environment.
- **On-Demand Dashboards**: Create dashboards that track keywords and property fields. (Note: Dashboards do not auto-update; you simply tap "Run" on your saved queries to fetch the latest data).
- **Templates & Config**: Create, edit, and insert reusable `[SNQ]` item templates.
- **Saved Queries**: Save your frequently used queries and run them with a single tap.
- **Progress Feedback**: Folder scans show live progress so long-running queries are easier to trust.

## Scan Scope

SNQuery is designed to keep scans predictable on-device:

- It scans `.note` files in the current folder only.
- `[SNQ]...[/SNQ]` data blocks must be placed on page 1 of each note.
- Loose properties outside an `[SNQ]` block must also be on page 1.
- Keyword-only searches are faster because they use Supernote's native keyword metadata instead of reading note elements.
- Folder scans do not read handwriting or text across every page of every note.
- Inserted dashboards are snapshots; run the query again to refresh the results.

## Keywords vs Properties

Native Supernote keywords are best used for broad, human-meaningful categories like `#journal`, `#todo`, `#sleep`, `#meeting`, or `#project-alpha`. They are fast to search and are not dependent on `[SNQ]` blocks.

Use `[SNQ]` properties for structured values you want to filter, sort, or calculate, such as `status: open`, `due: 2026-06-25`, `sleep_score: 81`, or `sleep_time: 7:25`. Avoid stuffing property-style data into native keywords; too many overly specific keywords can make Supernote's keyword system harder to browse and less useful.

## Installation

1. Build or download the `SNQuery.snplg` file.
2. Transfer the `.snplg` file to your Supernote device via USB or Supernote Cloud.
3. Open the plugin manager on your Supernote and load the plugin.

## Documentation

For comprehensive instructions on query syntax, setting up dashboards, and using templates, please refer to the [User Manual](USER_MANUAL.md).

## Author

Created by [taoist22](https://github.com/taoist22)

## Credits

- <a href="https://www.flaticon.com/free-icons/query" title="query icons">Query icons created by Cap Cool - Flaticon</a>
