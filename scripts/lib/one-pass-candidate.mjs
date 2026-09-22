import {onePassReference} from './one-pass-reference.mjs';
import fs from 'node:fs';import path from 'node:path';
export const imports="import { boundedSnapshotReader } from './BoundedSnapshotReader.mjs';\n";
export const binding='const BoundedSnapshotReader = boundedSnapshotReader(SnapshotReader, dictionaryKey, LIMIT, MAX_DEPTH);\n';
export const fastPath=`  // Ordinary packets are validated as they are decoded, not scanned twice.
  // Keep the old parser for exact error precedence and rare legacy UTF8.
  if (!relay) {
    try { return new BoundedSnapshotReader(bytes, dictionary).complete(); }
    catch { /* No partial value escaped. Legacy validation below is authoritative. */ }
  }
`;
export function candidate(source){
 if(source.includes('const BoundedSnapshotReader ='))return source;
 return imports+source.replace('function decodeFrame(buffer, relay = false) {',binding+'function decodeFrame(buffer, relay = false) {').replace('  preflight(bytes);',fastPath+'  preflight(bytes);');
}
export function control(source){return source.replace(imports,'').replace(binding,'').replace(fastPath,'');}
export const onePassPlugin={name:'one-pass-test',setup(build){
 build.onResolve({filter:/^onepass-(candidate|control)$/},args=>({path:args.path,namespace:'onepass'}));
 build.onLoad({filter:/.*/,namespace:'onepass'},args=>{
  const source=fs.readFileSync('src/network/BinarySnapshot.mjs','utf8');
  const contents=args.path.endsWith('control')?onePassReference('binary'):candidate(source)+`\nexport function directOnePass(buffer) { const packet = bytesOf(buffer); const dictionary=packet.length>=4 && packet[0]===83 && packet[1]===87 && packet[2]===70 && packet[3]===50; if(dictionary && packet.length>LIMIT) throw Error('limit'); return new BoundedSnapshotReader(dictionary?packet.subarray(4):packet,dictionary).complete(); }\n`;
  return {contents,loader:'js',resolveDir:path.resolve('src/network')};
 });
}};
