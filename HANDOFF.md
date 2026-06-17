# SN Query Handoff

Last updated: 2026-06-16

## Where to Start

Workspace:

- `/Users/ctreatherford/supernote-plugins/sn-query`

Latest built package:

- `/Users/ctreatherford/supernote-plugins/sn-query/build/outputs/SNQuery.snplg`

Build commands that passed:

```bash
npm run typecheck
./buildPlugin.sh
```
*(Note: `./buildPlugin.sh` now automatically deletes the `build/outputs` folder before starting to prevent stale builds.)*

## Current Product Direction

SN Query (formerly SN Views) is becoming a Supernote-friendly Dataview-style dashboard plugin:

- `Dashboard` tab: simple guided builder for basic users.
- `Add Items` tab: currently inserts/edits raw `[SNV]` item blocks; should later become a form/batch-entry helper.
- `Saved` tab: shows saved queries for the current plugin session. Persistence is handled via exporting `[SNV-SAVED]` blocks to notes and scanning the active folder to load them.
- `Advanced` tab: Dataview-like query text, selected-query tools, query-block export.

The primary future workflow should be:

```text
Add Items -> Saved Queries -> Preview -> Insert Dashboard
```

Query blocks on the page should be optional/advanced, not the main path.

## Important Working Query Examples

Advanced query text should not include `[SNV-QUERY]` wrappers:

```text
TABLE title, due, status
WHERE course = "ACC201"
```

Page query blocks use wrappers:

```text
[SNV-QUERY]
TABLE title, due, status
WHERE course = "ACC201"
[/SNV-QUERY]
```

Current item block shape:

```text
[SNV]
type: assignment
course: ACC201
title: Chapter 1 Reading
due: 2026-06-18
status: done
[/SNV]
```

Saved query block shape (for persistence):
```text
[SNV-SAVED]
name: ACC201 Assignments
query: TABLE title, due, status WHERE course = "ACC201"
[/SNV-SAVED]
```

## What Works Now

- **Item-Level Rows**: The scanner now treats each `[SNV]...[/SNV]` block as a distinct item/row, rather than merging all properties on a single note page. This enables multiple tasks/assignments per note!
- **Saved Query Persistence**: The Saved tab has "Export to Note" (inserts `[SNV-SAVED]` blocks) and "Scan Notes" (reads `[SNV-SAVED]` blocks from the active folder).
- **Dashboard Titles**: You can specify a custom title in the Advanced tab which inserts as the heading.
- Ordinary note names like `Chapter 1.note` and `Module 2.note` are scanned.
- Dataview-like `LIST` and `TABLE` queries parse.
- `FROM #tag`, `WHERE`, `SORT`, and `LIMIT` work.
- Nested fields flatten to dotted keys, for example `thoughts.rating`.
- Table output uses individual linked text cells to avoid truncating columns.

## Known Limitations & Device Quirks

- `insertDashboard` executes table cell inserts sequentially. **DO NOT attempt to use `Promise.all` to batch concurrent `PluginNoteAPI.insertTextLink` calls.** We tried this and it completely locked up the Supernote device requiring a hard reboot. It must be slow and sequential to be safe.
- Add Items is still a raw block editor, not a user-friendly assignment/todo entry form.
- Lasso/selection auto-run on plugin open was tried and repeatedly hung on device. Keep the safer one-tap flow.
- Insert after selected-query workflows may be affected by Supernote selection state; this needs more device testing.

## Next Priorities

1. Redesign Add Items as a low-typing form/batch helper:
   - shared fields: course, tags, type, status, priority
   - item lines: title plus optional due date
   - output: one `[SNV]` block per item
2. Visual pass for Nomad:
   - reduce scrolling
   - tighten button labels
   - decide how much preview detail to show
3. Revisit Insert behavior and output placement once multi-block rows and saved queries settle.

## Do Not Forget

The user prefers discussion and explicit OK before coding significant changes. Always double-check assumptions about what tags or property keys they are using in their test queries!
