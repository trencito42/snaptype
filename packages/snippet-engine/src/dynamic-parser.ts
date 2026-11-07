import { DynamicFormField } from '@snaptype/shared';
import { formatDateTime } from './date-formatter.js';
import { SafeFormulaEvaluator } from './formula-evaluator.js';

export interface RenderContext {
  variables?: Record<string, any>;
  clipboardText?: string;
  selectedText?: string;
  siteContext?: {
    hostname?: string;
    url?: string;
  };
  snippetResolver?: (shortcut: string) => string | null;
  tableResolver?: (tableName: string, lookupKey: string, lookupVal: any, targetCol: string) => string | null;
  currentDate?: Date;
  depth?: number;
  preserveUnresolvedVariables?: boolean;
  strictVariables?: boolean;
}

export interface RenderResult {
  text: string;
  cursorOffset: number; // -1 if not specified
  errors?: string[];
  warnings?: string[];
}

const formulaEvaluator = new SafeFormulaEvaluator();
const MAX_INCLUDE_DEPTH = 5;

/**
 * Parses pipe-separated attributes like `label="My Label"|default="Hello"|options="A,B,C"`
 */
function parseAttributes(rawParams: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (!rawParams) return attrs;

  const parts = rawParams.split('|');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim().toLowerCase();
      let val = trimmed.slice(eqIdx + 1).trim();
      // Remove surrounding quotes if present
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      attrs[key] = val;
    } else {
      // Positional attribute (e.g. format string or default)
      if (!attrs['default']) {
        attrs['default'] = trimmed;
      }
    }
  }
  return attrs;
}

/**
 * Extract dynamic interactive fields that require user input before snippet insertion.
 * Supports both unified `{{form:name|type=...}}` and legacy `{{input:name}}`, `{{paragraph:name}}`, etc.
 */
export function extractFormFields(template: string): DynamicFormField[] {
  const fields: Map<string, DynamicFormField> = new Map();
  if (!template) return [];

  // Match {{type:name ...}}
  const tagRegex = /\{\{\s*(input|paragraph|dropdown|toggle|datepicker|date_field|form):([a-zA-Z0-9_]+)(.*?)\}\}/gi;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(template)) !== null) {
    const rawType = match[1].toLowerCase();
    const name = match[2];
    const rawAttrs = match[3] || '';
    const attrs = parseAttributes(rawAttrs);

    if (fields.has(name)) {
      continue;
    }

    let type: DynamicFormField['type'] = 'text';
    if (rawType === 'form') {
      const formType = (attrs['type'] || '').toLowerCase();
      if (formType === 'paragraph' || formType === 'textarea') type = 'paragraph';
      else if (formType === 'dropdown' || formType === 'select' || attrs['options']) type = 'dropdown';
      else if (formType === 'toggle' || formType === 'checkbox') type = 'toggle';
      else if (formType === 'date' || formType === 'datepicker') type = 'date';
      else type = 'text';
    } else if (rawType === 'paragraph') {
      type = 'paragraph';
    } else if (rawType === 'dropdown') {
      type = 'dropdown';
    } else if (rawType === 'toggle') {
      type = 'toggle';
    } else if (rawType === 'datepicker' || rawType === 'date_field') {
      type = 'date';
    }

    let options: string[] | undefined;
    if (type === 'dropdown') {
      const optsStr = attrs['options'] || attrs['values'] || '';
      options = optsStr.split(',').map((o) => o.trim()).filter(Boolean);
    }

    let defaultValue: string | boolean | undefined = attrs['default'];
    if (type === 'toggle') {
      defaultValue = attrs['default'] === 'true' || attrs['default'] === '1';
    }

    fields.set(name, {
      name,
      type,
      label: attrs['label'] || name.replace(/_/g, ' '),
      defaultValue,
      options,
      required: attrs['required'] === 'true'
    });
  }

  return Array.from(fields.values());
}

/**
 * Validates a snippet template against the unified command grammar.
 */
export function validateSnippetTemplate(template: string): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!template) return { valid: true, errors, warnings };

  // 1. Check matching block directives
  const repeatOpens = (template.match(/\{\{#repeat\s+/g) || []).length;
  const repeatCloses = (template.match(/\{\{\/repeat\}\}/g) || []).length;
  if (repeatOpens !== repeatCloses) {
    errors.push(`Mismatched repeat blocks: ${repeatOpens} open directive(s), ${repeatCloses} close directive(s).`);
  }

  const ifOpens = (template.match(/\{\{#if\s+/g) || []).length;
  const ifCloses = (template.match(/\{\{\/if\}\}/g) || []).length;
  if (ifOpens !== ifCloses) {
    errors.push(`Mismatched if blocks: ${ifOpens} open directive(s), ${ifCloses} close directive(s).`);
  }

  // 2. Validate inline tags
  const inlineRegex = /\{\{([^}]+)\}\}/g;
  let match;
  while ((match = inlineRegex.exec(template)) !== null) {
    const raw = match[1].trim();
    if (raw.startsWith('#') || raw.startsWith('/')) continue; // Handled by block checks

    const lower = raw.toLowerCase();
    const isKnown =
      lower === 'cursor' ||
      lower === 'clipboard' ||
      lower === 'selection' ||
      lower === 'selected_text' ||
      lower === 'selectedtext' ||
      lower.startsWith('note:') ||
      lower.startsWith('//') ||
      lower.startsWith('site:') ||
      lower.startsWith('url:') ||
      lower.startsWith('set:') ||
      lower.startsWith('formula:') ||
      lower.startsWith('calc:') ||
      lower.startsWith('date') ||
      lower.startsWith('time') ||
      lower.startsWith('snippet:') ||
      lower.startsWith('include:') ||
      lower.startsWith('table:') ||
      /^(form|input|paragraph|dropdown|toggle|datepicker|date_field):/i.test(lower) ||
      /^[a-zA-Z0-9_]+$/.test(raw);

    if (!isKnown) {
      warnings.push(`Unrecognized or non-standard command: {{${raw}}}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Render dynamic snippet template into final plain text with cursor location calculation.
 * Never silently deletes unresolved commands or missing lookups without visible diagnostic reporting.
 */
export function renderSnippet(template: string, context: RenderContext = {}): RenderResult {
  if (!template) {
    return { text: '', cursorOffset: -1, errors: [], warnings: [] };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  const depth = context.depth || 0;
  if (depth > MAX_INCLUDE_DEPTH) {
    const msg = '[Circular or excessive nested snippet]';
    return { text: msg, cursorOffset: -1, errors: [msg] };
  }

  const vars: Record<string, any> = { ...(context.variables || {}) };
  const now = context.currentDate || new Date();
  let cursorOffset = -1;

  // 1. Process block directives first: {{#repeat n}}...{{/repeat}} and {{#if cond}}...{{else}}...{{/if}}
  let processed = processBlocks(template, vars, context);

  // 2. Tokenize and replace inline tags
  const inlineRegex = /\{\{([^}]+)\}\}/g;

  const result = processed.replace(inlineRegex, (_match, content: string) => {
    const raw = content.trim();

    // Cursor tag
    if (raw.toLowerCase() === 'cursor') {
      return '__SNAPTYPE_CURSOR_MARKER__';
    }

    // Notes: remove completely (intended internal agent guidance)
    if (raw.toLowerCase().startsWith('note:') || raw.toLowerCase().startsWith('//')) {
      return '';
    }

    // Clipboard
    if (raw.toLowerCase() === 'clipboard') {
      return context.clipboardText !== undefined ? context.clipboardText : '';
    }

    // Selected text (supports selection, selected_text, selectedText)
    if (
      raw.toLowerCase() === 'selection' ||
      raw.toLowerCase() === 'selected_text' ||
      raw.toLowerCase() === 'selectedtext'
    ) {
      return context.selectedText !== undefined ? context.selectedText : '';
    }

    // Site / Website Context
    if (raw.toLowerCase().startsWith('site:') || raw.toLowerCase().startsWith('url:')) {
      const key = raw.slice(raw.indexOf(':') + 1).trim().toLowerCase();
      if (key === 'hostname') return context.siteContext?.hostname || '';
      if (key === 'url') return context.siteContext?.url || '';
      return '';
    }

    // Variable assignment: {{set:name=val}}
    if (raw.toLowerCase().startsWith('set:')) {
      const expr = raw.slice(4).trim();
      const eq = expr.indexOf('=');
      if (eq !== -1) {
        const k = expr.slice(0, eq).trim();
        const v = expr.slice(eq + 1).trim();
        vars[k] = formulaEvaluator.evaluate(v, vars) ?? v;
      }
      return '';
    }

    // Safe Formula / Calculation: {{formula: expr}} or {{calc: expr}}
    if (raw.toLowerCase().startsWith('formula:') || raw.toLowerCase().startsWith('calc:')) {
      const expr = raw.slice(raw.indexOf(':') + 1).trim();
      try {
        const evaluated = formulaEvaluator.evaluate(expr, vars);
        return evaluated !== undefined && evaluated !== null ? String(evaluated) : '';
      } catch (e: any) {
        const errMsg = `[Calc Error: ${e.message || expr}]`;
        errors.push(errMsg);
        return errMsg;
      }
    }

    // Date / Time tags (including advertised {{datetime}})
    if (raw.toLowerCase().startsWith('date') || raw.toLowerCase().startsWith('time')) {
      return handleDateTag(raw, now);
    }

    // Included snippet: {{snippet:shortcut}} or {{include:shortcut}}
    if (raw.toLowerCase().startsWith('snippet:') || raw.toLowerCase().startsWith('include:')) {
      const shortcut = raw.slice(raw.indexOf(':') + 1).trim();
      if (context.snippetResolver) {
        const includedContent = context.snippetResolver(shortcut);
        if (includedContent !== null && includedContent !== undefined) {
          const nested = renderSnippet(includedContent, {
            ...context,
            variables: vars,
            depth: depth + 1
          });
          if (nested.errors && nested.errors.length > 0) {
            errors.push(...nested.errors);
          }
          return nested.text;
        }
        const notFound = `[Include Error: snippet '${shortcut}' not found]`;
        errors.push(notFound);
        return notFound;
      }
      const noResolver = `[Include Error: resolver unavailable for '${shortcut}']`;
      errors.push(noResolver);
      return noResolver;
    }

    // Table lookup: {{table:tableName|lookup=key|value=val|column=targetCol}}
    if (raw.toLowerCase().startsWith('table:')) {
      const rest = raw.slice(6).trim();
      const pipeIdx = rest.indexOf('|');
      const tableName = (pipeIdx !== -1 ? rest.slice(0, pipeIdx) : rest).trim();
      const rawAttrs = pipeIdx !== -1 ? rest.slice(pipeIdx + 1) : '';
      const attrs = parseAttributes(rawAttrs);

      const lookupKey = attrs['lookup'] || attrs['key'] || '';
      let lookupVal = attrs['value'] || attrs['val'] || '';
      if (lookupVal && Object.prototype.hasOwnProperty.call(vars, lookupVal)) {
        lookupVal = vars[lookupVal];
      }
      const targetCol = attrs['column'] || attrs['col'] || '';

      if (context.tableResolver && tableName && lookupKey && targetCol) {
        const val = context.tableResolver(tableName, lookupKey, lookupVal, targetCol);
        if (val !== null && val !== undefined) return String(val);
      }
      if (attrs['default'] !== undefined) {
        return attrs['default'];
      }
      if (!context.tableResolver) {
        const err = `[Table Error: resolver unavailable for table '${tableName}']`;
        errors.push(err);
        return err;
      }
      const err = `[Table Error: row not found in '${tableName}' for ${lookupKey}='${lookupVal}']`;
      errors.push(err);
      return err;
    }

    // Interactive field tags: {{form:name...}}, {{input:name...}}, {{paragraph:name...}}, etc.
    const fieldMatch = raw.match(/^(input|paragraph|dropdown|toggle|datepicker|date_field|form):([a-zA-Z0-9_]+)(.*)$/i);
    if (fieldMatch) {
      const name = fieldMatch[2];
      const rawAttrs = fieldMatch[3] || '';
      const attrs = parseAttributes(rawAttrs);

      if (Object.prototype.hasOwnProperty.call(vars, name)) {
        return String(vars[name] ?? '');
      }
      if (attrs['default'] !== undefined) {
        return attrs['default'];
      }
      // If variable not filled in form, preserve or show indicator rather than silent deletion
      return `[Unfilled: ${name}]`;
    }

    // Plain variable interpolation: {{variableName}}
    if (Object.prototype.hasOwnProperty.call(vars, raw)) {
      return String(vars[raw] ?? '');
    }

    // Variable identifier without value provided
    if (/^[a-zA-Z0-9_]+$/.test(raw)) {
      if (context.preserveUnresolvedVariables) {
        return `{{${raw}}}`;
      }
      warnings.push(`Unresolved variable: {{${raw}}}`);
      if (context.strictVariables) {
        return `[Unresolved: ${raw}]`;
      }
      return '';
    }

    const unrec = `[Unrecognized command: {{${raw}}}]`;
    errors.push(unrec);
    return unrec;
  });

  // Calculate cursor marker position and strip it
  const markerIndex = result.indexOf('__SNAPTYPE_CURSOR_MARKER__');
  let finalText = result;
  if (markerIndex !== -1) {
    cursorOffset = markerIndex;
    finalText = result.replace('__SNAPTYPE_CURSOR_MARKER__', '');
  }

  return {
    text: finalText,
    cursorOffset,
    errors,
    warnings
  };
}

function handleDateTag(raw: string, now: Date): string {
  const colonIdx = raw.indexOf(':');
  if (colonIdx === -1) {
    const tag = raw.toLowerCase().trim();
    if (tag === 'datetime') {
      return now.toISOString();
    }
    if (tag === 'time') {
      return formatDateTime(now, { format: 'HH:mm' });
    }
    return formatDateTime(now, { format: 'YYYY-MM-DD' });
  }

  const isTime = raw.toLowerCase().startsWith('time');
  const rest = raw.slice(colonIdx + 1).trim();
  const attrs = parseAttributes(rest);

  let format = attrs['format'] || (isTime ? 'HH:mm' : 'YYYY-MM-DD');
  let offset = attrs['offset'] || '';

  if (attrs['default'] && !attrs['format']) {
    if (
      attrs['default'].startsWith('+') ||
      attrs['default'].startsWith('-') ||
      attrs['default'] === 'tomorrow' ||
      attrs['default'] === 'yesterday'
    ) {
      offset = attrs['default'];
    } else {
      format = attrs['default'];
    }
  }

  return formatDateTime(now, {
    format,
    offset,
    timezone: attrs['timezone'] || attrs['tz'],
    locale: attrs['locale']
  });
}

function processBlocks(template: string, vars: Record<string, any>, context: RenderContext): string {
  let result = template;

  // Process {{#repeat count}}...{{/repeat}}
  const repeatRegex = /\{\{#repeat\s+([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/repeat\}\}/g;
  result = result.replace(repeatRegex, (_match, countExpr: string, body: string) => {
    let count = 0;
    if (/^\d+$/.test(countExpr)) {
      count = parseInt(countExpr, 10);
    } else if (Object.prototype.hasOwnProperty.call(vars, countExpr)) {
      count = parseInt(String(vars[countExpr]), 10) || 0;
    }

    count = Math.min(Math.max(count, 0), 100);
    let output = '';
    for (let i = 0; i < count; i++) {
      output += body;
    }
    return output;
  });

  // Process {{#if cond}}...{{else}}...{{/if}} or {{#if cond}}...{{/if}}
  const ifRegex = /\{\{#if\s+([^\}]+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g;
  result = result.replace(ifRegex, (_match, condition: string, truthyBranch: string, falsyBranch: string = '') => {
    const isTrue = evaluateCondition(condition.trim(), vars);
    return isTrue ? truthyBranch : falsyBranch;
  });

  return result;
}

function evaluateCondition(cond: string, vars: Record<string, any>): boolean {
  try {
    const val = formulaEvaluator.evaluate(cond, vars);
    return Boolean(val);
  } catch {
    return false;
  }
}
