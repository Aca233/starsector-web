/** Test-only, independent wire normalizer. Keeps wire IDs and ordered fields, not display objects. */
export function createPresentationPacketOracle() {
  const objects = new Map();
  return packet => {
    const data = new Float64Array(packet.buffer, 0, packet.length);
    let at = 2;
    const read = () => { if (at >= data.length) throw Error('Oracle: truncated row'); return data[at++]; };
    const scalar = () => {
      const tag = read(), payload = read();
      if (tag === 5) { if (!Number.isSafeInteger(payload) || payload < 0 || payload >= packet.strings.length) throw Error('Oracle: string index'); return [tag, packet.strings[payload]]; }
      return [tag, payload];
    };
    const rows = [];
    for (let i = 0; i < packet.nodeCount; i++) {
      const id = read(), kind = read();
      let row;
      if (kind === 0) {
        const shape = packet.shapes[read()]; if (!shape) throw Error('Oracle: shape');
        row = { id, kind, type: shape.type, keys: [...shape.keys], values: [] };
        for (let j = 0; j < row.keys.length; j++) row.values.push(...scalar());
      } else if (kind === 6) {
        const base = objects.get(id); if (!base || base.kind !== 0) throw Error('Oracle: patch base');
        row = { ...base, values: [...base.values] };
        const count = read(); let prior = -1;
        if (!Number.isSafeInteger(count) || count <= 0 || count * 3 >= row.values.length) throw Error('Oracle: non-sparse patch');
        for (let j = 0; j < count; j++) {
          const field = read(); if (!Number.isSafeInteger(field) || field <= prior || field >= row.keys.length) throw Error('Oracle: patch field');
          prior = field; const pair = scalar(); row.values[field * 2] = pair[0]; row.values[field * 2 + 1] = pair[1];
        }
      } else if (kind === 5) row = {id,kind,values:[read(),read()]};
      else if (kind === 4) {
        const type = read(), length = read(); row = {id,kind,type,values:[]};
        for (let j = 0; j < length; j++) row.values.push(read());
      } else if (kind >= 1 && kind <= 3) {
        const length = read(); row = {id,kind,values:[]};
        for (let j = 0; j < length; j++) row.values.push(...scalar());
      } else throw Error('Oracle: unknown row');
      rows.push(row); objects.set(id,row);
    }
    if (at !== data.length) throw Error('Oracle: trailing data');
    for (const id of packet.removed) objects.delete(id);
    const {buffer: _buffer, length: _length, strings: _strings, shapes: _shapes, visuals, ...header} = packet;
    return {...header,root:[data[0],data[1]],rows,...(visuals ? {visuals:{...visuals,buffer:new Float64Array(visuals.buffer,0,visuals.length)}} : {})};
  };
}
