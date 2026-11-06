import { describe, it, expect } from 'vitest';
import { extractFormFields, renderSnippet } from '@snaptype/snippet-engine';

describe('Dynamic Snippet Parser & Renderer', () => {
  it('extracts interactive form fields from template', () => {
    const template = `Hello {{input:customerName|label="Nume client"|default="John"}},
Status: {{dropdown:status|options="Active,Pending,Closed"|default="Active"}}.
Notes: {{paragraph:details|label="Detalii"}}`;

    const fields = extractFormFields(template);
    expect(fields.length).toBe(3);

    expect(fields[0].name).toBe('customerName');
    expect(fields[0].type).toBe('text');
    expect(fields[0].label).toBe('Nume client');
    expect(fields[0].defaultValue).toBe('John');

    expect(fields[1].name).toBe('status');
    expect(fields[1].type).toBe('dropdown');
    expect(fields[1].options).toEqual(['Active', 'Pending', 'Closed']);

    expect(fields[2].name).toBe('details');
    expect(fields[2].type).toBe('paragraph');
  });

  it('renders template with variables and default fallbacks', () => {
    const template = 'Bună ziua {{input:name|default="stimate client"}}, solicitarea {{ticketId}} este gata.';

    // Without variables: uses defaults
    const res1 = renderSnippet(template);
    expect(res1.text).toBe('Bună ziua stimate client, solicitarea  este gata.');

    // With variables
    const res2 = renderSnippet(template, { variables: { name: 'Maria', ticketId: '#1234' } });
    expect(res2.text).toBe('Bună ziua Maria, solicitarea #1234 este gata.');
  });

  it('correctly tracks cursor position using {{cursor}}', () => {
    const template = 'Hello world, please write here: {{cursor}} and thank you!';
    const res = renderSnippet(template);

    expect(res.text).toBe('Hello world, please write here:  and thank you!');
    expect(res.cursorOffset).toBe(32);
  });

  it('evaluates conditionals {{#if}} and {{else}}', () => {
    const template = 'Status: {{#if isApproved}}Your request was approved!{{else}}Your request is pending.{{/if}}';

    const resApproved = renderSnippet(template, { variables: { isApproved: true } });
    expect(resApproved.text).toBe('Status: Your request was approved!');

    const resPending = renderSnippet(template, { variables: { isApproved: false } });
    expect(resPending.text).toBe('Status: Your request is pending.');
  });

  it('evaluates repetition {{#repeat}}', () => {
    const template = 'Stars: {{#repeat 3}}★{{/repeat}}';
    const res = renderSnippet(template);
    expect(res.text).toBe('Stars: ★★★');
  });

  it('strips internal notes {{note:...}} from final output', () => {
    const template = 'Official reply text.{{note: Remember to check CRM balance}} Best regards.';
    const res = renderSnippet(template);
    expect(res.text).toBe('Official reply text. Best regards.');
  });

  it('evaluates embedded formulas safely', () => {
    const template = 'Total price: {{formula: price * qty}} EUR';
    const res = renderSnippet(template, { variables: { price: 25, qty: 4 } });
    expect(res.text).toBe('Total price: 100 EUR');
  });

  it('resolves included snippets and stops circular recursion safely', () => {
    const snippetsMap: Record<string, string> = {
      header: 'Company Header\n',
      footer: '\nCompany Footer',
      loopA: 'A -> {{snippet:loopB}}',
      loopB: 'B -> {{snippet:loopA}}'
    };

    const resolver = (sc: string) => snippetsMap[sc] || null;

    // Normal inclusion
    const tpl = '{{snippet:header}}Body content{{snippet:footer}}';
    const res = renderSnippet(tpl, { snippetResolver: resolver });
    expect(res.text).toBe('Company Header\nBody content\nCompany Footer');

    // Circular inclusion safeguard
    const loopRes = renderSnippet('{{snippet:loopA}}', { snippetResolver: resolver });
    expect(loopRes.text).toContain('[Circular or excessive nested snippet]');
  });
});

