import fs from 'node:fs';import path from 'node:path';
import {nativeFieldsReference} from './native-fields-reference.mjs';
export const nativeFieldsPlugin={name:'native-fields-comparison',setup(build){
 build.onResolve({filter:/^native-fields-(control|candidate)$/},args=>({path:args.path,namespace:'native-fields'}));
 build.onLoad({filter:/.*/,namespace:'native-fields'},args=>({contents:args.path.endsWith('control')?nativeFieldsReference:fs.readFileSync(process.env.NATIVE_FIELDS_SOURCE??'src/network/AuthorityCombatSnapshot.ts','utf8'),loader:'ts',resolveDir:path.resolve('src/network')}));
}};
