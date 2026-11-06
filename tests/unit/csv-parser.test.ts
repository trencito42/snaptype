import { describe, it, expect } from 'vitest';
import { parseCSV, serializeCSV } from '@snaptype/shared';

describe('RFC-4180 Compliant CSV Parser & Serializer', () => {
  it('parses basic unquoted CSV rows', () => {
    const csv = 'Name,Shortcut,Content\nBonus,cerbonus,Hello world\nVerificare,msver,Account verified';
    const rows = parseCSV(csv);

    expect(rows.length).toBe(3);
    expect(rows[0]).toEqual(['Name', 'Shortcut', 'Content']);
    expect(rows[1]).toEqual(['Bonus', 'cerbonus', 'Hello world']);
    expect(rows[2]).toEqual(['Verificare', 'msver', 'Account verified']);
  });

  it('correctly handles quoted fields with commas and escaped quotes', () => {
    const csv = '"Snippet, Name",Shortcut,"Hello, ""world""!"\n"Second, item",sc2,"Simple"';
    const rows = parseCSV(csv);

    expect(rows.length).toBe(2);
    expect(rows[0]).toEqual(['Snippet, Name', 'Shortcut', 'Hello, "world"!']);
    expect(rows[1]).toEqual(['Second, item', 'sc2', 'Simple']);
  });

  it('correctly parses multiline cells enclosed in quotes', () => {
    const csv = 'Name,Shortcut,Content\nMulti,multi,"Line 1\nLine 2\nLine 3"';
    const rows = parseCSV(csv);

    expect(rows.length).toBe(2);
    expect(rows[1][2]).toBe('Line 1\nLine 2\nLine 3');
  });

  it('strips UTF-8 BOM properly', () => {
    const csvWithBom = '\uFEFFName,Shortcut\ntest,sc';
    const rows = parseCSV(csvWithBom);

    expect(rows[0][0]).toBe('Name');
  });

  it('round-trips serialize and parse losslessly', () => {
    const original = [
      ['Title', 'Shortcut', 'Body with, commas and "quotes"'],
      ['Multi\nline', 'mline', 'First\r\nSecond\nThird']
    ];

    const serialized = serializeCSV(original);
    const parsed = parseCSV(serialized);

    expect(parsed[0]).toEqual(original[0]);
    expect(parsed[1][0]).toEqual(original[1][0]);
    expect(parsed[1][1]).toEqual(original[1][1]);
    expect(parsed[1][2]).toBe('First\r\nSecond\nThird');
  });
});

