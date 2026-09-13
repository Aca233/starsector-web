/** Strip Starsector # and // comments without touching quoted strings. */
function stripComments(input: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = input[i + 1];
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; out += ch; continue; }
    if (ch === '#') {
      while (i < input.length && input[i] !== '\n') i++;
      if (i < input.length) out += '\n';
      continue;
    }
    if (ch === '/' && next === '/') {
      i += 2;
      while (i < input.length && input[i] !== '\n') i++;
      if (i < input.length) out += '\n';
      continue;
    }
    out += ch;
  }
  return out;
}

export function parseStarsectorJson(rawText: string): unknown {
  let cleaned = stripComments(rawText);
  cleaned = cleaned.replace(/:\s*([A-Za-z_][A-Za-z0-9_]*)\s*([,}\]])/g, (_m, token: string, tail: string) => {
    if (token === 'true' || token === 'false' || token === 'null') return `: ${token}${tail}`;
    return `: "${token}"${tail}`;
  });
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(cleaned);
}

export function parseStarsectorCsv(csvText: string): Record<string, string>[] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => {
    pushField();
    if (row.some((value) => value.trim().length > 0)) records.push(row);
    row = [];
  };

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    if (quoted) {
      if (ch === '"' && csvText[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') pushField();
    else if (ch === '\n') pushRow();
    else if (ch !== '\r') field += ch;
  }
  if (field.length || row.length) pushRow();
  if (records.length < 2) return [];
  const headers = records[0].map((value) => value.trim());
  return records.slice(1).map((values) => {
    const result: Record<string, string> = {};
    headers.forEach((header, index) => { result[header] = (values[index] ?? '').trim(); });
    return result;
  });
}
