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
- **Selected Block Editing**: Lasso an existing `[SNQ]` block and open SNQuery from the lasso menu to edit that block directly.
- **Saved Queries**: Save your frequently used queries and run them with a single tap.
- **Progress Feedback**: Folder scans show live progress so long-running queries are easier to trust.
- **Column Statistics**: Calculate averages, sums, minimums, maximums, and counts for numeric fields.

## Launching SNQuery

SNQuery has two launch paths:

- **Main toolbar/plugin icon** opens the normal Dashboard workflow.
- **Lasso menu on a selected `[SNQ]` block** opens the dedicated editor for that selected block.

Use the main toolbar when you want to run dashboards, saved queries, or insert new templates. Use the lasso menu when you want to update an existing `[SNQ]` block already placed on a note page.

## Scan Scope

SNQuery is designed to keep scans predictable on-device:

- It scans `.note` files in the current folder only.
- `[SNQ]...[/SNQ]` data blocks must be placed on page 1 of each note.
- Loose properties outside an `[SNQ]` block must also be on page 1.
- Keyword-only searches are faster because they use Supernote's native keyword metadata instead of reading note elements.
- SNQuery does not OCR handwriting; handwritten content must be converted to text or tagged with native keywords to be queried.
- Inserted dashboards are snapshots; run the query again to refresh the results.

## Keywords vs Properties

Native Supernote keywords are best used for broad, human-meaningful categories like `#journal`, `#todo`, `#sleep`, `#meeting`, or `#project-alpha`. They are fast to search and are not dependent on `[SNQ]` blocks.

Use `[SNQ]` properties for structured values you want to filter, sort, or calculate, such as `status: open`, `due: 2026-06-25`, `sleep_score: 81`, or `sleep_time: 7:25`. Avoid stuffing property-style data into native keywords; too many overly specific keywords can make Supernote's keyword system harder to browse and less useful.

## Common Workflows

### Todo Dashboard

Add one `[SNQ]` block for each task you want to track:

```text
[SNQ]
type: todo
task: Call Nancy
status: open
due: 2026-06-26
[/SNQ]
```

Then query it:

```text
TABLE task AS "Task", due AS "Due", status AS "Status"
WHERE type = todo AND status = open
SORT due ASC
```

### Sleep Tracking

Time durations can be entered as hours and minutes, such as `7:25` or `6h55m`. SNQuery treats those as durations for statistics.

```text
[SNQ]
type: sleep
date: 2026-06-19
sleep_score: 81
sleep_time: 7:25
[/SNQ]
```

```text
TABLE date AS "Date", sleep_score AS "Sleep Score", sleep_time AS "Sleep Time"
WHERE type = sleep
STATS AVG(sleep_score), AVG(sleep_time), MIN(sleep_score), MAX(sleep_score)
SORT date DESC
```

### Meeting Or Event Dashboard

```text
[SNQ]
type: meeting
meeting: Finance
date: 2026-06-25
time: 11:00
summary: Budget review
[/SNQ]
```

```text
TABLE meeting AS "Meeting", date AS "Date", time AS "Time", summary AS "Summary"
WHERE type = meeting
SORT date ASC
```

## Current Limitations

- SNQuery scans the current folder only.
- Subfolders are not included yet.
- `[SNQ]` blocks and loose inline properties must be on page 1 for folder scans.
- SNQuery does not connect to Supernote's native Tasks or Calendar apps.
- Inserted dashboards are static snapshots and must be rerun to refresh.

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
