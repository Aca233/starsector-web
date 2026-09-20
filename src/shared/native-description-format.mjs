/** Java-style string parameters; keep literal percent signs and never invent missing values. */
export function formatNativeDescription(template, parameters = []) {
  let next = 0, missing = 0;
  const text = template.replace(/%%|%(?:(\d+)\$)?([sdf])/g, (token, position, kind) => {
    if (token === '%%') return '%';
    const index = position ? Number(position) - 1 : next++;
    const value = parameters[index];
    if (kind !== 's' || value === null || value === undefined || value === '') {
      missing++; return '【参数待核实】';
    }
    return String(value);
  }).replace(/\{([^{}]*)\}/g, '$1');
  return { text, complete: missing === 0, missing };
}
export function nativeHighlightParameters(value) {
  return value ? value.split('|').map(part => part.trim()) : [];
}
