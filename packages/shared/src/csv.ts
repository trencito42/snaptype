/**
 * RFC-4180 compliant CSV Parser and Serializer.
 * Supports quoted fields, escaped quotes, multiline content, Unicode, and UTF-8 BOM.
 */

export function parseCSV(text: string): string[][] {
  // Strip UTF-8 Byte Order Mark if present
  let input = text;
  if (input.charCodeAt(0) === 0xFEFF) {
    input = input.slice(1);
  }

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < input.length) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        // Look ahead for escaped quote ("")
        if (i + 1 < input.length && input[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          // Closing quote
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
        i++;
        continue;
      } else if (char === '\r') {
        // Handle \r\n or standalone \r
        if (i + 1 < input.length && input[i + 1] === '\n') {
          i++;
        }
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        i++;
        continue;
      } else if (char === '\n') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  // Push final field/row if any content exists
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

export function serializeCSV(rows: (string | number | boolean | null | undefined)[][]): string {
  return rows.map((row) => {
    return row.map((cell) => {
      const str = cell === null || cell === undefined ? '' : String(cell);
      // If cell contains comma, double quote, newline, or carriage return, enclose in quotes
      if (/[",\r\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(',');
  }).join('\r\n');
}

