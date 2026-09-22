// Appended to the experiment's BinarySnapshot module, never production.
class CaptureFragment {
  toJSON() { throw Error('Opaque capture fragments require projected SWF2 encoding'); }
}
class NativeCaptureSink extends FastProjectedSnapshotEncoder {
  captureDepth = 1;
  maximumDepth = 1;
  begin() { this.reinitializeState(); this.captureDepth = this.maximumDepth = 1; }
  touch(depth) { if (depth > MAX_DEPTH) throw Error('Snapshot exceeds maximum depth'); if(depth>this.maximumDepth)this.maximumDepth=depth; }
  doEncode(value, depth) { this.touch(depth); return super.doEncode(value, depth); }
  encodeArray(value, depth) { if(value.length) this.touch(depth+1); return super.encodeArray(value,depth); }
  visit = null;
  get position(){return this.pos;}
  value(value) {
    this.touch(this.captureDepth);
    if(typeof value==='number'){if(!Number.isFinite(value))throw incompatible;this.encodeNumber(value);}
    else if(value==null)this.encodeNil();
    else if(typeof value==='boolean')this.encodeBoolean(value);
    else if(typeof value==='string'){if(!validString(value))throw incompatible;this.encodeString(value);}
    else this.doEncode(value,this.captureDepth);
  }
  fields(fields,indices,keys,children) {
    if(indices.length)this.touch(this.captureDepth);
    for(let i=0;i<indices.length;i++) {
      if(keys)this.key(keys[i]);
      const value=fields[indices[i]];
      if(typeof value==='number'&&Number.isFinite(value))this.encodeNumber(value);
      else if(value===null)this.encodeNil();
      else if(typeof value==='string'){if(!validString(value))throw incompatible;this.encodeString(value);}
      else if(typeof value==='boolean')this.encodeBoolean(value);
      else this.visit(value,children[i]);
    }
  }
  compactRecords(start,id,spans) {
    // Row headers use the same frozen SWF2 key widths as the batch header.
    // First values array stays in place; following spans shift only left.
    const previousEnd=this.pos;
    this.pos=start;this.map(2);this.key('$records');this.value(id);this.key('values');this.array(spans.length);
    for(const [,from,to] of spans){
      if(this.pos>from)throw Error('Invalid capture compaction overlap');
      this.bytes.copyWithin(this.pos,from,to);this.pos+=to-from;
    }
    this.end();this.end();
    if(this.pos>previousEnd)throw Error('Capture compaction grew');
  }
  array(length) {
    this.touch(this.captureDepth++);
    if(!Number.isSafeInteger(length)||length<0||length>LIMIT)throw new RangeError('Invalid capture array length');
    if(length<16)this.writeU8(0x90+length);
    else if(length<65536){this.writeU8(0xdc);this.writeU16(length);}
    else{this.writeU8(0xdd);this.writeU32(length);}
  }
  map(length) {
    this.touch(this.captureDepth++);
    if(!Number.isSafeInteger(length)||length<0||length>65536)throw new RangeError('Invalid capture map length');
    if(length<16)this.writeU8(0x80+length);
    else if(length<65536){this.writeU8(0xde);this.writeU16(length);}
    else{this.writeU8(0xdf);this.writeU32(length);}
  }
  key(key) {
    if(!validKey(key))throw incompatible;
    const code=keyCodes[key];if(code===undefined)this.encodeString(key);else this.writeU8(code);
  }
  end() { if(--this.captureDepth<1)throw Error('Unbalanced capture container'); }
  finish() {
    if(this.captureDepth!==1)throw Error('Unbalanced capture containers');
    if(this.pos>LIMIT)throw new RangeError('Binary snapshot exceeds budget');
    const fragment=Object.freeze(new CaptureFragment());
    captureFragments.set(fragment,{bytes:this.bytes.slice(4,this.pos),depth:this.maximumDepth});
    return fragment;
  }
}
const nativeCaptureSink = new NativeCaptureSink({ignoreUndefined:true,maxDepth:MAX_DEPTH});
let captureSinkBusy=false;
export function captureProjectionFragment(write) {
  if(captureSinkBusy)throw Error('Reentrant native capture');
  captureSinkBusy=true;
  try {nativeCaptureSink.begin();write(nativeCaptureSink);return nativeCaptureSink.finish();}
  finally {nativeCaptureSink.visit=null;captureSinkBusy=false;}
}
export function isCaptureSinkUnsupported(error) {return error===incompatible;}
export function captureFragmentStats(value) {
 const found=captureFragments.get(value);return found?{bytes:found.bytes.length,depth:found.depth}:null;
}
