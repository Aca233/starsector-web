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
  const text = stripComments(rawText).replace(/^\uFEFF/, '');
  let cursor = 0;
  const skipSpace = () => { while (/\s/.test(text[cursor] ?? '') && cursor < text.length) cursor++; };
  const fail = (): never => { throw new SyntaxError(`Invalid Starsector data at offset ${cursor}`); };
  const string = (): string => {
    const start = cursor++;
    while (cursor < text.length) {
      const ch = text[cursor++];
      if (ch === '\\') cursor++;
      else if (ch === '"') return JSON.parse(text.slice(start, cursor)) as string;
    }
    return fail();
  };
  const value = (depth: number): unknown => {
    if (depth > 128) return fail();
    skipSpace();
    const ch = text[cursor];
    if (ch === '"') return string();
    if (ch === '{' || ch === '[') {
      const isObject = ch === '{';
      const close = isObject ? '}' : ']';
      const entries: [string, unknown][] = [];
      const items: unknown[] = [];
      cursor++;
      skipSpace();
      while (text[cursor] !== close) {
        if (cursor >= text.length) return fail();
        if (isObject) {
          skipSpace();
          const key = text[cursor] === '"' ? string() : bareToken();
          skipSpace();
          if (text[cursor++] !== ':') return fail();
          entries.push([key, value(depth + 1)]);
        } else items.push(value(depth + 1));
        skipSpace();
        if (text[cursor] === close) break;
        if (text[cursor] !== ',' && text[cursor] !== ';') return fail();
        cursor++;
        skipSpace();
      }
      cursor++;
      return isObject ? Object.fromEntries(entries) : items;
    }
    const start = cursor;
    while (cursor < text.length && !/[\s,;\]}]/.test(text[cursor])) cursor++;
    const token = text.slice(start, cursor);
    if (token === 'true') return true;
    if (token === 'false') return false;
    if (token === 'null') return null;
    if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?[fFdD]?$/.test(token)) {
      const number = Number(token.replace(/[fFdD]$/, ''));
      if (!Number.isFinite(number)) return fail();
      return number;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) return token;
    return fail();
  };
  const bareToken = (): string => {
    const start = cursor;
    while (cursor < text.length && /[A-Za-z0-9_]/.test(text[cursor])) cursor++;
    if (cursor === start) return fail();
    return text.slice(start, cursor);
  };
  const result = value(0);
  skipSpace();
  if (text[cursor] === ',' || text[cursor] === ';') { cursor++; skipSpace(); }
  if (cursor !== text.length) return fail();
  return result;
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
