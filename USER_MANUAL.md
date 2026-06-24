# SNQuery User Manual

Welcome to **SNQuery**, a powerful querying plugin for your Supernote! This tool allows you to pull scattered notes, action items, and data from across your Supernote into centralized dashboards. 

This manual walks through the four main tabs: **Dashboard**, **Templates & Config**, **Advanced**, and **Saved**.

> [!IMPORTANT]
> **SNQuery is Folder-Specific.** This plugin will only search for notes and data located in the *same folder* as the note where you run the query. It does not scan your entire Supernote device.
>
> **Page 1 property scan.** During folder scans, `[SNQ]` blocks and loose inline properties must be on page 1 of each note. This keeps the plugin reliable and avoids slow full-note scans. Native Supernote keywords can still be used for fast keyword-only matching.

---

## 1. Launching SNQuery

SNQuery can be opened in two different ways. Each one is meant for a different job.

### Main Toolbar Launch

Open SNQuery from the normal Supernote plugin toolbar when you want to:

- Run a dashboard query.
- Preview results.
- Insert a dashboard into the current note.
- Create or insert a new `[SNQ]` block from a template.
- Manage saved queries.

This opens the normal SNQuery Dashboard screen.

### Lasso Menu Launch

If you already have an `[SNQ]` block on a note page, you can lasso that block and choose **SN Query** from the lasso tool plugin menu.

This opens the dedicated **Edit Selected SNQ Block** screen. That screen is only for the block you selected.

Typical flow:

1. Lasso an existing `[SNQ]` block.
2. Choose **SN Query** from the lasso menu.
3. Tap **Load Selected Block**.
4. Edit the properties.
5. Tap **Update Selected Block**.

Updating a selected block changes the block on the note page. It does not change saved templates.

---

## 2. Dashboard Tab (Visual Query Builder)

The Dashboard tab is designed for users who want to build queries quickly without writing code. It provides a visual interface to filter your notes and insert a dashboard.

### How to use the Dashboard Tab:
1. **Dashboard title**: Enter a title for your data table (e.g., "Open TODOs").
2. **Display fields**: Leave blank to default to the note's date and your filter fields, or enter comma-separated columns you want to display (e.g., `task, due`).
3. **Days back**: How many days back the plugin should scan your notes (e.g., `30`).
4. **Keywords or tags**: A root tag or keyword to search for (e.g., `#todo` or `#meetings`).
5. **Filters**: Tap "Add filter" to narrow down your results. 
   - **Property**: The variable you want to check (e.g., `status`).
   - **Operator**: Select from `=`, `!=`, `>`, `<`, `<=`, `>=`, or `contains`.
   - **Value**: What the property should equal (e.g., `open`).
6. **Filter Matching**: If you have multiple filters, choose how they interact:
   - **Match all filters**: Acts as an `AND`. Notes must meet every condition.
   - **Match any filter**: Acts as an `OR`. Notes only need to meet at least one of the conditions.

### Preview & Insert
Once your fields are filled out, tap **Preview** to see the matching notes. If it looks good, open a standard Supernote `.note` file and tap **Insert dashboard** to paste the generated table directly onto your page!

Inserted dashboards include the query name or criteria, the folder scanned, the number of notes found, scanned, and matched, and then the results table or list.

> [!WARNING]
> Inserting a dashboard will place the output at the top and left margin of your note page. This **may overwrite any existing handwriting or text** on that page. It is highly recommended to insert the dashboard on a **blank new page** or in a dedicated "Dashboard" note.

> [!TIP]
> You can generate a dashboard in the folder you want to scan, then select and copy the inserted dashboard output to another note or folder. The inserted note links should continue to open the original source notes, which makes it possible to collect folder-specific dashboard sections into a separate master dashboard note.

### Keyword-Only Queries

Keyword-only searches are the fastest kind of SNQuery search because they use Supernote's native keyword metadata instead of reading `[SNQ]` properties from note pages.

In the Dashboard tab, you can create a keyword-only query by filling in **Keywords or tags** and leaving filters blank:

```text
Keywords or tags: #journal
Days back: 30
Display fields: file
```

In Advanced, the same query would look like:

```text
TABLE file AS "Note"
FROM #journal
SORT date DESC
```

Use native keywords for broad categories you would naturally want to browse in Supernote, such as `#journal`, `#todo`, `#sleep`, `#meeting`, or `#project-alpha`.

Use `[SNQ]` properties for structured data you want to filter, sort, or calculate:

```text
status: open
due: 2026-06-25
sleep_score: 81
sleep_time: 7:25
```

Avoid putting property-style values into native keywords, such as `sleep_score_81` or `status_open`. That can clutter Supernote's keyword list and make keywords less effective as a simple navigation tool.

### Long Scans and Progress

During folder scans, SNQuery shows a progress bar, the current file being scanned, matches found so far, and elapsed time. This is especially useful for large folders.

If a scan takes longer than expected, the progress display should help confirm that the plugin is still working. Large folders may take time because SNQuery safely reads and releases note element data as it scans.

---

## 3. Templates & Config Tab

To query your notes, you need to structure your data so the plugin can read it. The **Templates & Config** tab lets you instantly insert pre-formatted data blocks into your notes.

### Creating a Data Block (The `[SNQ]` Tag)
SNQuery reads properties placed between `[SNQ]` and `[/SNQ]` tags. Put these blocks on page 1 of the note if you want folder dashboards to find them.

In the Templates tab, you can select a template (like a "TODO item" or a "Meeting Note") and insert it directly into your current note.

**Example TODO Template:**
```text
[SNQ]
type: todo
status: open
due: 2026-06-25
task: Follow up with marketing team.
[/SNQ]
```

**Example Meeting Template:**
```text
[SNQ]
type: meeting
date: 2026-06-20
attendees: John, Sarah
summary: Discussed Q3 roadmap.
[/SNQ]
```
*(Tip: Any properties written outside of an `[SNQ]` block in your note act as "global properties" and are automatically applied to every `[SNQ]` block in that file!)*

### Managing Templates

- Tap an existing template to load it into the Item Properties editor.
- Tap **Insert item block** to insert the currently loaded template into the active note.
- Tap **Add New Template** to clear the editor and start a fresh template.
- Enter a template name, edit the Item Properties, then tap **Save as Template**.
- When editing an existing template, use **Update Template** to replace that template with the current editor contents.
- Use **Edit selected block** only when you have selected an existing `[SNQ]` block from the note page.

### One Block Equals One Record

Each `[SNQ]` block represents one item in your dashboard results. If a note has three tasks that should appear as three separate rows, use three separate `[SNQ]` blocks.

You can still place shared note-level properties outside the blocks. For example:

```text
project: Website Redesign

[SNQ]
type: todo
task: Draft homepage copy
status: open
[/SNQ]

[SNQ]
type: todo
task: Review mockups
status: open
[/SNQ]
```

Both tasks inherit `project: Website Redesign`.

---

## 4. Advanced Tab (Dataview Syntax)

If you are comfortable with Dataview-like syntax, the Advanced tab gives you full control to write complex, raw queries.

### Writing a Query
A query consists of a `TABLE` or `LIST` command, followed by a `WHERE` condition, and optionally a `SORT`.

**Example: Pulling all Open TODOs**
```text
TABLE task AS "Task", due AS "Due Date"
WHERE type = todo AND status = open
SORT due ASC
```

**Example: Complex OR Logic for Meetings**
```text
LIST summary
WHERE type = meeting AND attendees contains John OR attendees contains Sarah
SORT date DESC
```

### Statistics

SNQuery can calculate simple statistics for numeric fields.

In the Dashboard tab, turn on **Include column statistics** to calculate basic statistics for displayed numeric columns.

In the Advanced tab, use `STATS`:

```text
TABLE date AS "Date", sleep_score AS "Sleep Score", sleep_time AS "Sleep Time"
WHERE type = sleep
STATS AVG(sleep_score), MAX(sleep_score), MIN(sleep_score), AVG(sleep_time)
SORT date DESC
```

Supported statistics:

- `AVG(field)`
- `SUM(field)`
- `MIN(field)`
- `MAX(field)`
- `COUNT(field)`

Statistics appear in the preview and at the bottom of inserted dashboard output.

### Time Durations

For duration-style values, use hours and minutes instead of decimal guesses.

Good examples:

```text
sleep_time: 7:25
sleep_time: 6h55m
sleep_time: 7 hours 25 minutes
```

SNQuery treats these as durations when calculating statistics. For example, `7:25` is calculated as 7 hours and 25 minutes.

Plain decimal values are still treated as normal numbers. For example, `7.25` means 7.25, not 7 hours and 25 minutes.

### Saving Your Query
Type a name in the "Query name" box and tap **Save query**. It will be saved securely to your device's native storage (`MyStyle/SNQuery/config.json`).

---

## 5. Saved Tab

The Saved tab is your management hub for configurations and saved advanced queries.

- **Run**: Instantly run a saved query and preview the results.
- **Edit**: Load a saved query back into the Advanced tab to tweak the code.
- **Delete**: Remove obsolete queries.
- **Reload Config**: Manually reload your saved configuration file from your Supernote's native storage.

---

## 6. Example Workflows

### Task Dashboard

Use one `[SNQ]` block per task:

```text
[SNQ]
type: todo
task: Call Nancy
status: open
due: 2026-06-26
priority: high
[/SNQ]
```

Query:

```text
TABLE task AS "Task", due AS "Due", priority AS "Priority", status AS "Status"
WHERE type = todo AND status = open
SORT due ASC
```

This creates a task dashboard with links back to the notes where each task was written.

SNQuery does not currently mark tasks complete from the dashboard. To complete a task, open the linked note, lasso the `[SNQ]` block, open SNQuery from the lasso menu, and update `status: done`.

### Calendar Or Meeting Dashboard

```text
[SNQ]
type: meeting
meeting: Finance
date: 2026-06-25
time: 11:00
summary: Budget review
[/SNQ]
```

Query:

```text
TABLE meeting AS "Meeting", date AS "Date", time AS "Time", summary AS "Summary"
WHERE type = meeting
SORT date ASC
```

This can be used for meetings, appointments, reminders, or dated planning items. SNQuery does not currently connect to the native Supernote Calendar app.

### Assignment Tracker

```text
[SNQ]
type: assignment
course: ENG101
assignment: Chapter 6 Homework
due: 2026-06-28
status: open
[/SNQ]
```

Query:

```text
TABLE course AS "Course", assignment AS "Assignment", due AS "Due", status AS "Status"
WHERE type = assignment AND status != done
SORT due ASC
```

### Sleep Tracker

```text
[SNQ]
type: sleep
date: 2026-06-19
sleep_score: 81
sleep_time: 7:25
[/SNQ]
```

Query:

```text
TABLE date AS "Date", sleep_score AS "Sleep Score", sleep_time AS "Sleep Time"
WHERE type = sleep
STATS AVG(sleep_score), MAX(sleep_score), MIN(sleep_score), AVG(sleep_time)
SORT date DESC
```

Use `7:25`, `6h55m`, or `7 hours 25 minutes` for sleep duration values.

---

## 7. Current Limitations

- SNQuery scans the current folder only.
- Subfolders are not included yet.
- `[SNQ]` blocks and loose inline properties must be on page 1 for folder scans.
- SNQuery does not OCR handwriting; handwritten content must be converted to text or tagged with native keywords to be queried.
- SNQuery does not currently connect to Supernote's native Tasks or Calendar apps.
- Inserted dashboards are static snapshots. Run the query again to refresh the output.
- Multiple dashboard sections on one note page may require manual spacing to avoid overlap.
