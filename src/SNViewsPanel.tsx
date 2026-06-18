import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  FileUtils,
  PluginCommAPI,
  PluginDocAPI,
  PluginFileAPI,
  PluginManager,
  PluginNoteAPI,
} from 'sn-plugin-lib';
import {
  BUTTON_ID_LASSO_TEXT,
  BUTTON_ID_SELECTED_TEXT,
  BUTTON_ID_TOOLBAR,
  consumeLastButtonEvent,
  getLastButtonEvent,
  subscribeToButtonEvents,
} from './pluginRouter';

const API_TIMEOUT_MS = 8000;
const LASSO_TEXT_TIMEOUT_MS = 2500;
const PAGE_SCAN_LIMIT = 40;
const KEYWORD_SCAN_LIMIT = 150;
const PROPERTIES_SCAN_PAGE_LIMIT = 10;
const FUTURE_DATE_SCAN_DAYS = 365;
const FALLBACK_DAYS = '30';
const DEFAULT_DAYS = '';
const DEFAULT_QUERY = '';
const DEFAULT_SHOW = '';
const DEFAULT_TABLE_FIELDS = ['file'];
const DEFAULT_QUERY_BLOCK = [
  '[SNQ-QUERY]',
  'TABLE title AS "Assignment", due AS "Due", priority AS "Priority"',
  'FROM #accounting',
  'WHERE type = assignment',
  'SORT due ASC',
  '[/SNQ-QUERY]',
].join('\n');
const DEFAULT_PROPERTIES = [
  'tags:',
  'type: assignment',
  'course:',
  'module:',
  'title:',
  'status:',
  'due:',
  'priority:',
].join('\n');

const DEFAULT_TEMPLATES: SavedTemplate[] = [
  {id: 'default-1', name: 'Assignment', text: 'course: \ntitle: \ndue: \nstatus: open'},
  {id: 'default-2', name: 'To-Do', text: 'title: \ndue: \npriority: \nstatus: open'},
  {id: 'default-3', name: 'Meeting', text: 'date: \nattendees: \ntopic: '}
];

type ViewRow = {
  path: string;
  name: string;
  dateLabel: string;
  included: boolean;
  keywordPassed: boolean;
  wherePassed: boolean;
  matchedKeywords: string[];
  matchedPages: number[];
  allKeywords: string[];
  properties: Record<string, string>;
  propertyBlockCount: number;
  textBoxCount: number;
  elementCount: number;
  pageDiagnostics: string[];
  whereLabel: string;
  elapsedMs: number;
  errors: string[];
};

type ViewResult = {
  folder: string;
  days: number;
  terms: string[];
  candidateCount: number;
  datedCount: number;
  scannedCount: number;
  matchedCount: number;
  rows: ViewRow[];
  elapsedMs: number;
  errors: string[];
};

type Mode = 'dashboard' | 'addItems' | 'saved' | 'advanced';
type MatchMode = 'all' | 'any';
type WhereOperator = '<' | '<=' | '=' | '!=' | '>=' | '>' | 'contains';
type WhereFilter = {
  id: string;
  key: string;
  op: WhereOperator;
  value: string;
};
type QueryKind = 'list' | 'table';
type FieldSpec = {
  key: string;
  label: string;
};
type SortSpec = {
  key: string;
  direction: 'asc' | 'desc';
};
type ParsedQuery = {
  kind: QueryKind;
  sourceTerms: string[];
  filters: WhereFilter[];
  fields: FieldSpec[];
  sort: SortSpec | null;
  limit: number | null;
};
type Rect = {left: number; top: number; right: number; bottom: number};
type SavedQuery = {
  id: string;
  name: string;
  query: string;
  title?: string;
};
type SavedTemplate = {
  id: string;
  name: string;
  text: string;
};

function newWhereFilter(): WhereFilter {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    key: '',
    op: '<',
    value: '',
  };
}

function activeFilters(filters: WhereFilter[]): WhereFilter[] {
  return filters.filter(filter => filter.key.trim().length > 0);
}

function filterFromParts(key: string, op: WhereOperator, value: string): WhereFilter {
  return {
    id: `${key}-${op}-${value}-${Math.random().toString(36).slice(2, 8)}`,
    key: key.trim().toLowerCase(),
    op,
    value: value.trim(),
  };
}

function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

function dirname(path: string): string {
  return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : path;
}

function isNotePath(path: string): boolean {
  return /\.note$/i.test(path);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function parseNoteDate(path: string): Date | null {
  const m = basename(path).match(/(20\d{2})[-_](\d{2})[-_](\d{2})/);
  if (!m) {
    return null;
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function formatDateLabel(date: Date | null): string {
  if (!date) {
    return '';
  }
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function termsFromInput(input: string): string[] {
  const raw = input
    .split(/[,\s]+/)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  const expanded: string[] = [];
  for (const term of raw) {
    expanded.push(term);
    if (term.startsWith('#')) {
      expanded.push(term.slice(1));
    } else {
      expanded.push('#' + term);
    }
  }
  return uniqueStrings(expanded);
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function splitCsvRespectingQuotes(input: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quote = '';
  for (const ch of input) {
    if ((ch === '"' || ch === "'") && (!quote || quote === ch)) {
      quote = quote ? '' : ch;
      current += ch;
      continue;
    }
    if (ch === ',' && !quote) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts;
}

function parseFieldSpec(input: string): FieldSpec | null {
  const m = input.match(/^([A-Za-z0-9_.-]+)(?:\s+AS\s+(.+))?$/i);
  if (!m) {
    return null;
  }
  const key = m[1].trim().toLowerCase();
  const label = stripQuotes((m[2] ?? key).trim());
  return key ? {key, label} : null;
}

function parseWhereExpression(input: string): WhereFilter | null {
  const m = input.match(/^([A-Za-z0-9_.-]+)\s*(<=|>=|!=|=|<|>|contains)\s*(.+)$/i);
  if (!m) {
    return null;
  }
  return filterFromParts(
    m[1],
    m[2].toLowerCase() as WhereOperator,
    stripQuotes(m[3]),
  );
}

function parseDataviewQuery(input: string): ParsedQuery | null {
  const compact = input.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
  const head = compact.match(/^(LIST|TABLE)\b/i);
  if (!head) {
    return null;
  }
  const kind = head[1].toLowerCase() as QueryKind;
  const fields: FieldSpec[] = [];

  if (kind === 'table') {
    const tableMatch = compact.match(
      /^TABLE\s+(.+?)(?=\s+FROM\b|\s+WHERE\b|\s+SORT\b|\s+LIMIT\b|$)/i,
    );
    if (tableMatch) {
      for (const part of splitCsvRespectingQuotes(tableMatch[1])) {
        const field = parseFieldSpec(part);
        if (field) {
          fields.push(field);
        }
      }
    }
  }

  const sourceTerms: string[] = [];
  const fromMatch = compact.match(/\bFROM\s+(.+?)(?=\s+WHERE\b|\s+SORT\b|\s+LIMIT\b|$)/i);
  if (fromMatch) {
    sourceTerms.push(...termsFromInput(fromMatch[1]));
  }

  const filters: WhereFilter[] = [];
  const whereMatch = compact.match(/\bWHERE\s+(.+?)(?=\s+SORT\b|\s+LIMIT\b|$)/i);
  if (whereMatch) {
    for (const part of whereMatch[1].split(/\s+AND\s+/i)) {
      const filter = parseWhereExpression(part.trim());
      if (filter) {
        filters.push(filter);
      }
    }
  }

  let sort: SortSpec | null = null;
  const sortMatch = compact.match(/\bSORT\s+([A-Za-z0-9_.-]+)(?:\s+(ASC|DESC))?/i);
  if (sortMatch) {
    sort = {
      key: sortMatch[1].trim().toLowerCase(),
      direction: (sortMatch[2]?.toLowerCase() === 'desc' ? 'desc' : 'asc') as
        | 'asc'
        | 'desc',
    };
  }

  let limit: number | null = null;
  const limitMatch = compact.match(/\bLIMIT\s+(\d+)/i);
  if (limitMatch) {
    limit = Math.max(1, Math.min(100, Number(limitMatch[1])));
  }

  return {
    kind,
    sourceTerms: uniqueStrings(sourceTerms),
    filters,
    fields: fields.length > 0 ? fields : DEFAULT_TABLE_FIELDS.map(key => ({key, label: titleCaseProperty(key)})),
    sort,
    limit,
  };
}

function keywordMatches(keyword: string, terms: string[]): boolean {
  const lower = keyword.toLowerCase();
  return terms.some(term => lower === term || lower.includes(term));
}

function labelForRow(row: ViewRow): string {
  const bits = row.whereLabel || row.matchedKeywords.slice(0, 3).join(', ');
  return [row.dateLabel, bits || row.name].filter(Boolean).join('  ');
}

function titleCaseProperty(key: string): string {
  return key
    .trim()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function defaultDashboardTitle(
  filters: WhereFilter[],
  matchMode: MatchMode,
  days: string,
): string {
  const active = activeFilters(filters);
  if (active.length === 1) {
    const filter = active[0];
    return `${titleCaseProperty(filter.key)} ${filter.op} ${filter.value.trim()} in the last ${
      days || FALLBACK_DAYS
    } days`;
  }
  if (active.length > 1) {
    return `${matchMode === 'all' ? 'All' : 'Any'} filters in the last ${
      days || FALLBACK_DAYS
    } days`;
  }
  return `SN Query - last ${days || FALLBACK_DAYS} days`;
}

function trimLabel(label: string, maxChars: number): string {
  if (label.length <= maxChars) {
    return label;
  }
  return label.slice(0, Math.max(1, maxChars - 3)) + '...';
}

function asTextBox(value: any): any | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  if (value.textBox && typeof value.textBox === 'object') {
    return value.textBox;
  }
  return value;
}

function readTextBoxContent(textBox: any): string {
  return [
    textBox?.textContentFull,
    textBox?.textDigestData,
    textBox?.fullText,
    textBox?.showText,
  ]
    .filter(value => typeof value === 'string' && value.length > 0)
    .join('\n');
}

function previewText(text: string, maxChars = 80): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxChars) {
    return compact;
  }
  return compact.slice(0, maxChars - 3) + '...';
}

function elementKeys(element: any): string {
  const value = asTextBox(element);
  if (!value || typeof value !== 'object') {
    return '(none)';
  }
  return Object.keys(value).slice(0, 8).join(', ') || '(none)';
}

function normalizePropertyBlock(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return ['[SNQ]', DEFAULT_PROPERTIES, '[/SNQ]'].join('\n');
  }
  if (trimmed.includes('[SNQ]') && trimmed.includes('[/SNQ]')) {
    return trimmed;
  }
  return ['[SNQ]', trimmed, '[/SNQ]'].join('\n');
}

function normalizeQueryBlock(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return DEFAULT_QUERY_BLOCK;
  }
  if (trimmed.toLowerCase().includes('[snq-query]')) {
    return trimmed;
  }
  return ['[SNQ-QUERY]', trimmed, '[/SNQ-QUERY]'].join('\n');
}

function extractQueryText(text: string): string {
  const lower = text.toLowerCase();
  const start = lower.indexOf('[snq-query]');
  const end = lower.indexOf('[/snq-query]');
  if (start >= 0 && end > start) {
    return text.slice(start + '[SNQ-QUERY]'.length, end).trim();
  }
  return text.trim();
}

function parsePropertyItems(body: string, loose: boolean): Record<string, string>[] {
  const items: Record<string, string>[] = [];
  const sharedProps: Record<string, string> = {};
  let currentItem: Record<string, string> | null = null;
  const stack: {indent: number; key: string}[] = [];

  for (const line of body.split(/\r?\n/)) {
    const listMatch = line.match(/^(\s*)-\s+(.*)$/);
    if (listMatch) {
      if (currentItem) {
        items.push({...sharedProps, ...currentItem});
      }
      currentItem = {};
      stack.length = 0;
      const rest = listMatch[2];
      const propMatch = loose
        ? rest.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*?)\s*$/)
        : rest.match(/^([^:#\n][^:\n]*?)\s*:\s*(.*?)\s*$/);
      if (propMatch) {
        const rawKey = propMatch[1].trim().toLowerCase();
        const value = propMatch[2].trim();
        if (rawKey) {
          currentItem[rawKey] = value;
        }
      }
      continue;
    }

    const m = loose
      ? line.match(/^(\s*)([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*?)\s*$/)
      : line.match(/^(\s*)([^:#\n][^:\n]*?)\s*:\s*(.*?)\s*$/);
    if (!m) continue;

    const indent = m[1].replace(/\t/g, '    ').length;
    const rawKey = m[2].trim().toLowerCase();
    const value = m[3].trim();

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    const parent = stack.length > 0 ? stack[stack.length - 1].key : '';
    const key = parent ? `${parent}.${rawKey}` : rawKey;

    if (key) {
      const target = currentItem ? currentItem : sharedProps;
      target[key] = value;
      if (parent && target[rawKey] == null) {
        target[rawKey] = value;
      }
      if (!value) {
        stack.push({indent, key});
      }
    }
  }

  if (currentItem) {
    items.push({...sharedProps, ...currentItem});
  } else if (Object.keys(sharedProps).length > 0) {
    items.push(sharedProps);
  }
  return items;
}

function extractBlocks(text: string, openTag: string, closeTag: string): string[] {
  const lower = text.toLowerCase();
  const openLower = openTag.toLowerCase();
  const closeLower = closeTag.toLowerCase();
  const blocks: string[] = [];
  let pos = 0;
  while (true) {
    const start = lower.indexOf(openLower, pos);
    if (start < 0) break;
    const end = lower.indexOf(closeLower, start + openLower.length);
    if (end > start) {
      blocks.push(text.slice(start + openLower.length, end).trim());
      pos = end + closeLower.length;
    } else {
      break;
    }
  }
  return blocks;
}

function parseProperties(text: string): Record<string, string>[] {
  const blocks = extractBlocks(text, '[SNQ]', '[/SNQ]');
  return blocks.flatMap(block => parsePropertyItems(block, false));
}

function parseLooseProperties(text: string): Record<string, string> {
  const items = parsePropertyItems(text, true);
  return items.length > 0 ? Object.assign({}, ...items) : {};
}

function mergeProperties(blocks: Record<string, string>[]): Record<string, string> {
  return Object.assign({}, ...blocks);
}

function numberFromValue(value: string): number | null {
  if (!value) return null;
  const m = value.trim().match(/^-?\d+(\.\d+)?$/);
  if (!m) {
    return null;
  }
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function dateTimeFromValue(value: string): number | null {
  const m = value.match(/\b(20\d{2})[-_/.](\d{1,2})[-_/.](\d{1,2})\b/);
  if (!m) {
    return null;
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date.getTime();
}

function compareProperty(
  props: Record<string, string>,
  key: string,
  op: WhereOperator,
  expected: string,
): boolean {
  const cleanKey = key.trim().toLowerCase();
  const cleanExpected = expected.trim();
  if (!cleanKey) {
    return true;
  }
  const actual = props[cleanKey];
  if (actual == null) {
    return false;
  }

  const actualDate = dateTimeFromValue(actual);
  const expectedDate = dateTimeFromValue(cleanExpected);
  if ((actualDate == null) !== (expectedDate == null)) {
    return op === 'contains'
      ? actual.toLowerCase().includes(cleanExpected.toLowerCase())
      : false;
  }
  const actualNum = actualDate ?? numberFromValue(actual);
  const expectedNum = expectedDate ?? numberFromValue(cleanExpected);
  if (op === 'contains') {
    return actual.toLowerCase().includes(cleanExpected.toLowerCase());
  }
  if (op === '!=' && (actualDate == null || expectedDate == null)) {
    return actual.trim().toLowerCase() !== cleanExpected.toLowerCase();
  }
  if (op === '=' && (actualDate == null || expectedDate == null)) {
    return actual.trim().toLowerCase() === cleanExpected.toLowerCase();
  }
  if (actualNum == null || expectedNum == null) {
    return false;
  }
  if (op === '=') {
    return actualNum === expectedNum;
  }
  if (op === '!=') {
    return actualNum !== expectedNum;
  }
  if (op === '<') {
    return actualNum < expectedNum;
  }
  if (op === '<=') {
    return actualNum <= expectedNum;
  }
  if (op === '>=') {
    return actualNum >= expectedNum;
  }
  return actualNum > expectedNum;
}

function compareFilters(
  props: Record<string, string>,
  filters: WhereFilter[],
  matchMode: MatchMode,
): boolean {
  const active = activeFilters(filters);
  if (active.length === 0) {
    return true;
  }
  const results = active.map(filter =>
    compareProperty(props, filter.key, filter.op, filter.value),
  );
  return matchMode === 'all'
    ? results.every(Boolean)
    : results.some(Boolean);
}

function whereLabelFor(
  props: Record<string, string>,
  key: string,
  op: WhereOperator,
  expected: string,
): string {
  const cleanKey = key.trim().toLowerCase();
  if (!cleanKey) {
    return '';
  }
  const actual = props[cleanKey];
  return actual == null ? `${cleanKey}: missing` : `${cleanKey}: ${actual} (${op} ${expected})`;
}

function whereLabelsFor(
  props: Record<string, string>,
  filters: WhereFilter[],
): string {
  return activeFilters(filters)
    .map(filter => whereLabelFor(props, filter.key, filter.op, filter.value))
    .filter(Boolean)
    .join('  ·  ');
}

function criteriaForFilters(filters: WhereFilter[], matchMode: MatchMode): string {
  const active = activeFilters(filters);
  if (active.length === 0) {
    return '';
  }
  const joiner = matchMode === 'all' ? ' AND ' : ' OR ';
  return `WHERE ${active
    .map(filter => `${filter.key.trim()} ${filter.op} ${filter.value.trim()}`)
    .join(joiner)}`;
}

function fieldsFromInput(input: string, fallbackFields: string[]): string[] {
  const fields = input
    .split(/[,\n]+/)
    .map(field => field.trim().toLowerCase())
    .filter(Boolean);
  if (fields.length > 0) {
    return uniqueStrings(fields);
  }
  return uniqueStrings([
    'date',
    ...fallbackFields.map(field => field.trim().toLowerCase()),
  ].filter(Boolean));
}

function valueForField(row: ViewRow, field: string): string {
  const cleanField = field.trim().toLowerCase();
  if (cleanField === 'date') {
    return row.dateLabel;
  }
  if (cleanField === 'file' || cleanField === 'name') {
    return row.name.replace(/\.note$/i, '');
  }
  if (row.properties[cleanField] != null) {
    return row.properties[cleanField];
  }
  const suffixKey = Object.keys(row.properties).find(key =>
    key.endsWith(`.${cleanField}`),
  );
  if (suffixKey) {
    return row.properties[suffixKey] ?? '';
  }
  const compactField = cleanField.replace(/[^a-z0-9]/g, '');
  const looseKey = Object.keys(row.properties).find(
    key => key.replace(/[^a-z0-9]/g, '') === compactField,
  );
  return looseKey ? row.properties[looseKey] ?? '' : '';
}

function comparableValue(row: ViewRow, field: string): number | string {
  const value = valueForField(row, field.trim().toLowerCase());
  const dateValue = dateTimeFromValue(value);
  if (dateValue != null) {
    return dateValue;
  }
  const numericValue = numberFromValue(value);
  if (numericValue != null) {
    return numericValue;
  }
  return value.trim().toLowerCase();
}

function sortRows(rows: ViewRow[], sort: SortSpec | null): ViewRow[] {
  if (!sort) {
    return rows;
  }
  const direction = sort.direction === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = comparableValue(a, sort.key);
    const bv = comparableValue(b, sort.key);
    if (av === '' && bv !== '') {
      return 1;
    }
    if (bv === '' && av !== '') {
      return -1;
    }
    if (typeof av === 'number' && typeof bv === 'number') {
      return (av - bv) * direction;
    }
    return String(av).localeCompare(String(bv)) * direction;
  });
}

function displayLabelForRow(row: ViewRow, fields: string[]): string {
  const parts = fields
    .map(field => {
      const value = valueForField(row, field);
      if (!value) {
        return '';
      }
      return field === 'date' ? value : `${field}: ${value}`;
    })
    .filter(Boolean);
  return parts.join('  ');
}

function displayLabelForSpecs(row: ViewRow, fields: FieldSpec[]): string {
  return fields
    .map(field => {
      const value = valueForField(row, field.key);
      return value ? `${field.label}: ${value}` : '';
    })
    .filter(Boolean)
    .join('  ');
}

function tableFieldWeight(field: FieldSpec): number {
  const key = field.key.toLowerCase();
  if (['title', 'summary', 'assignment', 'description'].includes(key)) {
    return 1.8;
  }
  if (['due', 'date', 'rating', 'priority', 'status'].includes(key)) {
    return 1;
  }
  return 1.4;
}

function tableColumnRects(
  fields: FieldSpec[],
  left: number,
  top: number,
  width: number,
  height: number,
  gap: number,
): {field: FieldSpec; left: number; right: number; top: number; bottom: number}[] {
  const weights = fields.map(tableFieldWeight);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const usableWidth = width - gap * Math.max(0, fields.length - 1);
  let x = left;
  return fields.map((field, index) => {
    const isLast = index === fields.length - 1;
    const colWidth = isLast
      ? left + width - x
      : Math.max(90, Math.floor((usableWidth * weights[index]) / totalWeight));
    const rect = {field, left: x, right: x + colWidth, top, bottom: top + height};
    x += colWidth + gap;
    return rect;
  });
}

function rowLabelForQuery(
  row: ViewRow,
  parsed: ParsedQuery | null,
  showFields: string[],
): string {
  if (parsed?.kind === 'table') {
    return displayLabelForSpecs(row, parsed.fields);
  }
  if (parsed?.kind === 'list' && parsed.fields.length > 0) {
    return displayLabelForSpecs(row, parsed.fields);
  }
  return displayLabelForRow(row, showFields) || labelForRow(row);
}

function numericValues(rows: ViewRow[], key: string): number[] {
  const cleanKey = key.trim().toLowerCase();
  if (!cleanKey) {
    return [];
  }
  return rows
    .map(row => numberFromValue(row.properties[cleanKey] ?? ''))
    .filter((value): value is number => typeof value === 'number');
}

function dateValues(rows: ViewRow[], key: string): number[] {
  const cleanKey = key.trim().toLowerCase();
  if (!cleanKey) {
    return [];
  }
  return rows
    .map(row => dateTimeFromValue(row.properties[cleanKey] ?? ''))
    .filter((value): value is number => typeof value === 'number');
}

function formatDateFromTime(value: number): string {
  return formatDateLabel(new Date(value));
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function statsForRows(rows: ViewRow[], key: string): string {
  const cleanKey = key.trim().toLowerCase();
  if (!cleanKey) {
    return `Count: ${rows.length}`;
  }
  const dates = dateValues(rows, cleanKey);
  if (dates.length > 0) {
    return [
      `Count: ${rows.length}`,
      `Earliest: ${formatDateFromTime(Math.min(...dates))}`,
      `Latest: ${formatDateFromTime(Math.max(...dates))}`,
    ].join('   ');
  }
  const nums = numericValues(rows, cleanKey);
  if (nums.length > 0) {
    return [
      `Count: ${rows.length}`,
      `Average: ${formatNumber(nums.reduce((sum, value) => sum + value, 0) / nums.length)}`,
      `Lowest: ${formatNumber(Math.min(...nums))}`,
      `Highest: ${formatNumber(Math.max(...nums))}`,
    ].join('   ');
  }
  return `Count: ${rows.length}`;
}

function propertyValuesForKeywords(props: Record<string, string>): string[] {
  const tags = props.tags ?? '';
  const type = props.type ?? '';
  return [tags, type]
    .join(' ')
    .split(/[,\s]+/)
    .map(value => value.trim())
    .filter(Boolean);
}

async function withTimeout<T>(label: string, task: Promise<T>): Promise<T> {
  return (await Promise.race([
    task,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout`)), API_TIMEOUT_MS),
    ),
  ])) as T;
}

async function getLassoTextWithTimeout(): Promise<any> {
  return (await Promise.race([
    PluginNoteAPI.getLassoText() as Promise<any>,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('getLassoText timeout')), LASSO_TEXT_TIMEOUT_MS),
    ),
  ])) as any;
}

async function getSelectedTextWithTimeout(): Promise<string> {
  const res = (await Promise.race([
    PluginDocAPI.getLastSelectedText() as Promise<any>,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('getLastSelectedText timeout')), LASSO_TEXT_TIMEOUT_MS),
    ),
  ])) as any;
  const value = typeof res?.result === 'string' ? res.result : '';
  return value.trim();
}

async function readSelectedTextByRect(): Promise<{text: string; box: any | null}> {
  const rectRes = (await withTimeout(
    'getLassoRect',
    PluginCommAPI.getLassoRect() as Promise<any>,
  )) as any;
  const lassoRect = rectRes?.result as Rect | undefined;
  if (!rectRes?.success || !lassoRect) {
    return {text: '', box: null};
  }

  const pathRes = (await withTimeout(
    'getCurrentFilePath',
    PluginCommAPI.getCurrentFilePath() as Promise<any>,
  )) as any;
  const pageRes = (await withTimeout(
    'getCurrentPageNum',
    PluginCommAPI.getCurrentPageNum() as Promise<any>,
  )) as any;
  if (
    !pathRes?.success ||
    !pageRes?.success ||
    typeof pathRes.result !== 'string' ||
    typeof pageRes.result !== 'number'
  ) {
    return {text: '', box: null};
  }

  const elementsRes = (await withTimeout(
    'getElements',
    PluginFileAPI.getElements(pageRes.result, pathRes.result) as Promise<any>,
  )) as any;
  const elements = Array.isArray(elementsRes?.result) ? elementsRes.result : [];
  const textBoxes = elements
    .map(asTextBox)
    .filter((box: any): box is any => Boolean(box?.textRect))
    .filter((box: any) => rectsOverlap(box.textRect as Rect, lassoRect));
  if (textBoxes.length === 0) {
    return {text: '', box: null};
  }
  const text = textBoxes.map(readTextBoxContent).filter(Boolean).join('\n').trim();
  return {text, box: textBoxes[0]};
}

async function readSelectedTextAny(
  allowNativeFallback = true,
): Promise<{text: string; box: any | null}> {
  try {
    const byRect = await readSelectedTextByRect();
    if (byRect.text) {
      return byRect;
    }
  } catch {
    // fall through to native selection APIs if allowed
  }
  if (!allowNativeFallback) {
    return {text: '', box: null};
  }
  try {
    const selected = await getSelectedTextWithTimeout();
    if (selected) {
      return {text: selected, box: null};
    }
  } catch {
    // fall back to lasso text boxes
  }
  const res = (await getLassoTextWithTimeout()) as any;
  const textBoxes = Array.isArray(res?.result)
    ? res.result.map(asTextBox).filter(Boolean)
    : [];
  if (!res?.success || textBoxes.length === 0) {
    return {text: '', box: null};
  }
  const box = textBoxes[0];
  return {text: readTextBoxContent(box), box};
}

function clearElementCacheSafe(): void {
  try {
    (PluginCommAPI as any).clearElementCache?.();
  } catch {
    // best-effort cache refresh
  }
}

async function listNoteFilesInFolder(folder: string): Promise<string[]> {
  const list = (await withTimeout('listFiles', FileUtils.listFiles(folder))) as any;
  const raw = Array.isArray(list) ? list : list?.result;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((item: any) => (typeof item === 'string' ? item : item?.path))
    .filter((path: unknown): path is string => typeof path === 'string')
    .filter(isNotePath)
    .sort((a: string, b: string) => basename(a).localeCompare(basename(b)));
}

function mergeCandidatePaths(paths: string[], currentPath: string): string[] {
  return uniqueStrings([
    isNotePath(currentPath) ? currentPath : '',
    ...paths,
  ]);
}

async function readPropertiesFromNote(
  path: string,
  pages: number,
  wantedKeys: string[],
  errors: string[],
): Promise<{
  items: Record<string, string>[];
  savedQueries: SavedQuery[];
  savedTemplates: SavedTemplate[];
  blockCount: number;
  textBoxCount: number;
  elementCount: number;
  pageDiagnostics: string[];
}> {
  const pageCount = Math.min(pages, PROPERTIES_SCAN_PAGE_LIMIT);
  const blocks: Record<string, string>[] = [];
  const looseBlocks: Record<string, string>[] = [];
  const parsedSavedQueries: SavedQuery[] = [];
  const parsedSavedTemplates: SavedTemplate[] = [];
  const cleanWantedKeys = wantedKeys
    .map(key => key.trim().toLowerCase())
    .filter(Boolean);
  let textBoxCount = 0;
  let elementCount = 0;
  let snqBlockCount = 0;
  const pageDiagnostics: string[] = [];

  const scanApiPage = async (apiPage: number, label: string): Promise<number> => {
    const res = (await withTimeout(
      'getElements',
      PluginFileAPI.getElements(apiPage, path) as Promise<any>,
    )) as any;
    if (!res?.success || !Array.isArray(res.result)) {
      pageDiagnostics.push(`${label}: unavailable`);
      return 0;
    }
    const elements = res.result;
    elementCount += elements.length;
    const first = elements[0];
    const firstText = first ? readTextBoxContent(asTextBox(first)) : '';
    pageDiagnostics.push(
      `${label}: elements ${elements.length}${
        first ? ` keys ${elementKeys(first)}` : ''
      }${firstText ? ` text "${previewText(firstText)}"` : ''}`,
    );
    for (const element of elements) {
      const text = readTextBoxContent(asTextBox(element));
      if (text) {
        textBoxCount++;
      }
      const lower = text.toLowerCase();
      if (lower.includes('[snq-saved]') && lower.includes('[/snq-saved]')) {
        const savedBlocks = extractBlocks(text, '[SNQ-SAVED]', '[/SNQ-SAVED]');
        for (const block of savedBlocks) {
          const parsed = parsePropertyItems(block, false);
          for (const item of parsed) {
            if (item.name && item.query) {
              parsedSavedQueries.push({
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                name: item.name,
                query: item.query,
                title: item.title,
              });
            }
          }
        }
      }

      if (lower.includes('[snq-template]') && lower.includes('[/snq-template]')) {
        const templateBlocks = extractBlocks(text, '[SNQ-TEMPLATE]', '[/SNQ-TEMPLATE]');
        for (const block of templateBlocks) {
          const parsed = parsePropertyItems(block, false);
          for (const item of parsed) {
            if (item.name && item.text) {
              parsedSavedTemplates.push({
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                name: item.name,
                text: item.text,
              });
            }
          }
        }
      }
      
      if (lower.includes('[snq]') && lower.includes('[/snq]')) {
        const parsedItems = parseProperties(text);
        if (parsedItems.length > 0) {
          blocks.push(...parsedItems);
          snqBlockCount++;
        }
      } else if (
        cleanWantedKeys.length > 0 &&
        cleanWantedKeys.some(key => lower.includes(key))
      ) {
        const loose = parseLooseProperties(text);
        if (Object.keys(loose).length > 0) {
          looseBlocks.push(loose);
        }
      }
    }
    return elements.length;
  };

  let scannedPageOneFallback = false;
  for (let page = 0; page < pageCount; page++) {
    if (page === 1 && scannedPageOneFallback) {
      continue;
    }
    try {
      const found = await scanApiPage(page, `api p.${page}`);
      if (page === 0 && found === 0 && pageCount > 1) {
        await scanApiPage(1, 'api p.1 fallback');
        scannedPageOneFallback = true;
      }
    } catch (e) {
      errors.push(`Properties p.${page}: ${String(e)}`);
    }
  }
  const noteLevelProps = looseBlocks.length > 0 ? mergeProperties(looseBlocks) : {};
  const mergedItems = blocks.length > 0
    ? blocks.map(b => ({ ...noteLevelProps, ...b }))
    : Object.keys(noteLevelProps).length > 0 ? [noteLevelProps] : [];

  return {
    items: mergedItems,
    savedQueries: parsedSavedQueries,
    savedTemplates: parsedSavedTemplates,
    blockCount: snqBlockCount,
    textBoxCount,
    elementCount,
    pageDiagnostics,
  };
}

export default function SNViewsPanel() {
  const [mode, setMode] = useState<Mode>('dashboard');
  const [daysText, setDaysText] = useState(DEFAULT_DAYS);
  const [dashboardText, setDashboardText] = useState(DEFAULT_QUERY);
  const [queryText, setQueryText] = useState(DEFAULT_QUERY);
  const [savedQueryName, setSavedQueryName] = useState('');
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>(DEFAULT_TEMPLATES);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [templateName, setTemplateName] = useState<string>('');
  const [matchMode, setMatchMode] = useState<MatchMode>('all');
  const [filters, setFilters] = useState<WhereFilter[]>(() => [newWhereFilter()]);
  const [titleText, setTitleText] = useState('');
  const [showText, setShowText] = useState(DEFAULT_SHOW);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ViewResult | null>(null);
  const [status, setStatus] = useState('');
  const [propertyText, setPropertyText] = useState(DEFAULT_PROPERTIES);
  const [lassoTextBox, setLassoTextBox] = useState<any | null>(null);
  const [handledLassoLaunch, setHandledLassoLaunch] = useState(false);

  const matchedRows = useMemo(
    () => result?.rows.filter(row => row.included) ?? [],
    [result],
  );
  const previewRows = useMemo(() => result?.rows ?? [], [result]);
  const parsedQuery = useMemo(() => parseDataviewQuery(queryText), [queryText]);
  const primaryFilter = useMemo(
    () => activeFilters([...(parsedQuery?.filters ?? []), ...filters])[0] ?? filters[0],
    [filters, parsedQuery],
  );
  const fallbackShowFields = useMemo(
    () => [
      ...(parsedQuery?.fields.map(field => field.key) ?? []),
      ...activeFilters([...(parsedQuery?.filters ?? []), ...filters]).map(filter => filter.key),
    ],
    [filters, parsedQuery],
  );
  const showFields = useMemo(
    () => fieldsFromInput(showText, fallbackShowFields),
    [showText, fallbackShowFields],
  );

  const clear = useCallback(() => {
    setDaysText(DEFAULT_DAYS);
    setDashboardText(DEFAULT_QUERY);
    setQueryText(DEFAULT_QUERY);
    setSavedQueryName('');
    setMatchMode('all');
    setFilters([newWhereFilter()]);
    setTitleText('');
    setShowText(DEFAULT_SHOW);
    setResult(null);
    setStatus('');
  }, []);

  useEffect(() => {
    const unsub = subscribeToButtonEvents(event => {
      if (event.id === BUTTON_ID_TOOLBAR) {
        clear();
      }
    });
    if (getLastButtonEvent()?.id !== BUTTON_ID_LASSO_TEXT) {
      clear();
    }
    return unsub;
  }, [clear]);

  const updateFilter = useCallback(
    (id: string, patch: Partial<Omit<WhereFilter, 'id'>>) => {
      setFilters(current =>
        current.map(filter =>
          filter.id === id ? {...filter, ...patch} : filter,
        ),
      );
    },
    [],
  );

  const addFilter = useCallback(() => {
    setFilters(current => [...current, newWhereFilter()]);
  }, []);

  const removeFilter = useCallback((id: string) => {
    setFilters(current => {
      const next = current.filter(filter => filter.id !== id);
      return next.length > 0 ? next : [newWhereFilter()];
    });
  }, []);

  const saveCurrentQuery = useCallback(() => {
    const name = savedQueryName.trim();
    const query = queryText.trim();
    if (!name) {
      setStatus('Name the query before saving.');
      return;
    }
    if (!query) {
      setStatus('Enter query text before saving.');
      return;
    }
    setSavedQueries(current => {
      const existing = current.find(item => item.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        return current.map(item =>
          item.id === existing.id ? {...item, name, query, title: titleText.trim()} : item,
        );
      }
      return [
        ...current,
        {id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, query, title: titleText.trim()},
      ];
    });
    setStatus(`Saved query: ${name}`);
  }, [queryText, savedQueryName, titleText]);

  const scanSavedData = useCallback(async () => {
    setBusy(true);
    setStatus('Scanning for saved queries & templates...');
    try {
      const pathRes = (await PluginCommAPI.getCurrentFilePath()) as any;
      let folder = '';
      if (pathRes?.success && typeof pathRes.result === 'string') {
        folder = dirname(pathRes.result);
      }
      if (!folder) {
        setStatus('Could not determine current folder.');
        setBusy(false);
        return;
      }
      const noteCandidates = await listNoteFilesInFolder(folder);
      const foundQueries: SavedQuery[] = [];
      const foundTemplates: SavedTemplate[] = [];
      const errs: string[] = [];
      for (const p of noteCandidates) {
         try {
            const res = (await withTimeout('getNoteTotalPageNum', PluginFileAPI.getNoteTotalPageNum(p) as Promise<any>)) as any;
            if (res?.success && typeof res.result === 'number') {
               const parsed = await readPropertiesFromNote(p, res.result, [], errs);
               if (parsed.savedQueries && parsed.savedQueries.length > 0) {
                 foundQueries.push(...parsed.savedQueries);
               }
               if (parsed.savedTemplates && parsed.savedTemplates.length > 0) {
                 foundTemplates.push(...parsed.savedTemplates);
               }
            }
         } catch (e) {
            // ignore
         }
      }
      let loadedQ = 0;
      let loadedT = 0;
      if (foundQueries.length > 0) {
        setSavedQueries(current => {
           const map = new Map(current.map(q => [q.name.toLowerCase(), q]));
           foundQueries.forEach(q => map.set(q.name.toLowerCase(), q));
           return Array.from(map.values());
        });
        loadedQ = foundQueries.length;
      }
      if (foundTemplates.length > 0) {
        setSavedTemplates(current => {
           const map = new Map(current.map(t => [t.name.toLowerCase(), t]));
           foundTemplates.forEach(t => map.set(t.name.toLowerCase(), t));
           return Array.from(map.values());
        });
        loadedT = foundTemplates.length;
      }
      setStatus(`Loaded ${loadedQ} queries, ${loadedT} templates.`);
    } catch (e) {
      setStatus(`Scan error: ${String(e)}`);
    }
    setBusy(false);
  }, []);

  const exportSavedData = useCallback(async () => {
    if (savedQueries.length === 0 && savedTemplates.length === 0) {
      setStatus('No saved data to export.');
      return;
    }
    setBusy(true);
    try {
      let textToInsert = '';
      for (const q of savedQueries) {
         textToInsert += `[SNQ-SAVED]\nname: ${q.name}\nquery: ${q.query}\n${q.title ? `title: ${q.title}\n` : ''}[/SNQ-SAVED]\n\n`;
      }
      for (const t of savedTemplates) {
         textToInsert += `[SNQ-TEMPLATE]\nname: ${t.name}\ntext: ${t.text}\n[/SNQ-TEMPLATE]\n\n`;
      }
      await PluginNoteAPI.insertText({
        textContentFull: textToInsert,
        textRect: {left: 100, top: 100, right: 900, bottom: 200},
        fontSize: 24,
        textBold: 0,
        textItalics: 0,
        textAlign: 0,
        textEditable: 1,
      } as any);
      setStatus('Saved data exported to this note.');
    } catch (e) {
      setStatus(`Export error: ${String(e)}`);
    }
    setBusy(false);
  }, [savedQueries, savedTemplates]);

  const loadSavedQuery = useCallback((item: SavedQuery) => {
    setSavedQueryName(item.name);
    setQueryText(item.query);
    setTitleText(item.title || '');
    setMode('advanced');
    setStatus(`Loaded query: ${item.name}`);
  }, []);

  const deleteSavedQuery = useCallback((id: string) => {
    setSavedQueries(current => current.filter(item => item.id !== id));
    setStatus('Deleted saved query.');
  }, []);

  const runPreview = useCallback(async (queryOverride?: string): Promise<ViewResult | null> => {
    if (busy) {
      return null;
    }
    const effectiveQueryText = queryOverride ?? queryText;
    const days = Math.max(1, Math.min(365, parseInt(daysText, 10) || 30));
    const parsed = parseDataviewQuery(effectiveQueryText);
    const terms = parsed ? parsed.sourceTerms : termsFromInput(effectiveQueryText);
    const queryFilters = parsed ? [...parsed.filters, ...filters] : filters;
    const whereFilters = activeFilters(queryFilters);
    const whereActive = whereFilters.length > 0;
    const queryFields = parsed?.fields.map(field => field.key) ?? [];
    const sortKeys = parsed?.sort ? [parsed.sort.key] : [];
    const whereKeys = uniqueStrings([
      ...whereFilters.map(filter => filter.key),
      ...queryFields,
      ...sortKeys,
    ]);
    const propertyActive =
      whereActive || queryFields.length > 0 || sortKeys.length > 0 || terms.length > 0;
    const queryDate =
      whereFilters
        .map(filter => dateTimeFromValue(filter.value))
        .find((value): value is number => typeof value === 'number') ?? null;
    clearElementCacheSafe();
    setBusy(true);
    setResult(null);
    setStatus('Scanning...');

    const started = Date.now();
    const errors: string[] = [];
    let folder = '(unknown)';
    let currentPath = '';
    let noteCandidates: string[] = [];

    try {
      const pathRes = (await PluginCommAPI.getCurrentFilePath()) as any;
      if (pathRes?.success && typeof pathRes.result === 'string') {
        currentPath = pathRes.result;
        folder = dirname(currentPath);
      } else {
        errors.push('Current file unavailable.');
      }
    } catch (e) {
      errors.push('Current file error: ' + String(e));
    }

    try {
      if (folder !== '(unknown)') {
        noteCandidates = await listNoteFilesInFolder(folder);
      }
    } catch (e) {
      errors.push('Folder scan error: ' + String(e));
    }
    noteCandidates = mergeCandidatePaths(noteCandidates, currentPath);

    const today = new Date();
    const cutoff = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - days + 1,
    );
    const scanEnd = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + (queryDate == null ? 0 : FUTURE_DATE_SCAN_DAYS),
    );
    const candidates = noteCandidates
      .map(path => ({path, date: parseNoteDate(path)}))
      .filter(item => item.date == null || (item.date >= cutoff && item.date <= scanEnd))
      .sort((a, b) => {
        if (a.date && b.date) {
          return queryDate == null
            ? b.date.getTime() - a.date.getTime()
            : Math.abs(a.date.getTime() - queryDate) -
              Math.abs(b.date.getTime() - queryDate);
        }
        if (a.date && !b.date) {
          return -1;
        }
        if (!a.date && b.date) {
          return 1;
        }
        return basename(a.path).localeCompare(basename(b.path));
      });

    const rows: ViewRow[] = [];
    const limited = candidates.slice(0, KEYWORD_SCAN_LIMIT);
    for (const item of limited) {
      const rowStarted = Date.now();
      const rowErrors: string[] = [];
      let pages = PAGE_SCAN_LIMIT;
      let keywordEntries: {keyword: string; page: number}[] = [];
      let items: Record<string, string>[] = [{}];
      let propertyBlockCount = 0;
      let textBoxCount = 0;
      let elementCount = 0;
      let pageDiagnostics: string[] = [];

      try {
        const totalRes = (await withTimeout(
          'getNoteTotalPageNum',
          PluginFileAPI.getNoteTotalPageNum(item.path),
        )) as any;
        if (totalRes?.success && typeof totalRes.result === 'number') {
          pages = Math.min(totalRes.result, PAGE_SCAN_LIMIT);
        }
      } catch (e) {
        rowErrors.push('Page count: ' + String(e));
      }

      const pageList = Array.from({length: pages}, (_, i) => i);
      try {
        const kwRes = (await withTimeout(
          'getKeyWords',
          PluginFileAPI.getKeyWords(item.path, pageList) as Promise<any>,
        )) as any;
        if (kwRes?.success && Array.isArray(kwRes.result)) {
          keywordEntries = kwRes.result.map((kw: any) => ({
            keyword: String(kw.keyword ?? ''),
            page: typeof kw.page === 'number' ? kw.page : 0,
          }));
        } else {
          rowErrors.push('Keywords unavailable.');
        }
      } catch (e) {
        rowErrors.push('Keywords: ' + String(e));
      }

      if (propertyActive) {
        const propertyResult = await readPropertiesFromNote(
          item.path,
          pages,
          whereKeys,
          rowErrors,
        );
        items = propertyResult.items.length > 0 ? propertyResult.items : [{}];
        propertyBlockCount = propertyResult.blockCount;
        textBoxCount = propertyResult.textBoxCount;
        elementCount = propertyResult.elementCount;
        pageDiagnostics = propertyResult.pageDiagnostics;
      }

      for (const properties of items) {
        const allKeywords = uniqueStrings([
          ...keywordEntries.map(kw => kw.keyword),
          ...propertyValuesForKeywords(properties),
        ]);
        const matchedKeywords =
          terms.length > 0
            ? allKeywords.filter(keyword => keywordMatches(keyword, terms))
            : allKeywords;
        const matchedPages = uniqueStrings(
          keywordEntries
            .filter(entry =>
              terms.length > 0
                ? keywordMatches(entry.keyword, terms)
                : Boolean(entry.keyword),
            )
            .map(entry => String(entry.page)),
        ).map(page => Number(page));
        const keywordPassed = terms.length === 0 || matchedKeywords.length > 0;
        const wherePassed = compareFilters(properties, queryFilters, matchMode);
        const included = keywordPassed && wherePassed;
        const whereLabel = whereLabelsFor(properties, queryFilters);

        if (included || rowErrors.length > 0 || propertyActive) {
          rows.push({
            path: item.path,
            name: basename(item.path),
            dateLabel: item.date ? formatDateLabel(item.date) : basename(item.path).replace(/\.note$/i, ''),
            included,
            keywordPassed,
            wherePassed,
            matchedKeywords,
            matchedPages,
            allKeywords,
            properties,
            propertyBlockCount,
            textBoxCount,
            elementCount,
            pageDiagnostics,
            whereLabel,
            elapsedMs: Date.now() - rowStarted,
            errors: rowErrors,
          });
        }
      }
    }

    const sortedRows = sortRows(rows, parsed?.sort ?? null);
    let includedCount = 0;
    const limit = parsed?.limit ?? null;
    const finalRows =
      limit == null
        ? sortedRows
        : sortedRows.map(row => {
            if (!row.included) {
              return row;
            }
            includedCount++;
            return includedCount <= limit ? row : {...row, included: false};
          });

    const nextResult: ViewResult = {
      folder,
      days,
      terms,
      candidateCount: noteCandidates.length,
      datedCount: candidates.length,
      scannedCount: limited.length,
      matchedCount: finalRows.filter(row => row.included).length,
      rows: finalRows,
      elapsedMs: Date.now() - started,
      errors,
    };
    setResult(nextResult);
    setStatus(
      `Found ${nextResult.matchedCount} match(es) in ${nextResult.elapsedMs} ms.`,
    );
    setBusy(false);
    return nextResult;
  }, [busy, daysText, queryText, filters, matchMode]);

  const runDashboardPreview = useCallback(
    () => runPreview(dashboardText),
    [dashboardText, runPreview],
  );

  const runAdvancedPreview = useCallback(
    () => runPreview(queryText),
    [queryText, runPreview],
  );

  const runSavedQuery = useCallback(
    async (item: SavedQuery) => {
      setSavedQueryName(item.name);
      setQueryText(item.query);
      setTitleText(item.title || '');
      setMode('advanced');
      await runPreview(item.query);
    },
    [runPreview],
  );

  const insertDashboard = useCallback(async (
    sourceResult?: ViewResult | null,
    anchorTop?: number,
  ) => {
    const activeResult = sourceResult ?? result;
    const activeRows = activeResult?.rows.filter(row => row.included) ?? [];
    if (busy || !activeResult || activeRows.length === 0) {
      return;
    }
    setBusy(true);
    setStatus('Inserting dashboard...');
    try {
      let pageWidth = 1404;
      let pageHeight = 1872;
      try {
        const pathRes = (await PluginCommAPI.getCurrentFilePath()) as any;
        const pageRes = (await PluginCommAPI.getCurrentPageNum()) as any;
        if (
          pathRes?.success &&
          pageRes?.success &&
          typeof pathRes.result === 'string' &&
          typeof pageRes.result === 'number'
        ) {
          const sizeRes = (await PluginFileAPI.getPageSize(
            pathRes.result,
            pageRes.result,
          )) as any;
          if (sizeRes?.success && sizeRes.result) {
            pageWidth = sizeRes.result.width ?? pageWidth;
            pageHeight = sizeRes.result.height ?? pageHeight;
          }
        }
      } catch {
        // keep defaults
      }

      const left = 140;
      const top = anchorTop ?? 150;
      const gap = 10;
      const availableWidth = Math.max(680, pageWidth - left * 2);
      const parsed = parseDataviewQuery(queryText);
      const tableMode = parsed?.kind === 'table';
      const fullWidth = Math.min(tableMode ? 1000 : 980, availableWidth);
      const columnCount = tableMode ? 1 : activeRows.length <= 6 ? 1 : 2;
      const colWidth =
        columnCount === 1 ? fullWidth : Math.floor((fullWidth - gap) / 2);
      const rowH = tableMode ? 48 : 58;
      const linkH = tableMode ? 42 : 48;
      const rowFontSize = tableMode ? 21 : 26;
      const primaryKey = primaryFilter?.key ?? '';
      const queryFilters = parsed ? [...parsed.filters, ...filters] : filters;
      const title =
        titleText.trim() ||
        savedQueryName.trim() ||
        (parsed
          ? `${parsed.kind === 'table' ? 'Table' : 'List'} view`
          : defaultDashboardTitle(filters, matchMode, String(activeResult.days)));
      const showFields =
        parsed?.kind === 'table'
          ? parsed.fields.map(field => field.key)
          : fieldsFromInput(showText, fallbackShowFields);
      const stats = statsForRows(activeRows, primaryKey);
      const criteria = [
        savedQueryName ? `Query Name: ${savedQueryName}` : '',
        `Range: last ${activeResult.days} days`,
        criteriaForFilters(queryFilters, matchMode),
        activeResult.terms.length > 0 ? `Keywords: ${activeResult.terms.join(', ')}` : '',
        parsed?.sort ? `Sort: ${parsed.sort.key} ${parsed.sort.direction.toUpperCase()}` : '',
        parsed?.limit ? `Limit: ${parsed.limit}` : '',
      ]
        .filter(Boolean)
        .join('   ');
      const headerH = parsed?.kind === 'table' ? 42 : 0;
      const rowsTop = top + 142 + headerH;
      const rowsPerCol = Math.ceil(activeRows.length / columnCount);
      const maxRowsPerCol = Math.max(1, Math.floor((pageHeight - rowsTop - 70) / rowH));
      const safeRowsPerCol = Math.min(rowsPerCol, maxRowsPerCol);
      const rowsToInsert = activeRows.slice(0, safeRowsPerCol * columnCount);

      await PluginNoteAPI.insertText({
        textContentFull: title,
        textRect: {left, top, right: left + fullWidth, bottom: top + 46},
        fontSize: 34,
        textBold: 1,
        textItalics: 0,
        textAlign: 0,
        textEditable: 1,
      } as any);
      await PluginNoteAPI.insertText({
        textContentFull: criteria,
        textRect: {left, top: top + 48, right: left + fullWidth, bottom: top + 84},
        fontSize: 18,
        textBold: 0,
        textItalics: 0,
        textAlign: 0,
        textEditable: 1,
      } as any);
      await PluginNoteAPI.insertText({
        textContentFull: stats,
        textRect: {left, top: top + 88, right: left + fullWidth, bottom: top + 126},
        fontSize: 24,
        textBold: 1,
        textItalics: 0,
        textAlign: 0,
        textEditable: 1,
      } as any);

      if (parsed?.kind === 'table') {
        for (const cell of tableColumnRects(
          parsed.fields,
          left,
          top + 130,
          fullWidth,
          38,
          6,
        )) {
          await PluginNoteAPI.insertText({
            textContentFull: cell.field.label,
            textRect: {left: cell.left, top: cell.top, right: cell.right, bottom: cell.bottom},
            fontSize: 20,
            textBold: 1,
            textItalics: 0,
            textAlign: 0,
            textEditable: 1,
          } as any);
        }
      }

      let inserted = 0;
      for (let i = 0; i < rowsToInsert.length; i++) {
        const row = rowsToInsert[i];
        const col = columnCount === 1 ? 0 : i < safeRowsPerCol ? 0 : 1;
        const rowInCol = columnCount === 1 || col === 0 ? i : i - safeRowsPerCol;
        const x = left + col * (colWidth + gap);
        const y = rowsTop + rowInCol * rowH;
        const destPage = row.matchedPages.find(page => Number.isFinite(page)) ?? 0;
        if (tableMode && parsed?.kind === 'table') {
          let rowInserted = false;
          let isFirstCol = true;
          for (const cell of tableColumnRects(parsed.fields, x, y, colWidth, linkH, 6)) {
            const value = valueForField(row, cell.field.key) || '-';
            const maxChars = Math.max(4, Math.floor((cell.right - cell.left - 12) / 10));
            const label = trimLabel(value, maxChars);
            
            if (isFirstCol) {
              const res = (await PluginNoteAPI.insertTextLink({
                category: 0,
                linkType: 0,
                destPath: row.path,
                destPage,
                style: 0,
                rect: {
                  left: cell.left,
                  top: cell.top,
                  right: cell.right,
                  bottom: cell.bottom,
                },
                fontSize: rowFontSize,
                fullText: label,
                showText: label,
                isItalic: 0,
              } as any)) as any;
              rowInserted = rowInserted || Boolean(res?.success);
            } else {
              const res = (await PluginNoteAPI.insertText({
                textContentFull: label,
                textRect: {
                  left: cell.left,
                  top: cell.top,
                  right: cell.right,
                  bottom: cell.bottom,
                },
                fontSize: rowFontSize,
                textBold: 0,
                textItalics: 0,
                textAlign: 0,
                textEditable: 0,
              } as any)) as any;
              rowInserted = rowInserted || Boolean(res?.success);
            }
            isFirstCol = false;
          }
          if (rowInserted) {
            inserted++;
          }
          continue;
        }
        const maxChars = tableMode
          ? Math.max(48, Math.floor((colWidth - 20) / 10))
          : Math.max(12, Math.floor((colWidth - 20) / 15));
        const label = trimLabel(rowLabelForQuery(row, parsed, showFields), maxChars);
        const res = (await PluginNoteAPI.insertTextLink({
          category: 0,
          linkType: 0,
          destPath: row.path,
          destPage,
          style: 0,
          rect: {left: x, top: y, right: x + colWidth, bottom: y + linkH},
          fontSize: rowFontSize,
          fullText: label,
          showText: label,
          isItalic: 0,
        } as any)) as any;
        if (res?.success) {
          inserted++;
        }
      }

      if (activeRows.length > rowsToInsert.length) {
        const y = rowsTop + 10 + safeRowsPerCol * rowH;
        await PluginNoteAPI.insertText({
          textContentFull: `${activeRows.length - rowsToInsert.length} more did not fit.`,
          textRect: {left, top: y, right: left + fullWidth, bottom: y + 44},
          fontSize: 24,
          textBold: 0,
          textItalics: 0,
          textAlign: 0,
          textEditable: 1,
        } as any);
      }

      try {
        await PluginNoteAPI.saveCurrentNote();
      } catch {
        // best-effort
      }
      clearElementCacheSafe();
      setStatus('Inserted dashboard successfully. Closing...');
      setTimeout(() => close(), 1000);
    } catch (e) {
      setStatus(`Insert error: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    result,
    matchedRows,
    primaryFilter,
    titleText,
    filters,
    matchMode,
    queryText,
    showText,
    fallbackShowFields,
    savedQueryName,
  ]);

  const insertQueryBlock = useCallback(async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setStatus('Inserting query block...');
    try {
      let pageWidth = 1404;
      try {
        const pathRes = (await PluginCommAPI.getCurrentFilePath()) as any;
        const pageRes = (await PluginCommAPI.getCurrentPageNum()) as any;
        if (
          pathRes?.success &&
          pageRes?.success &&
          typeof pathRes.result === 'string' &&
          typeof pageRes.result === 'number'
        ) {
          const sizeRes = (await PluginFileAPI.getPageSize(
            pathRes.result,
            pageRes.result,
          )) as any;
          if (sizeRes?.success && sizeRes.result) {
            pageWidth = sizeRes.result.width ?? pageWidth;
          }
        }
      } catch {
        // keep default
      }

      const text = normalizeQueryBlock(queryText || DEFAULT_QUERY_BLOCK);
      const left = 95;
      const top = 95;
      const right = Math.min(pageWidth - 95, left + 900);
      const lineCount = Math.max(5, text.split('\n').length);
      const bottom = top + 32 * lineCount + 30;
      const res = (await PluginNoteAPI.insertText({
        textContentFull: text,
        textRect: {left, top, right, bottom},
        fontSize: 22,
        textBold: 0,
        textItalics: 0,
        textAlign: 0,
        textEditable: 1,
      } as any)) as any;
      try {
        await PluginNoteAPI.saveCurrentNote();
      } catch {
        // best-effort
      }
      clearElementCacheSafe();
      if (res?.success) {
        setQueryText(extractQueryText(text));
        setStatus('Inserted query block.');
        PluginManager.closePluginView();
      } else {
        setStatus('Insert query block failed: ' + JSON.stringify(res?.error ?? res));
      }
    } catch (e) {
      setStatus('Insert query block failed: ' + String(e));
    } finally {
      setBusy(false);
    }
  }, [busy, queryText]);

  const readSelectedQueryText = useCallback(async (): Promise<string> => {
    const selected = await readSelectedTextAny();
    if (!selected.text) {
      setStatus('No selected text found. Select one query block and open SN Query from the selection toolbar.');
      return '';
    }
    const query = extractQueryText(selected.text);
    if (!query) {
      setStatus('Selected text did not contain a query.');
      return '';
    }
    return query;
  }, []);

  const loadSelectedQuery = useCallback(async () => {
    if (busy) {
      return '';
    }
    setBusy(true);
    setStatus('Reading selected query...');
    try {
      const query = await readSelectedQueryText();
      if (!query) {
        return '';
      }
      setQueryText(query);
      setMode('advanced');
      setStatus('Loaded selected query.');
      return query;
    } catch (e) {
      setStatus('Read selected query failed: ' + String(e));
      return '';
    } finally {
      setBusy(false);
    }
  }, [busy, readSelectedQueryText]);

  const runSelectedQuery = useCallback(async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setStatus('Reading selected query...');
    try {
      const query = await readSelectedQueryText();
      if (query) {
        setQueryText(query);
        setMode('advanced');
        await runPreview(query);
      }
    } catch (e) {
      setStatus('Run selected query failed: ' + String(e));
    } finally {
      setBusy(false);
    }
  }, [busy, readSelectedQueryText, runPreview]);

  useEffect(() => {
    const lastEvent = getLastButtonEvent();
    const isSelectionLaunch =
      lastEvent?.id === BUTTON_ID_LASSO_TEXT ||
      lastEvent?.id === BUTTON_ID_SELECTED_TEXT;
    if (handledLassoLaunch || !isSelectionLaunch) {
      return;
    }
    consumeLastButtonEvent();
    setHandledLassoLaunch(true);
    setMode('advanced');
    setStatus('Selected query ready. Tap Run selected query.');
  }, [handledLassoLaunch]);

  const insertProperties = useCallback(async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setStatus('Inserting properties...');
    try {
      let pageWidth = 1404;
      try {
        const pathRes = (await PluginCommAPI.getCurrentFilePath()) as any;
        const pageRes = (await PluginCommAPI.getCurrentPageNum()) as any;
        if (
          pathRes?.success &&
          pageRes?.success &&
          typeof pathRes.result === 'string' &&
          typeof pageRes.result === 'number'
        ) {
          const sizeRes = (await PluginFileAPI.getPageSize(
            pathRes.result,
            pageRes.result,
          )) as any;
          if (sizeRes?.success && sizeRes.result) {
            pageWidth = sizeRes.result.width ?? pageWidth;
          }
        }
      } catch {
        // keep default
      }

      const text = normalizePropertyBlock(propertyText);
      const left = 95;
      const top = 95;
      const right = Math.min(pageWidth - 95, left + 660);
      const lineCount = Math.max(4, text.split('\n').length);
      const bottom = top + 34 * lineCount + 30;
      const res = (await PluginNoteAPI.insertText({
        textContentFull: text,
        textRect: {left, top, right, bottom},
        fontSize: 24,
        textBold: 0,
        textItalics: 0,
        textAlign: 0,
        textEditable: 0,
      } as any)) as any;
      try {
        await PluginNoteAPI.saveCurrentNote();
      } catch {
        // best-effort
      }
      clearElementCacheSafe();
      if (res?.success) {
        setPropertyText(text);
        setStatus('Inserted properties block.');
        close();
      } else {
        setStatus('Insert properties failed: ' + JSON.stringify(res?.error ?? res));
      }
    } catch (e) {
      setStatus('Insert properties failed: ' + String(e));
    } finally {
      setBusy(false);
    }
  }, [busy, propertyText]);

  const loadSelectedProperties = useCallback(async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setStatus('Reading selected text...');
    try {
      const selected = await readSelectedTextAny();
      if (!selected.text) {
        setLassoTextBox(null);
        setStatus('No selected text found.');
        return;
      }
      setLassoTextBox(selected.box);
      setPropertyText(normalizePropertyBlock(selected.text));
      setStatus('Loaded selected text.');
    } catch (e) {
      setLassoTextBox(null);
      setStatus('Read selected text failed: ' + String(e));
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const updateSelectedProperties = useCallback(async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setStatus('Updating selected text...');
    try {
      const selected = lassoTextBox;
      if (!selected?.textRect) {
        setStatus('No loaded text block. Use Load selected first.');
        return;
      }
      const text = normalizePropertyBlock(propertyText);
      const lineCount = Math.max(4, text.split('\n').length);
      const currentRect = selected.textRect;
      const nextRect = {
        left: currentRect.left,
        top: currentRect.top,
        right: currentRect.right,
        bottom: Math.max(currentRect.bottom, currentRect.top + 34 * lineCount + 30),
      };
      const res = (await PluginNoteAPI.modifyLassoText({
        ...selected,
        textContentFull: text,
        textRect: nextRect,
        fontSize: selected.fontSize || 24,
        textBold: selected.textBold || 0,
        textItalics: selected.textItalics || 0,
        textAlign: selected.textAlign || 0,
        textEditable: selected.textEditable ?? 0,
      } as any)) as any;
      try {
        await PluginNoteAPI.saveCurrentNote();
      } catch {
        // best-effort
      }
      clearElementCacheSafe();
      if (res?.success) {
        setPropertyText(text);
        setLassoTextBox({...selected, textContentFull: text, textRect: nextRect});
        setStatus('Updated selected properties block.');
        close();
      } else {
        setStatus('Update selected failed: ' + JSON.stringify(res?.error ?? res));
      }
    } catch (e) {
      setStatus('Update selected failed: ' + String(e));
    } finally {
      setBusy(false);
    }
  }, [busy, lassoTextBox, propertyText]);

  const close = useCallback(() => {
    PluginManager.closePluginView();
  }, []);

  return (
    <View style={styles.overlay}>
      <View style={styles.panel}>
        <View style={styles.header}>
          <Text style={styles.title}>SN Query</Text>
          <Pressable onPress={close} style={styles.closeBtn}>
            <Text style={styles.closeText}>x</Text>
          </Pressable>
        </View>

        <KeyboardAvoidingView
          style={styles.body}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled">
            <View style={styles.modeRow}>
              <ModeButton
                label="Dashboard"
                active={mode === 'dashboard'}
                onPress={() => setMode('dashboard')}
              />
              <ModeButton
                label="Add Items"
                active={mode === 'addItems'}
                onPress={() => setMode('addItems')}
              />
              <ModeButton
                label="Saved"
                active={mode === 'saved'}
                onPress={() => setMode('saved')}
              />
              <ModeButton
                label="Advanced"
                active={mode === 'advanced'}
                onPress={() => setMode('advanced')}
              />
            </View>

            {status ? <Text style={styles.status}>{status}</Text> : null}

            {mode === 'dashboard' ? (
              <>
                <Text style={styles.sectionTitle}>Dashboard</Text>
                <Text style={styles.label}>Dashboard title</Text>
                <TextInput
                  value={titleText}
                  onChangeText={setTitleText}
                  style={styles.input}
                  autoCapitalize="sentences"
                  autoCorrect={false}
                  placeholder={
                    defaultDashboardTitle(filters, matchMode, daysText)
                  }
                />

                <Text style={styles.label}>Display fields</Text>
                <TextInput
                  value={showText}
                  onChangeText={setShowText}
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="blank uses date + filter fields"
                />

                <Text style={styles.label}>Days back</Text>
                <TextInput
                  value={daysText}
                  onChangeText={setDaysText}
                  style={styles.input}
                  keyboardType="number-pad"
                  placeholder={FALLBACK_DAYS}
                />

                <Text style={styles.label}>Keywords or tags</Text>
                <TextInput
                  value={dashboardText}
                  onChangeText={setDashboardText}
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="#acc201"
                />

              {filters.length > 1 ? (
                <>
                  <Text style={styles.sectionTitle}>Filter Matching</Text>
                  <View style={styles.matchRow}>
                    <OperatorButton
                      label="Match all filters"
                      active={matchMode === 'all'}
                      onPress={() => setMatchMode('all')}
                    />
                    <OperatorButton
                      label="Match any filter"
                      active={matchMode === 'any'}
                      onPress={() => setMatchMode('any')}
                    />
                  </View>
                </>
              ) : null}

              {filters.map((filter, index) => (
                <View key={filter.id} style={styles.filterBlock}>
                  <View style={styles.filterHeader}>
                    <Text style={styles.filterTitle}>Filter {index + 1}</Text>
                    {filters.length > 1 ? (
                      <ActionButton
                        label="Remove"
                        onPress={() => removeFilter(filter.id)}
                        quiet
                      />
                    ) : null}
                  </View>
                  <Text style={styles.label}>Property</Text>
                  <TextInput
                    value={filter.key}
                    onChangeText={value => updateFilter(filter.id, {key: value})}
                    style={styles.input}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="due"
                  />
                  <View style={styles.operatorRow}>
                    {(['<', '<=', '=', '!=', '>=', '>', 'contains'] as WhereOperator[]).map(op => (
                      <OperatorButton
                        key={op}
                        label={op}
                        active={filter.op === op}
                        onPress={() => updateFilter(filter.id, {op})}
                      />
                    ))}
                  </View>
                  <Text style={styles.label}>Value</Text>
                  <TextInput
                    value={filter.value}
                    onChangeText={value => updateFilter(filter.id, {value})}
                    style={styles.input}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder={filter.key.trim().toLowerCase() === 'due' ? '2026-06-16' : 'done'}
                  />
                </View>
              ))}

              <View style={styles.buttonRow}>
                <ActionButton label="Add filter" onPress={addFilter} quiet />
              </View>

              <View style={styles.buttonRow}>
                <ActionButton label={busy ? 'Working...' : 'Preview'} onPress={runDashboardPreview} />
                <ActionButton label="Insert" onPress={() => insertDashboard()} />
                <ActionButton label="Clear" onPress={clear} quiet />
              </View>

              {result && (
                <ResultsPreview
                  result={result}
                  parsedQuery={parsedQuery}
                  previewRows={previewRows}
                  showFields={showFields}
                />
              )}
              </>
            ) : mode === 'addItems' ? (
              <>
                <Text style={styles.sectionTitle}>Add Items</Text>
                {savedTemplates.length > 0 && (
                  <>
                    <Text style={styles.label}>Load Template</Text>
                    <ScrollView horizontal style={{ marginBottom: 16 }}>
                      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16 }}>
                        {savedTemplates.map(t => (
                          <ActionButton 
                            key={t.id} 
                            label={t.name} 
                            onPress={() => {
                               setSelectedTemplateId(t.id);
                               setTemplateName(t.name);
                               setPropertyText(t.text);
                            }} 
                            quiet={t.id !== selectedTemplateId}
                          />
                        ))}
                      </View>
                    </ScrollView>
                  </>
                )}

                <Text style={styles.label}>Item Properties</Text>
                <TextInput
                  value={propertyText}
                  onChangeText={setPropertyText}
                  style={[styles.input, styles.propertiesInput]}
                  autoCapitalize="none"
                  autoCorrect={false}
                  multiline
                  textAlignVertical="top"
                />
                <View style={styles.buttonRow}>
                  <ActionButton label="Insert item block" onPress={insertProperties} />
                  <ActionButton label="Load selected" onPress={loadSelectedProperties} quiet />
                  <ActionButton label="Update selected" onPress={updateSelectedProperties} quiet />
                </View>
                <View style={[{ flexDirection: 'row', gap: 8, marginTop: 16 }]}>
                  <TextInput
                    value={templateName}
                    onChangeText={setTemplateName}
                    placeholder="New template name..."
                    style={[styles.input, { flex: 1, height: 44, marginVertical: 0 }]}
                    autoCapitalize="none"
                  />
                  <ActionButton label="Save as Template" onPress={() => {
                     const name = templateName.trim();
                     if (!name) { setStatus('Enter template name'); return; }
                     setSavedTemplates(cur => {
                        const filtered = cur.filter(t => t.name.toLowerCase() !== name.toLowerCase());
                        return [...filtered, {
                           id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                           name,
                           text: propertyText.trim()
                        }];
                     });
                     setStatus(`Saved template: ${name}`);
                  }} quiet />
                </View>
              </>
            ) : mode === 'saved' ? (
              <>
                <Text style={styles.sectionTitle}>Saved Queries</Text>
                {savedQueries.length === 0 ? (
                  <Text style={styles.status}>
                    No saved queries yet. Create one in Advanced.
                  </Text>
                ) : null}
                <View style={styles.results}>
                  {savedQueries.map(item => (
                    <View key={item.id} style={styles.resultRow}>
                      <Text style={styles.resultTitle}>{item.name}</Text>
                      <Text style={styles.resultMeta}>{previewText(item.query, 120)}</Text>
                      <View style={styles.buttonRow}>
                        <ActionButton label="Run" onPress={() => runSavedQuery(item)} />
                        <ActionButton label="Edit" onPress={() => loadSavedQuery(item)} quiet />
                        <ActionButton label="Delete" onPress={() => deleteSavedQuery(item.id)} quiet />
                      </View>
                    </View>
                  ))}
                </View>
                <View style={styles.buttonRow}>
                  <ActionButton label="New query" onPress={() => setMode('advanced')} />
                  <ActionButton label={busy ? 'Scanning...' : 'Scan Notes'} onPress={scanSavedData} />
                  <ActionButton label="Export to Note" onPress={exportSavedData} />
                </View>
              </>
            ) : (
              <>
                <Text style={styles.sectionTitle}>Advanced Query</Text>
                <Text style={styles.label}>Dashboard title</Text>
                <TextInput
                  value={titleText}
                  onChangeText={setTitleText}
                  style={styles.input}
                  autoCapitalize="sentences"
                  autoCorrect={false}
                  placeholder={
                    queryText.trim().toLowerCase().startsWith('table')
                      ? 'Table view'
                      : 'List view'
                  }
                />
                <Text style={styles.label}>Query name</Text>
                <TextInput
                  value={savedQueryName}
                  onChangeText={setSavedQueryName}
                  style={styles.input}
                  autoCapitalize="sentences"
                  autoCorrect={false}
                  placeholder="ACC201 Assignments"
                />
                <Text style={styles.label}>Query text</Text>
                <TextInput
                  value={queryText}
                  onChangeText={setQueryText}
                  style={[styles.input, styles.queryInput]}
                  autoCapitalize="none"
                  autoCorrect={false}
                  multiline
                  textAlignVertical="top"
                  placeholder={'TABLE rating AS "Rating", summary AS "Summary" FROM #games SORT rating DESC'}
                />

                <View style={styles.buttonRow}>
                  <ActionButton label={busy ? 'Working...' : 'Preview'} onPress={runAdvancedPreview} />
                  <ActionButton label="Save query" onPress={saveCurrentQuery} />
                  <ActionButton label="Insert" onPress={() => insertDashboard()} />
                  <ActionButton label="Clear" onPress={clear} quiet />
                </View>

                <View style={styles.buttonRow}>
                  <ActionButton label="Insert query block" onPress={insertQueryBlock} quiet />
                  <ActionButton label="Load selected query" onPress={loadSelectedQuery} quiet />
                  <ActionButton label="Load & Run Selected Query" onPress={runSelectedQuery} quiet />
                </View>

                {result && (
                  <ResultsPreview
                    result={result}
                    parsedQuery={parsedQuery}
                    previewRows={previewRows}
                    showFields={showFields}
                  />
                )}
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  quiet,
}: {
  label: string;
  onPress: () => void;
  quiet?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({pressed}) => [
        styles.actionBtn,
        quiet && styles.actionBtnQuiet,
        pressed && styles.actionBtnPressed,
      ]}>
      <Text style={[styles.actionText, quiet && styles.actionTextQuiet]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ModeButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.modeBtn, active && styles.modeBtnActive]}>
      <Text style={[styles.modeText, active && styles.modeTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function OperatorButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.operatorBtn, active && styles.operatorBtnActive]}>
      <Text style={[styles.operatorText, active && styles.operatorTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function SummaryRow({label, value}: {label: string; value: string}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}:</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function ResultsPreview({
  result,
  parsedQuery,
  previewRows,
  showFields,
}: {
  result: ViewResult;
  parsedQuery: ParsedQuery | null;
  previewRows: ViewRow[];
  showFields: string[];
}) {
  return (
    <>
      <View style={styles.summary}>
        <SummaryRow label="Folder" value={basename(result.folder)} />
        <SummaryRow label="Found" value={String(result.datedCount)} />
        <SummaryRow label="Scanned" value={String(result.scannedCount)} />
        <SummaryRow label="Matched" value={String(result.matchedCount)} />
      </View>

      {result.errors.map((err, i) => (
        <Text key={i} style={styles.errorText}>
          {err}
        </Text>
      ))}

      <View style={styles.results}>
        {parsedQuery?.kind === 'table' ? (
          <View style={{ flexDirection: 'column' }}>
            <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: '#ccc', paddingBottom: 4, marginBottom: 8 }}>
              {parsedQuery.fields.map((f, i) => (
                <Text key={i} style={{ flex: 1, fontWeight: 'bold', fontSize: 16, color: '#333' }}>
                  {f.label}
                </Text>
              ))}
            </View>
            {previewRows.filter(r => r.included).map(row => (
              <View key={row.path} style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderColor: '#eee' }}>
                {parsedQuery.fields.map((f, i) => (
                  <Text key={i} style={{ flex: 1, fontSize: 16, color: '#444', paddingRight: 4 }} numberOfLines={2}>
                    {valueForField(row, f.key) || '-'}
                  </Text>
                ))}
              </View>
            ))}
            {previewRows.filter(r => !r.included).length > 0 && (
              <Text style={[styles.resultMeta, { marginTop: 8 }]}>
                {previewRows.filter(r => !r.included).length} skipped rows hidden.
              </Text>
            )}
          </View>
        ) : (
          <View style={{ flexDirection: 'column' }}>
            {previewRows.filter(r => r.included).map(row => {
              const maxChars = 40;
              const label = trimLabel(rowLabelForQuery(row, parsedQuery, showFields) || row.whereLabel || row.matchedKeywords.join(', '), maxChars);
              return (
                <View key={row.path} style={{ flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 1, borderColor: '#eee' }}>
                  <Text style={{ fontSize: 16, color: '#0066cc', textDecorationLine: 'underline' }}>{label}</Text>
                </View>
              );
            })}
            {previewRows.filter(r => !r.included).length > 0 && (
              <Text style={[styles.resultMeta, { marginTop: 8 }]}>
                {previewRows.filter(r => !r.included).length} skipped rows hidden.
              </Text>
            )}
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  panel: {
    flex: 1,
    alignSelf: 'stretch',
    backgroundColor: '#FFFFFF',
  },
  header: {
    minHeight: 62,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {fontSize: 24, fontWeight: '700', color: '#000000'},
  closeBtn: {
    position: 'absolute',
    right: 20,
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.5,
    borderColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {fontSize: 20, fontWeight: '700', color: '#000000'},
  body: {flex: 1},
  scroll: {flex: 1},
  scrollContent: {padding: 22, paddingBottom: 380, gap: 12},
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 6,
  },
  modeBtn: {
    width: '50%',
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  modeBtnActive: {backgroundColor: '#000000'},
  modeText: {fontSize: 16, fontWeight: '700', color: '#000000'},
  modeTextActive: {color: '#FFFFFF'},
  sectionTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#000000',
    marginTop: 4,
    marginBottom: 2,
  },
  label: {fontSize: 15, fontWeight: '600', color: '#333333'},
  input: {
    minHeight: 54,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 17,
    color: '#000000',
    backgroundColor: '#FFFFFF',
  },
  queryInput: {
    minHeight: 116,
    lineHeight: 23,
  },
  buttonRow: {flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginTop: 8},
  matchRow: {flexDirection: 'row', gap: 10, flexWrap: 'wrap'},
  filterBlock: {
    borderTopWidth: 1,
    borderTopColor: '#DDDDDD',
    paddingTop: 12,
    gap: 10,
  },
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  filterTitle: {fontSize: 16, fontWeight: '700', color: '#000000'},
  operatorRow: {flexDirection: 'row', gap: 10, flexWrap: 'wrap'},
  operatorBtn: {
    minWidth: 68,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  operatorBtnActive: {backgroundColor: '#000000'},
  operatorText: {fontSize: 16, fontWeight: '700', color: '#000000'},
  operatorTextActive: {color: '#FFFFFF'},
  actionBtn: {
    backgroundColor: '#000000',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#000000',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  actionBtnQuiet: {backgroundColor: '#FFFFFF'},
  actionBtnPressed: {backgroundColor: '#DDDDDD'},
  actionText: {fontSize: 16, fontWeight: '700', color: '#FFFFFF'},
  actionTextQuiet: {color: '#000000'},
  status: {fontSize: 15, color: '#333333'},
  summary: {
    borderTopWidth: 1,
    borderTopColor: '#DDDDDD',
    paddingTop: 8,
    gap: 3,
  },
  summaryRow: {flexDirection: 'row', gap: 10},
  summaryLabel: {width: 80, fontSize: 13, color: '#777777'},
  summaryValue: {flex: 1, fontSize: 13, color: '#000000'},
  errorText: {fontSize: 12, color: '#AA0000'},
  results: {gap: 8, marginTop: 4},
  resultRow: {
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingTop: 8,
  },
  resultRowSkipped: {opacity: 0.62},
  resultTitle: {fontSize: 16, fontWeight: '700', color: '#000000'},
  resultMeta: {fontSize: 14, color: '#333333'},
  resultTiny: {fontSize: 12, color: '#555555'},
  divider: {height: 1, backgroundColor: '#CCCCCC', marginVertical: 8},
  propertiesInput: {
    minHeight: 360,
    fontSize: 16,
    lineHeight: 23,
  },
});
