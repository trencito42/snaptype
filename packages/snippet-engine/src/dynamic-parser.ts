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
  currentDate?: Date;
  depth?: number;
}

export interface RenderResult {
  text: string;
  cursorOffset: number; // -1 if not specified
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
 */
export function extractFormFields(template: string): DynamicFormField[] {
  const fields: Map<string, DynamicFormField> = new Map();
  if (!template) return [];

  // Match {{type:name ...}}
  const tagRegex = /\{\{\s*(input|paragraph|dropdown|toggle|datepicker|date_field):([a-zA-Z0-9_]+)(.*?)\}\}/g;
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
    if (rawType === 'paragraph') type = 'paragraph';
    else if (rawType === 'dropdown') type = 'dropdown';
    else if (rawType === 'toggle') type = 'toggle';
    else if (rawType === 'datepicker' || rawType === 'date_field') type = 'date';

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
 * Render dynamic snippet template into final plain text with cursor location calculation.
 */
export function renderSnippet(template: string, context: RenderContext = {}): RenderResult {
  if (!template) {
    return { text: '', cursorOffset: -1 };
  }

  const depth = context.depth || 0;
  if (depth > MAX_INCLUDE_DEPTH) {
    return { text: '[Circular or excessive nested snippet]', cursorOffset: -1 };
  }

  const vars: Record<string, any> = { ...(context.variables || {}) };
  const now = context.currentDate || new Date();
  let cursorOffset = -1;

  // 1. Process block directives first: {{#repeat n}}...{{/repeat}} and {{#if cond}}...{{else}}...{{/if}}
  let processed = processBlocks(template, vars, context);

  // 2. Tokenize and replace inline tags
  // Regex matches {{...}}
  const inlineRegex = /\{\{([^}]+)\}\}/g;

  const result = processed.replace(inlineRegex, (_match, content: string) => {
    const raw = content.trim();

    // Cursor tag
    if (raw.toLowerCase() === 'cursor') {
      return '__SNAPTYPE_CURSOR_MARKER__';
    }

    // Notes: remove completely
    if (raw.toLowerCase().startsWith('note:') || raw.toLowerCase().startsWith('//')) {
      return '';
    }

    // Clipboard
    if (raw.toLowerCase() === 'clipboard') {
      return context.clipboardText || '';
    }

    // Selected text
    if (raw.toLowerCase() === 'selection' || raw.toLowerCase() === 'selected_text') {
      return context.selectedText || '';
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
        // Check if v is expression or string
        vars[k] = formulaEvaluator.evaluate(v, vars) ?? v;
      }
      return '';
    }

    // Safe Formula / Calculation: {{formula: expr}} or {{calc: expr}}
    if (raw.toLowerCase().startsWith('formula:') || raw.toLowerCase().startsWith('calc:')) {
      const expr = raw.slice(raw.indexOf(':') + 1).trim();
      const evaluated = formulaEvaluator.evaluate(expr, vars);
      return evaluated !== undefined && evaluated !== null ? String(evaluated) : '';
    }

    // Date / Time tags
    if (raw.toLowerCase().startsWith('date') || raw.toLowerCase().startsWith('time')) {
      return handleDateTag(raw, now);
    }

    // Included snippet: {{snippet:shortcut}} or {{include:shortcut}}
    if (raw.toLowerCase().startsWith('snippet:') || raw.toLowerCase().startsWith('include:')) {
      const shortcut = raw.slice(raw.indexOf(':') + 1).trim();
      if (context.snippetResolver) {
        const includedContent = context.snippetResolver(shortcut);
        if (includedContent) {
          const nested = renderSnippet(includedContent, {
            ...context,
            variables: vars,
            depth: depth + 1
          });
          return nested.text;
        }
      }
      return '';
    }

    // Interactive field tags: {{input:name...}}, {{paragraph:name...}}, {{dropdown:name...}}, etc.
    const fieldMatch = raw.match(/^(input|paragraph|dropdown|toggle|datepicker|date_field):([a-zA-Z0-9_]+)(.*)$/i);
    if (fieldMatch) {
      const name = fieldMatch[2];
      const rawAttrs = fieldMatch[3] || '';
      const attrs = parseAttributes(rawAttrs);

      if (Object.prototype.hasOwnProperty.call(vars, name)) {
        return String(vars[name] ?? '');
      }
      return attrs['default'] || '';
    }

    // Plain variable interpolation: {{variableName}}
    if (Object.prototype.hasOwnProperty.call(vars, raw)) {
      return String(vars[raw] ?? '');
    }

    // If unknown or formula shorthand
    return '';
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
    cursorOffset
  };
}

function handleDateTag(raw: string, now: Date): string {
  // Examples:
  // {{date}}
  // {{time}}
  // {{date:YYYY-MM-DD}}
  // {{date:+1d}}
  // {{date:format="DD/MM/YYYY"|offset="+1d"}}
  const colonIdx = raw.indexOf(':');
  if (colonIdx === -1) {
    if (raw.toLowerCase() === 'time') {
      return formatDateTime(now, { format: 'HH:mm' });
    }
    return formatDateTime(now, { format: 'YYYY-MM-DD' });
  }

  const isTime = raw.toLowerCase().startsWith('time');
  const rest = raw.slice(colonIdx + 1).trim();
  const attrs = parseAttributes(rest);

  let format = attrs['format'] || (isTime ? 'HH:mm' : 'YYYY-MM-DD');
  let offset = attrs['offset'] || '';

  // If positional parameter provided without format= or offset=
  if (attrs['default'] && !attrs['format']) {
    if (attrs['default'].startsWith('+') || attrs['default'].startsWith('-') || attrs['default'] === 'tomorrow' || attrs['default'] === 'yesterday') {
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

    // Safety boundary: max 100 repeats
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
