# Codex Thread Recovery

Start here first:

- `/Users/ctreatherford/supernote-plugins/sn-views/HANDOFF.md`

Primary build conversation:

- Title: Build SN Views plugin
- Thread ID: 019ec28c-f2d5-7970-b350-e20b07d50fdd
- Original title: Compare /sn-links to Obsidian links
- Folder shown in Codex: /Users/ctreatherford/supernote-plugins
- Status: pinned

If the thread disappears from view again, search Codex threads for:

- Build SN Views plugin
- SN Views
- sleep_score
- lasso

Useful note: Cmd + W can close the active thread/window view without deleting the conversation.

## Session Handoff - 2026-06-15

Latest package:

- `/Users/ctreatherford/supernote-plugins/sn-views/build/outputs/SNViews.snplg`

Current status:

- Full-screen-style SN Views panel is in place.
- Query tab supports multiple WHERE filters.
- Match mode supports `All` and `Any`.
- Operators include `<`, `<=`, `=`, `!=`, `>=`, `>`, and `contains`.
- Date comparisons work for ISO-style dates such as `2026-06-16`.
- Display fields are blank by default. If blank, the plugin displays `date` plus the active filter fields.
- Days back is blank by default, with `30` as the placeholder/internal fallback.
- Insert dashboard closes the plugin after a successful insert.
- Properties Insert and Update Selected close the plugin after success.
- Element cache is cleared before Preview and after writes. This fixed the issue where Preview worked once, then later runs returned zero SNV blocks/text boxes.
- Build script cleans `build/generated` and `build/outputs` before packaging and uses `CI=1` for Metro to avoid watcher/file limit failures.

Tested working:

- Preview can find SNV blocks again after repeated runs.
- Insert dashboard works.
- Multiple filters work for at least:
  - `due <= 2026-06-23`
  - `status != done`
- Changing a matching note to `status: done` removes it from results after the cache fix.

Known issues / next discussion:

- Rename the Query tab section header from `Daily / Journal` to something general like `Dashboard` or `Query`.
- Clarify homework/assignment workflow. Current parser is note-level, so one SNV property set per note works best.
- Decide whether to keep closing the plugin after successful actions or use a success indicator instead.
- Consider hiding or removing unused diagnostic data structures now that visible diagnostics are hidden.
- Consider a future Debug toggle if scanner diagnostics are needed again.
- Consider saved query presets/templates, for example:
  - assignments due this week
  - open tasks
  - low sleep score
  - notes by status/course/type

Helpful current SNV examples:

```text
[SNV]
type: assignment
course: accounting
title: Chapter 4 homework
status: open
due: 2026-06-20
priority: high
[/SNV]
```

## Session Handoff - 2026-06-16

Latest package:

- `/Users/ctreatherford/supernote-plugins/sn-views/build/outputs/SNViews.snplg`

Added first Dataview-like query support:

- Query box now accepts plain keywords or simple Dataview-style text.
- Scanner now includes ordinary `.note` names like `Chapter 1.note` and `Module 2.note`.
- Date-named notes are still narrowed by Days back; undated note names are included in the current folder scan.
- Supported query forms include:
  - `LIST FROM #books WHERE author = "Bob Smith"`
  - `TABLE rating AS "Rating", summary AS "Summary" FROM #games SORT rating DESC`
  - `LIMIT 10`
- `WHERE` supports the existing operators: `<`, `<=`, `=`, `!=`, `>=`, `>`, and `contains`.
- Multiple `WHERE` clauses can be joined with `AND`.
- `FROM #tag` matches native Supernote keywords and SNV `tags:` values.
- `TABLE` output renders as a table-like linked dashboard row format, not a true table object.
- Table-like output now renders each table cell as its own linked text item, with weighted column widths, to avoid truncating the last field.
- Table width tightened after real-device test showed too much spacing between columns.
- Preview rows now show parsed SNV field keys, useful for diagnosing missing table values like `priority`.
- Added editable query block workflow:
  - `Insert query block`
  - `Load selected query`
  - `Run selected query`
- Fixed query block workflow after real-device test showed selection focus is lost when opening from the regular plugin toolbar.
- Plugin now registers an `SN Views` lasso toolbar button for selected text.
- Launching from the lasso toolbar auto-loads selected `[SNV-QUERY]` text into Query mode, or selected `[SNV]` text into Properties mode.
- After device test showed the panel stuck on `Reading selected text...`, lasso toolbar registration was aligned with the other working local lasso plugins: lasso button id `200`, no `isHideToolbar` field.
- Lasso-selected `[SNV-QUERY]` blocks now run directly and insert output below the query block instead of requiring manual load/run/insert steps.
- Added a text-selection toolbar registration (`id 201`) and `PluginDocAPI.getLastSelectedText()` as the first selected-text read path, falling back to `getLassoText()` only when needed.
- After continued hangs, lasso launch now avoids `getLastSelectedText()`/`getLassoText()` and instead reads `getLassoRect()`, scans current page elements, and extracts text from text boxes overlapping the selection.
- Continued device test still hung, so auto-read/auto-run on selection launch is disabled for now. Selection toolbar launch should now simply open SN Views with a status message instead of calling selection APIs immediately.
- Agreed UX after discussion: no auto-run on open. Selection toolbar launch opens SN Views; `Run selected query` should read the selected query and preview it in one tap, without requiring `Load selected query` first.
- Main UI reorganized into four tabs for Nomad-friendly testing:
  - `Dashboard` for guided/basic filters
  - `Add Items` for SNV block insertion/editing
  - `Saved` placeholder for future saved query storage
  - `Advanced` for Dataview-style query text and query-block actions
- Filter matching labels changed from `All`/`Any` to `Match all filters`/`Match any filter`, shown only when there is more than one filter.
- Feedback cleanup:
  - Dashboard keywords/tags field is now separate from Advanced query text and starts blank.
  - Preview/Insert buttons now call explicit handlers instead of receiving tap events as query input.
  - Advanced has a query name field and `Save query` button.
  - Saved tab lists saved queries for the current plugin session with Run/Edit/Delete.
  - Add Items default SNV block changed from daily/journal fields to assignment/item fields.
  - `Run selected query` relabeled `Load & Run Selected Query`.
  - Saved queries are currently in-memory only; persistence still needs implementation.
- Query blocks are normal Supernote text using:

```text
[SNV-QUERY]
TABLE title AS "Assignment", due AS "Due", priority AS "Priority"
FROM #accounting
WHERE type = assignment
SORT due ASC
[/SNV-QUERY]
```
- Nested SNV properties now flatten to dotted keys:

```text
[SNV]
tags: #games
title: Spirit Island
thoughts:
    rating: 10
    reviewable: false
[/SNV]
```

This can be queried with:

```text
LIST FROM #games WHERE thoughts.rating = 10
```

Validated:

- `npm run typecheck`
- `./buildPlugin.sh`

```text
[SNV]
type: daily
tags: #daily, #journal
status: open
due: 2026-06-16
sleep_score: 81
sleep_time:
[/SNV]
```
