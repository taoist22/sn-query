# SNQuery User Manual

Welcome to SNQuery, a powerful plugin for your Supernote that allows you to create dynamic dashboards, search your notes with precision, and quickly add structured data templates on the fly!

This manual covers everything you need to know to unlock the full potential of SNQuery.

---

## 1. What is SNQuery?

SNQuery is designed to bring Obsidian-style "Dataview" functionality directly to your Supernote. By writing simple inline properties (like `priority: high`) inside special `[SNQ]` blocks, SNQuery can scan your notebook folder and instantly build interactive tables and lists mapping out all your tasks, assignments, and notes.

---

## 2. Setting Up Your Data

To pull information into your SNQuery dashboards, you need to store data in your notes using **Property Blocks**.

A property block is simply text written inside `[SNQ]` and `[/SNQ]` tags. Every line inside the block should be a `key: value` pair.

### Example Property Block:
```text
[SNQ]
type: Assignment
course: ACC201
due: 2026-10-31
status: Open
[/SNQ]
```

### Loose Properties:
You can also use loose properties without the `[SNQ]` block, as long as it starts with a key, a colon, and a value. For example, `status: Open` works on any line, but using `[SNQ]` blocks guarantees precision, especially when using the Add Items tool!

---

## 3. The "Add Items" Tab

The easiest way to generate these property blocks is using the **Add Items** tab. This tab lets you quickly inject new items directly onto your current note canvas.

1. **Item Name**: Type the name of the task or item.
2. **Template**: Select a pre-saved template (like "Assignments") or use the Default template.
3. **Property Grid**: Fill out the fields you want to include (e.g. `status: Open`).
4. **Insert Item**: Tap this button to instantly print the item wrapped in an `[SNQ]` block onto your note!

**Saving Templates**: If you find yourself typing the same keys repeatedly (e.g., `course`, `due`, `status`), simply fill out the keys, leave the values blank, type a name in the Template Name box, and hit **Save Template**.

---

## 4. Querying Your Notes

Once you have data scattered across your notes, it's time to build a dashboard!

### The Basic Tab
The Basic tab allows you to perform simple, quick searches.
- **Keywords or tags**: Enter words like `#ACC201` or `Assignment`.
- **Match Mode**: Choose ALL to require every word, or ANY to require at least one.
- **Filters**: Add specific `key` and `value` pairs (e.g. `status = Open`).

### The Advanced Tab
For maximum control, use the Advanced Tab. This uses a syntax very similar to Obsidian Dataview.

#### Syntax Guide:
- **TABLE**: Generates a column grid. You can specify which fields to show and even rename them using `AS`.
  Example: `TABLE due AS "Due Date", status AS "Status"`
- **LIST**: Generates a simple flat list of the matching items.
- **FROM**: Filter by tags. Example: `FROM #ACC201`
- **WHERE**: Filter by your properties. Supported operators: `=`, `!=`, `>`, `<`, `>=`, `<=`, `CONTAINS`.
  Example: `WHERE status != "Done" AND priority = "High"`
- **SORT**: Sort the results by a specific key.
  Example: `SORT due ASC`
- **LIMIT**: Restrict the number of results.
  Example: `LIMIT 10`

#### Example Advanced Query:
```text
TABLE course AS "Course", due AS "Due Date" 
FROM #Assignment
WHERE status != "Done" 
SORT due ASC
```

---

## 5. Dashboards and Saving Queries

### Saving a Query
If you build a dashboard you want to check frequently (like "Pending Assignments"), you should save it!
1. Type your query in the Advanced Tab.
2. Enter a **Dashboard title** (e.g., "Pending Assignments").
3. Enter a **Query name** (e.g., "ACC201 Assignments").
4. Tap **Save query**.

### Exporting Saved Queries
Saved queries are stored in memory while the plugin is open. To persist them so they survive a device reboot:
1. Open the Saved Queries tab (or the bottom of the Advanced tab).
2. Tap **Export to Note**. This will print a hidden `[SNQ-SAVED]` block onto your current note.
3. In the future, when you open the plugin, tap **Scan Notes** to reload all your saved queries!

### Inserting Dashboards
Once you preview a query, tap **Insert**. The plugin will automatically place a dynamic, interactive dashboard on your canvas. 
- **Links:** The first column of a table (or the items in a list) act as live links. Tapping them with your pen will jump you directly to the original note where that item was created!

---

*Enjoy organizing your Supernote with SNQuery!*
*Created by [taoist22](https://github.com/taoist22)*
