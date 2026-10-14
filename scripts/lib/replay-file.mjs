/** Development export envelope. Preserve values used by content fingerprints;
 * ordinary JSON drops undefined properties and changes Infinity/NaN/-0. The
 * authority checkpoint inside remains the existing same-build format. */
export function encodeReplayFile(value) {
  const seen = new Set();
  const encode = value => {
    if (value === undefined) return ['undefined'];
    if (typeof value === 'number') return ['number', Object.is(value, -0) ? '-0' : String(value)];
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return ['scalar', value];
    if (typeof value !== 'object' || seen.has(value)) throw Error('Replay export requires acyclic data-only content.');
    seen.add(value);
    let encoded;
    if (Array.isArray(value)) encoded = ['array', value.map(encode)];
    else if (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
      encoded = ['object', Object.entries(value).map(([key, item]) => [key, encode(item)])];
    else throw Error('Replay export cannot encode a custom prototype.');
    seen.delete(value);
    return encoded;
  };
  return {format: 'foundry-development-replay', version: 1, checkpoint: encode(value)};
}
export function decodeReplayFile(value) {
  if (value?.format !== 'foundry-development-replay') return value; // Existing direct checkpoint imports still validate normally.
  if (value.version !== 1) throw Error('Unsupported development replay envelope.');
  let nodes = 0;
  const decode = (row, depth = 0) => {
    if (!Array.isArray(row) || ++nodes > 2_000_000 || depth > 128) throw Error('Invalid or excessive replay export data.');
    const [kind, data] = row;
    if (kind === 'undefined' && row.length === 1) return undefined;
    if (row.length !== 2) throw Error('Invalid replay export tuple.');
    if (kind === 'scalar' && (data === null || typeof data === 'string' || typeof data === 'boolean')) return data;
    if (kind === 'number' && typeof data === 'string') {
      const number = data === '-0' ? -0 : Number(data);
      if (data !== (Object.is(number, -0) ? '-0' : String(number))) throw Error('Invalid replay number.');
      return number;
    }
    if (kind === 'array' && Array.isArray(data)) return data.map(item => decode(item, depth + 1));
    if (kind === 'object' && Array.isArray(data)) {
      const result = {};
      for (const entry of data) {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || Object.hasOwn(result, entry[0])) throw Error('Invalid duplicate replay property.');
        Object.defineProperty(result, entry[0], {value: decode(entry[1], depth + 1), writable: true, enumerable: true, configurable: true});
      }
      return result;
    }
    throw Error('Unknown replay export tuple.');
  };
  return decode(value.checkpoint);
}
