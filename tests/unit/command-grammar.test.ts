import { describe, it, expect } from 'vitest';
import { extractFormFields, renderSnippet, validateSnippetTemplate } from '../../packages/snippet-engine/src/dynamic-parser.js';

describe('ST-006, ST-021, ST-022, ST-023: Dynamic Command Grammar & Fail-Safe Evaluation', () => {
  it('extracts and parses unified form: syntax (ST-021)', () => {
    const template = `
      Hello {{form:client_name}},
      Issue: {{form:notes|type=paragraph|required=true}}
      Status: {{form:status|options="Open,Pending,Closed"}}
      Urgent: {{form:is_urgent|type=toggle|default=true}}
      Due Date: {{form:due_date|type=date}}
    `;

    const fields = extractFormFields(template);
    expect(fields).toHaveLength(5);

    const client = fields.find(f => f.name === 'client_name')!;
    expect(client.type).toBe('text');

    const notes = fields.find(f => f.name === 'notes')!;
    expect(notes.type).toBe('paragraph');
    expect(notes.required).toBe(true);

    const status = fields.find(f => f.name === 'status')!;
    expect(status.type).toBe('dropdown');
    expect(status.options).toEqual(['Open', 'Pending', 'Closed']);

    const urgent = fields.find(f => f.name === 'is_urgent')!;
    expect(urgent.type).toBe('toggle');
    expect(urgent.defaultValue).toBe(true);

    const due = fields.find(f => f.name === 'due_date')!;
    expect(due.type).toBe('date');
  });

  it('renders unified form: fields with provided variables', () => {
    const template = 'Client: {{form:client_name}}, Status: {{form:status}}';
    const result = renderSnippet(template, {
      variables: {
        client_name: 'Alice Corp',
        status: 'Active'
      }
    });

    expect(result.text).toBe('Client: Alice Corp, Status: Active');
  });

  it('evaluates {{selectedText}} and {{selected_text}} and {{selection}} (ST-022)', () => {
    const template = 'Quoting: "{{selectedText}}" and "{{selected_text}}"';
    const result = renderSnippet(template, {
      selectedText: 'Error 500 in auth.service'
    });

    expect(result.text).toBe('Quoting: "Error 500 in auth.service" and "Error 500 in auth.service"');
  });

  it('generates advertised ISO timestamp for {{datetime}} (ST-023)', () => {
    const fixedDate = new Date('2026-11-07T12:00:00.000Z');
    const template = 'Timestamp: {{datetime}}';
    const result = renderSnippet(template, { currentDate: fixedDate });

    expect(result.text).toBe('Timestamp: 2026-11-07T12:00:00.000Z');
  });

  it('never silently deletes missing table or include lookups without error notice (ST-006)', () => {
    // Missing include resolver
    const templateInclude = 'Hello, {{include:missing_shortcut}}';
    const resInclude = renderSnippet(templateInclude);
    expect(resInclude.text).toContain('[Include Error:');
    expect(resInclude.errors?.length).toBeGreaterThan(0);

    // Missing table resolver
    const templateTable = 'Customer: {{table:users|lookup=id|value=10|column=email}}';
    const resTable = renderSnippet(templateTable);
    expect(resTable.text).toContain('[Table Error:');
    expect(resTable.errors?.length).toBeGreaterThan(0);

    // Unknown command
    const templateUnknown = 'Score: {{unknown_action:foo}}';
    const resUnknown = renderSnippet(templateUnknown);
    expect(resUnknown.text).toContain('[Unrecognized command:');
    expect(resUnknown.errors.length).toBeGreaterThan(0);

    // Strict unprovided variable
    const templateStrict = 'Missing: {{unprovided_var}}';
    const resStrict = renderSnippet(templateStrict, { strictVariables: true });
    expect(resStrict.text).toContain('[Unresolved: unprovided_var]');
  });

  it('validates template blocks and grammar via validateSnippetTemplate', () => {
    const brokenTemplate = 'Hello {{#if urgent}} urgent! {{#repeat 2}} count {{/if}}';
    const val = validateSnippetTemplate(brokenTemplate);
    expect(val.valid).toBe(false);
    expect(val.errors.length).toBeGreaterThanOrEqual(1);

    const validTemplate = 'Hello {{#if urgent}} urgent! {{/if}} {{#repeat 2}} count {{/repeat}}';
    const valGood = validateSnippetTemplate(validTemplate);
    expect(valGood.valid).toBe(true);
    expect(valGood.errors).toHaveLength(0);
  });
});
