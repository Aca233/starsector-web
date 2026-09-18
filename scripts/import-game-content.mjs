import { createServer } from 'vite';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, relative, isAbsolute, extname, basename } from 'node:path';

const modulesOnly = process.argv.includes('--modules-only');
const root = resolve(process.argv.slice(2).find(arg => !arg.startsWith('--')) ?? '../starsector-core');
const output = resolve('src/engine/data/generated');
const server = await createServer({ configFile: false, cacheDir: 'node_modules/.vite-import-content', optimizeDeps: { noDiscovery: true, entries: [], include: [] },
  server: { middlewareMode: true, watch: null }, appType: 'custom', logLevel: 'silent' });
try {
  const { dataLoader, parseStarsectorJson: json, parseStarsectorCsv: csv } = await server.ssrLoadModule('/src/engine/data/StarsectorDataLoader.ts');
  await server.ssrLoadModule('/src/engine/content/ContentRegistry.ts');
  const { weaponFitsSlotType } = await server.ssrLoadModule('/src/engine/content/WeaponCompatibility.ts');
  const { validateShipSpec, validateWeaponSpec } = await server.ssrLoadModule('/src/engine/modding/ContentValidation.ts');
  const { hullModDefinitions, hullModInstallReason } = await server.ssrLoadModule('/src/engine/extensions/HullMods.ts');
  const { soundPaths, registerSoundBank } = await server.ssrLoadModule('/src/engine/audio/SoundBank.ts');
  const { assembleShip } = await server.ssrLoadModule('/src/engine/data/BuiltInShips.ts');
  const clean = data => JSON.parse(JSON.stringify(data));
  const sources = new Set(), cache = new Map();
  const readText = async path => {
    path = path.replaceAll('\\', '/');
    const absolute = resolve(root, path), rel = relative(root, absolute);
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`Source path escapes root: ${path}`);
    if (!cache.has(path)) cache.set(path, readFile(absolute, 'utf8'));
    const text = await cache.get(path); sources.add(path); return text;
  };
  const walk = async dir => (await Promise.all((await readdir(resolve(root, dir), { withFileTypes: true }))
    .sort((a,b) => a.name.localeCompare(b.name, 'en')).map(entry => entry.isDirectory() ? walk(`${dir}/${entry.name}`) : `${dir}/${entry.name}`))).flat();
  const selection = JSON.parse(await readFile(resolve('src/engine/data/content-selection.json'), 'utf8'));
  if (selection.schemaVersion !== 1) throw new Error('Unsupported content selection schema');
  for (const key of ['hulls','weapons']) if (!Array.isArray(selection[key]) || new Set(selection[key]).size !== selection[key].length || selection[key].some(id=>typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id))) throw new Error('Invalid selection: ' + key);
  const allNative = selection.discovery?.allNative === true;
  const approximate = selection.discovery?.allowApproximate === true;
  const previous = {};
  for (const name of ['ships','weapons','loadouts','weapon-adapters','refit-source','runtime-import-report']) previous[name] = JSON.parse(await readFile(resolve(output, name + '.json'), 'utf8'));
  for (const [key, ids] of [['ships', selection.hulls], ['weapons', selection.weapons]]) {
    for (const id of ids) if (!previous[key][id]) throw new Error(`Missing curated baseline ${key}.${id}`);
  }
  const report = { schemaVersion: 1, policy: {
    allNative, allowApproximate: approximate,
    supportedMeaning: 'Source fields and mechanics covered by existing Web adapters; not a claim of exact native engine parity.',
    approximationPolicy: 'Only this opt-in offline import omits unsupported mechanics; general runtime/mod validators remain strict.',
    curatedHulls: selection.hulls, curatedWeapons: selection.weapons,
    variantPolicy: 'Curated presets preserved. New hulls prefer compatible native variants; built-ins are authoritative. Native flux investments and unimplemented mods are recorded, not baked into base hull stats.',
    resources: 'Resource closure/native raw catalog is imported separately; this report does not claim assets are bundled.'
  }, discoveryErrors: [], sourceCollisions: [], systems: {}, ships: {}, weapons: {}, wings: {}, counts: {} };
  const index = { ship: new Map(), skin: new Map(), wpn: new Map(), proj: new Map(), variant: new Map() };
  const keyFor = { ship: 'hullId', skin: 'skinHullId', wpn: 'id', proj: 'id', variant: 'variantId' };
  for (const dir of ['data/hulls','data/weapons','data/variants']) {
    for (const path of await walk(dir)) {
      const kind = extname(path).slice(1); if (!index[kind]) continue;
      try {
        const data = json(await readText(path)), id = data[keyFor[kind]];
        if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('Missing/invalid declared content ID');
        if (index[kind].has(id)) {
          const previous = index[kind].get(id);
          // Prefer the canonical filename; retain every path in collision provenance.
          report.sourceCollisions.push({kind,id,paths:[previous.path,path],chosen:basename(path,extname(path)) === id ? path : previous.path});
          if (basename(path,extname(path)) !== id) continue;
        }
        index[kind].set(id, { path, data });
      } catch (error) { report.discoveryErrors.push({ path, reason: error.message }); }
    }
  }
  const table = async path => new Map(csv(await readText(path)).filter(r => r.id && !r.id.startsWith('#') && !Object.values(r)[0].startsWith('#')).map(r => [r.id,r]));
  const shipRows = await table('data/hulls/ship_data.csv'), weaponRows = await table('data/weapons/weapon_data.csv');
  const wingRows = await table('data/hulls/wing_data.csv'), systemRows = await table('data/shipsystems/ship_systems.csv');
  const hullmodRows = await table('data/hullmods/hull_mods.csv');
  // Paths and filenames are not IDs (e.g. manticore_pather.skin declares manticore_luddic_path).
  const sourceReader = async path => {
    const match = path.match(/^data\/(?:hulls|weapons(?:\/proj)?)\/([^/]+)\.(ship|wpn|proj)$/);
    return readText(match && index[match[2]].get(match[1])?.path || path);
  };
  const resolved = new Map();
  const resolveHull = (id, stack = []) => {
    if (resolved.has(id)) return resolved.get(id);
    if (stack.includes(id)) throw new Error('Cyclic skin inheritance: ' + [...stack,id].join(' -> '));
    const skin = index.skin.get(id), base = index.ship.get(id);
    if (!skin) {
      if (!base || !shipRows.has(id)) throw new Error('Missing .ship or ship_data.csv row: ' + id);
      const result = { data: structuredClone(base.data), row: {...shipRows.get(id)}, paths: [base.path], baseHullId: id };
      resolved.set(id,result); return result;
    }
    const parent = resolveHull(skin.data.baseHullId, [...stack,id]), patch = skin.data;
    const result = structuredClone(parent), data = result.data, row = result.row;
    result.paths.push(skin.path); row.id = id; data.hullId = id;
    for (const key of ['hullName','spriteName','coversColor']) if (patch[key] !== undefined) data[key] = patch[key];
    const rowKeys = { hullName: 'name', hullDesignation: 'designation', tech: 'tech/manufacturer', systemId: 'system id', ordnancePoints: 'ordnance points', fighterBays: 'fighter bays', maxSpeed: 'max speed', shieldEfficiency: 'shield efficiency', fleetPoints: 'fleet pts', suppliesToRecover: 'supplies/rec', suppliesPerMonth: 'supplies/mo' };
    for (const [key,column] of Object.entries(rowKeys)) if (patch[key] !== undefined) row[column] = String(patch[key]);
    data.weaponSlots = (data.weaponSlots ?? []).filter(s => !(patch.removeWeaponSlots ?? []).includes(s.id)).map(s => ({...s,...patch.weaponSlotChanges?.[s.id]}));
    data.engineSlots = (data.engineSlots ?? []).map((s,i) => ({...s,...patch.engineSlotChanges?.[i]})).filter((s,i) => !(patch.removeEngineSlots ?? []).includes(i));
    data.builtInMods = [...new Set([...(data.builtInMods ?? []).filter(id => !(patch.removeBuiltInMods ?? []).includes(id)), ...(patch.builtInMods ?? [])])];
    data.builtInWeapons = Object.fromEntries(Object.entries(data.builtInWeapons ?? {}).filter(([slot]) => !(patch.removeBuiltInWeapons ?? []).includes(slot) && !(patch.removeWeaponSlots ?? []).includes(slot)));
    Object.assign(data.builtInWeapons, patch.builtInWeapons ?? {});
    if (patch.builtInWings !== undefined) data.builtInWings = patch.builtInWings;
    row.hints = [...new Set([...(row.hints ?? '').split(/[,\s]+/).filter(h => h && !(patch.removeHints ?? []).includes(h)), ...(patch.addHints ?? [])])].join(',');
    resolved.set(id,result); return result;
  };
  const variantPaths = new Map();
  for (const path of (await walk('data/variants')).filter(p=>p.endsWith('.variant'))) variantPaths.set(basename(path,'.variant'),{path,data:json(await readText(path))});
  // Native references usually name a filename; declared-ID lookup remains the fallback.
  const findVariant = id => variantPaths.get(id) ?? index.variant.get(id);
  const variantsByHull = new Map(), moduleHulls = new Set();
  for (const {data} of index.variant.values()) {
    if (!variantsByHull.has(data.hullId)) variantsByHull.set(data.hullId, []);
    variantsByHull.get(data.hullId).push(data);
    for (const module of Array.isArray(data.modules) ? data.modules : [data.modules ?? {}]) {
      for (const id of Object.values(module)) if (findVariant(id)) moduleHulls.add(findVariant(id).data.hullId);
    }
  }
  const nativeSounds = json(await readText('data/config/sounds.json')), weaponSounds = {};
  const addSound = (key, alias = key) => {
    if (!key || !nativeSounds[key]) return;
    const raw = Array.isArray(nativeSounds[key]) ? nativeSounds[key] : nativeSounds[key].sounds;
    if (!raw?.length) return;
    const samples = raw.map(s => ({...s, pitch: s.pitch ?? 1, volume: s.volume ?? 1}));
    weaponSounds[alias] = samples;
    if (!Object.hasOwn(soundPaths, alias)) registerSoundBank({[alias]: samples}, false);
  };
  const unique = values => [...new Set(values)];
  const status = (entry, registered) => ({level: registered ? entry.reasons.length ? 'approximate' : 'supported' : 'unsupported', reasons: unique(entry.reasons)});
  const weapons = {}, ships = {}, loadouts = {}, shipMeta = {}, weaponMeta = {};
  const weaponIds = allNative ? unique([...weaponRows.keys(),...index.wpn.keys()]).sort() : selection.weapons;
  for (const id of weaponIds) {
    const entry = report.weapons[id] = { registered: false, sourcePath: index.wpn.get(id)?.path, reasons: [] };
    try {
      if (!index.wpn.has(id)) throw new Error('No native .wpn with this declared ID (CSV-only entry).');
      const rawWeapon = index.wpn.get(id).data;
      if (rawWeapon.type === 'DECORATIVE' || (!weaponRows.get(id)?.range && /SYSTEM/.test(weaponRows.get(id)?.hints ?? ''))) throw new Error('Decorative or system-only source helper without a standalone combat profile; catalog-only.');
      let source = await dataLoader.loadWeaponFromSource(id, sourceReader, {reportApproximation: approximate ? reason => entry.reasons.push(reason) : undefined});
      const row = weaponRows.get(id), native = index.wpn.get(id).data;
      if (Number(row['reload size']) > 1) entry.reasons.push(`Native ammo reload batches (${row['reload size']}) use continuous Web ammo regeneration.`);
      if (native.animationType && !['NONE','GLOW_AND_FLASH'].includes(native.animationType)) entry.reasons.push(`Native weapon animation ${native.animationType} uses static base mount sprites.`);
      for (const key of ['pierceSet','requiresFullCharge','unaffectedByProjectileSpeedBonuses']) {
        if (native[key]) entry.reasons.push('Native weapon '+key+'='+JSON.stringify(native[key])+' is not represented by the base Web weapon adapter.');
      }
      if (native.barrelMode === 'LINKED' && Math.max(native.turretOffsets?.length ?? 0,native.hardpointOffsets?.length ?? 0) > 2) entry.reasons.push('Linked multi-barrel discharge uses sequential Web barrel cycling.');
      if ([...(native.turretAngleOffsets ?? []),...(native.hardpointAngleOffsets ?? [])].some(v=>v!==0)) entry.reasons.push('Per-barrel native firing angles are not applied; mount aim direction used.');
      if (native.onFireEffect) entry.reasons.push(`Unimplemented onFireEffect ${native.onFireEffect}: base shot only.`);
      if (selection.weapons.includes(id)) { source = previous.weapons[id]; entry.curated = true; }
      for (const key of [source.soundKey,source.soundIntroKey,source.soundLoopKey,source.mirv?.splitSound,source.proximityFuse?.soundKey]) addSound(key);
      if (previous['weapon-adapters'][id]?.soundKey) addSound(source.soundKey,previous['weapon-adapters'][id].soundKey);
      for (const key of ['soundKey','soundIntroKey','soundLoopKey']) {
        if (source[key] && !Object.hasOwn(soundPaths,source[key])) {
          if (!approximate) throw new Error('Missing native sound ' + source[key]);
          entry.reasons.push('Native sound ' + source[key] + ' is undefined; audio omitted.'); delete source[key];
        }
      }
      source = clean(source);
      validateWeaponSpec(source, false);
      weapons[id] = source;
      const tokens = (row.hints + ',' + row.tags).split(/[,\s]+/).map(t=>t.toLowerCase());
      weaponMeta[id] = {op: Number(row.OPs || 0), name: row.name || id,
        builtInOnly: native.type === 'DECORATIVE' || Number(row.OPs || 0) <= 0 || tokens.some(t=>['system','built_in','builtin','built-in'].includes(t)),
        manufacturer:row['tech/manufacturer'] || '',role:row.primaryRoleStr || '',accuracy:row.accuracyStr || '',turnRate:row.turnRateStr || row['turn rate'] || ''};
      entry.registered = true;
    } catch (error) { entry.reasons.push(error.message); }
    Object.assign(entry, status(entry, entry.registered));
  }
  const registry = { getShip: id => ships[id], getWeapon: id => weapons[id] };
  const compatible = (slot, id) => {
    const weapon = weapons[id]; if (!weapon) return false;
    const rank = {SMALL:1, MEDIUM:2, LARGE:3};

    return rank[weapon.mountSize] <= rank[slot.slotSize] && weaponFitsSlotType(slot.weaponType, weapon);
  };
  const hullIds = allNative ? unique([...shipRows.keys(),...index.ship.keys(),...index.skin.keys()]).sort() : selection.hulls;
  for (const id of hullIds) {
    const entry = report.ships[id] = {registered:false, reasons:[]};
    try {
      const native = resolveHull(id); entry.sourcePaths = native.paths; entry.baseHullId = native.baseHullId;
      entry.sourceSystemId = native.row['system id'] || '';
      entry.sourceDefenseId = native.row['defense id'] || '';
      entry.sourceBuiltInHullMods = native.data.builtInMods ?? [];
      entry.sourceBuiltInWeapons = native.data.builtInWeapons ?? {};
      entry.sourceBuiltInWings = native.data.builtInWings ?? [];

      if (id === 'dem_drone') throw new Error('Invisible DEM missile helper with no standalone collision hull; catalog-only.');
      let source = await dataLoader.loadShipFromSource(id, sourceReader, {shipJson:native.data, shipRow:native.row, reportApproximation: approximate ? reason => entry.reasons.push(reason) : undefined});
      source.isModuleHull = moduleHulls.has(id) || !!native.data.moduleAnchor || (source.sourceHullTraits ?? []).includes('STATION_MODULE');
      if (source.systemType.startsWith('UNADAPTED_SOURCE_')) report.systems[entry.sourceSystemId] = systemRows.get(entry.sourceSystemId);
      if (selection.hulls.includes(id)) { source = structuredClone(previous.ships[id]); loadouts[id] = previous.loadouts[id]; entry.curated = true; }
      else {
        source.builtInHullMods = [];
        for (const mod of entry.sourceBuiltInHullMods) {
          const definition = hullModDefinitions.get(mod);
          if (!definition) { entry.reasons.push(`Unimplemented built-in hullmod ${mod}: omitted from executable hull; source ID retained.`); continue; }
          const reason = hullModInstallReason(source, mod, true);
          if (reason) { entry.reasons.push(`Built-in hullmod ${mod} omitted: ${reason}`); continue; }
          source.builtInHullMods.push(mod);
          if (definition.status !== 'implemented' && definition.support?.scope !== 'campaign-only') entry.reasons.push(`Built-in hullmod ${mod} is metadata-only; behavior not implemented.`);
        }
        for (const slot of source.weaponSlots) if (slot.defaultWeaponId && !compatible(slot, slot.defaultWeaponId)) {
          entry.reasons.push(`Built-in weapon ${slot.defaultWeaponId} at ${slot.slotId} unavailable/incompatible; fixed slot remains empty.`);
          delete slot.defaultWeaponId;
        }
        const candidates = (variantsByHull.get(id) ?? []);
        const score = v => {
          const equipped = Object.entries(Object.assign({}, ...(v.weaponGroups ?? []).map(g=>g.weapons)));
          const valid = equipped.filter(([slotId,w])=>source.weaponSlots.some(s=>s.slotId===slotId && compatible(s,w))).length;
          return valid * 10 - (equipped.length-valid) * 100 + (native.row['codex variant id'] === v.variantId ? 5 : /standard/i.test(v.variantId) ? 3 : 0);
        };
        candidates.sort((a,b)=>score(b)-score(a) || a.variantId.localeCompare(b.variantId,'en'));
        const variant = candidates[0]; entry.defaultVariantId = variant?.variantId;
        const loadout = {weapons:{},groups:[],hullMods:[]};
        if (variant) {
          entry.sourceVariant = {id:variant.variantId,fluxVents:variant.fluxVents ?? 0,fluxCapacitors:variant.fluxCapacitors ?? 0,hullMods:variant.hullMods ?? [],permaMods:variant.permaMods ?? [],sMods:variant.sMods ?? [],wings:variant.wings ?? []};
          if (variant.fluxVents || variant.fluxCapacitors) entry.reasons.push(`Default variant ${variant.variantId}: native vents/capacitors (${variant.fluxVents ?? 0}/${variant.fluxCapacitors ?? 0}) are not invested; base hull flux retained for refit.`);
          for (const mod of unique([...(variant.hullMods ?? []),...(variant.permaMods ?? []),...(variant.sMods ?? [])])) {
            if (source.builtInHullMods.includes(mod)) continue;
            const reason = hullModInstallReason({...source,hullMods:loadout.hullMods}, mod);
            if (reason) entry.reasons.push(`Default variant hullmod ${mod} omitted: ${reason}`);
            else loadout.hullMods.push(mod);
          }
          if (variant.sMods?.length) entry.reasons.push(`S-mod enhancement bonuses are not simulated: ${variant.sMods.join(', ')}.`);
          for (const group of variant.weaponGroups ?? []) {
            const slots = [];
            for (const [slotId,weaponId] of Object.entries(group.weapons ?? {})) {
              const slot = source.weaponSlots.find(s=>s.slotId===slotId);
              if (!slot) { entry.reasons.push(`Default variant slot ${slotId}/${weaponId} not present on runtime hull.`); continue; }
              if (source.hullSize === 'FIGHTER' && slot.mountType === 'HIDDEN' && weapons[weaponId] && !compatible(slot,weaponId)) {
                entry.reasons.push('Hidden native fighter equipment '+weaponId+' at '+slotId+' uses a fixed runtime mount matching the weapon; native slot class/size restriction does not describe its internal launcher.');
                slot.weaponType = 'BUILT_IN'; slot.slotSize = weapons[weaponId].mountSize; slot.defaultWeaponId = weaponId;
              }
              if (slot.defaultWeaponId) { slots.push(slotId); continue; }
              if (!compatible(slot,weaponId)) { entry.reasons.push(`Default variant weapon ${weaponId} at ${slotId} unavailable/incompatible; slot empty.`); continue; }
              loadout.weapons[slotId] = weaponId; slots.push(slotId);
            }
            if (slots.length) loadout.groups.push({index:loadout.groups.length,weaponSlotIds:slots,mode:group.mode,isAutofire:!!group.autofire});
          }
        } else entry.reasons.push('No compatible native default variant; hull registered with built-in equipment only.');
        if (loadout.groups.length > 7) {
          entry.reasons.push('Native variant exceeds seven weapon groups; excess groups merged into group 7.');
          const extra = loadout.groups.splice(7); loadout.groups[6].weaponSlotIds.push(...extra.flatMap(g=>g.weaponSlotIds));
        }
        const ungrouped = source.weaponSlots.filter(s => s.defaultWeaponId && !loadout.groups.some(g=>g.weaponSlotIds.includes(s.slotId))).map(s=>s.slotId);
        if (ungrouped.length) {
          if (loadout.groups.length < 7) loadout.groups.push({index:loadout.groups.length,weaponSlotIds:ungrouped,mode:'LINKED',isAutofire:true});
          else loadout.groups[6].weaponSlotIds.push(...ungrouped);
        }
        loadouts[id] = loadout;
      }
      for (const mod of entry.sourceBuiltInHullMods) {
        const definition = hullModDefinitions.get(mod);
        if (definition?.support?.scope === 'campaign-only') entry.reasons.push(definition.name + '：' + definition.support.summary);
        else if (!definition || definition.status !== 'implemented') entry.reasons.push(`Source built-in hullmod ${mod} has no implemented Web behavior.`);
      }
      const strings = {[source.nameKey]:native.row.name || native.data.hullName || id,[source.designationKey]:native.row.designation || native.data.hullSize || id,[source.descKey]:index.skin.get(id)?.data.descriptionPrefix || native.row.name || id};
      source.i18n = {zh_CN:strings,en_US:strings};
      source = clean(source);
      validateShipSpec(assembleShip(source,loadouts[id]), {registry,allowExistingId:true,requireBundledAssets:false});
      ships[id] = source; shipMeta[id] = {op:Number(native.row['ordnance points'] || 0),name:strings[source.nameKey],manufacturer:native.row['tech/manufacturer'] || '',designation:native.row.designation || ''};
      entry.registered = true;
    } catch (error) { entry.reasons.push(error.message); delete loadouts[id]; }
  }
  // Wing rows refer to variant IDs, not necessarily hull IDs. Carrier source roles are reported if simplified.
  // Display categories use only wing_data.csv role, never names, tags or role descriptions.
  // SUPPORT and OTHER share FIGHTER; missing/unrecognized roles also default to FIGHTER
  // for display only, retaining sourceRole verbatim. The existing simulation role mapping is unchanged.
  const wingDisplayCategories = new Map([
    ['INTERCEPTOR','INTERCEPTOR'], ['FIGHTER','FIGHTER'], ['BOMBER','BOMBER'],
    ['SUPPORT','FIGHTER'], ['OTHER','FIGHTER']
  ]);
  for (const [id,row] of wingRows) {
    const variant = findVariant(row.variant)?.data, hullId = variant?.hullId;
    const reasons = [];
    if (variant && variant.variantId !== row.variant) reasons.push('Native variant filename alias '+row.variant+' declares '+variant.variantId+'; filename resolution used.');
    if (!hullId || ships[hullId]?.hullSize !== 'FIGHTER') reasons.push('Wing craft has no runtime fighter hull.');
    if (row.role && !['FIGHTER','BOMBER'].includes(row.role)) reasons.push(`Native wing role ${row.role} uses basic fighter behavior.`);
    let specId = hullId;
    if (variant && ships[hullId]?.hullSize === 'FIGHTER') {
      const current = assembleShip(ships[hullId],loadouts[hullId]);
      const requested = Object.assign({},...(variant.weaponGroups ?? []).map(g=>g.weapons));
      const different = Object.entries(requested).some(([slot,w])=>current.weaponSlots.find(s=>s.slotId===slot)?.defaultWeaponId!==w);
      if (different) {
        // Wings of one hull may carry different weapons. Keep a separate fighter profile instead
        // of mapping every Aspect or Swarm wing to the hull's single default fit.
        specId = 'wing_' + id;
        const craft = structuredClone(ships[hullId]), fit = {weapons:{},groups:[],hullMods:[]};
        craft.id = specId;
        craft.nameKey = 'ship.'+specId+'.name'; craft.descKey = 'ship.'+specId+'.desc'; craft.designationKey = 'ship.'+specId+'.designation';
        const cloneEntry = report.ships[specId] = {registered:true,level:'approximate',reasons:[...report.ships[hullId].reasons],sourceHullId:hullId,sourceWingId:id,sourcePaths:report.ships[hullId].sourcePaths,defaultVariantId:row.variant,sourceBuiltInWings:[]};
        for (const group of variant.weaponGroups ?? []) {
          const slots = [];
          for (const [slotId,weaponId] of Object.entries(group.weapons ?? {})) {
            const slot = craft.weaponSlots.find(s=>s.slotId===slotId);
            if (!slot || !compatible(slot,weaponId)) { cloneEntry.reasons.push('Wing variant equipment unavailable: '+slotId+'/'+weaponId); continue; }
            fit.weapons[slotId] = weaponId; slots.push(slotId);
          }
          if (slots.length && fit.groups.length < 7) fit.groups.push({index:fit.groups.length,weaponSlotIds:slots,mode:group.mode,isAutofire:!!group.autofire});
        }
        for (const mod of unique([...(variant.hullMods ?? []),...(variant.permaMods ?? []),...(variant.sMods ?? [])])) {
          if (craft.builtInHullMods?.includes(mod)) continue;
          const reason = hullModInstallReason({...craft,hullMods:fit.hullMods},mod);
          if (reason) cloneEntry.reasons.push('Wing variant hullmod '+mod+' omitted: '+reason); else fit.hullMods.push(mod);
        }
        const strings = {[craft.nameKey]:shipMeta[hullId].name,[craft.designationKey]:shipMeta[hullId].designation || 'FIGHTER',[craft.descKey]:'Native wing variant '+row.variant};
        craft.i18n = {zh_CN:strings,en_US:strings};
        validateShipSpec(assembleShip(craft,fit),{registry,allowExistingId:true,requireBundledAssets:false});
        ships[specId] = craft; loadouts[specId] = fit; shipMeta[specId] = {...shipMeta[hullId]};
      }
    }
    report.wings[id] = {specId,registered: !!hullId && ships[hullId]?.hullSize === 'FIGHTER', hullId, sourceVariantId:row.variant, role:row.role, tags:(row.tags ?? '').split(/[,\s]+/).filter(Boolean), count:Number(row.num), rebuildSeconds:Number(row.refit), op:Number(row['op cost'] || 0), name:(shipMeta[hullId]?.name || row['role desc'] || id) + ' · ' + (row['role desc'] || row.role),
      // shipMeta already prefers native ship_data.csv name, then .ship hullName; use the wing ID if absent.
      displayName:shipMeta[hullId]?.name || id, sourceRole:row.role ?? '', roleDescription:row['role desc'] ?? '',
      category:wingDisplayCategories.get(row.role) ?? 'FIGHTER',
      // Native range is display metadata, not a runtime AI limit; preserve zero (carrier-local support).
      range:row.range ? Number(row.range) : null, formation:row.formation ?? '', reasons};
  }
  for (const [id,ship] of Object.entries(ships)) {
    const entry = report.ships[id];
    if (!entry.curated) {
      const wingIds = [...(entry.sourceBuiltInWings ?? []),...(entry.sourceVariant?.wings ?? []).filter(Boolean)];
      ship.fighterWings = [];
      for (const wingId of wingIds) {
        const wing = report.wings[wingId];
        if (!wing?.registered || ship.fighterWings.length >= ship.fighterBays) { entry.reasons.push(`Native wing ${wingId} unavailable or exceeds runtime flight decks; not equipped.`); continue; }
        ship.fighterWings.push({specId:wing.specId,role:wing.role === 'BOMBER' ? 'BOMBER' : 'FIGHTER',count:wing.count,rebuildSeconds:wing.rebuildSeconds,tags:wing.tags});
        entry.reasons.push(...wing.reasons);
        if (report.ships[wing.hullId].reasons.length) entry.reasons.push(`Wing ${wingId} uses approximate fighter ${wing.hullId}; see its ship status.`);
      }
      if (!ship.fighterWings.length) delete ship.fighterWings;
    }
    for (const slot of assembleShip(ship,loadouts[id]).weaponSlots) if (slot.defaultWeaponId && report.weapons[slot.defaultWeaponId]?.level === 'approximate') entry.reasons.push(`Equipped weapon ${slot.defaultWeaponId} is approximate; see weapon status.`);
    Object.assign(entry,status(entry,true));
  }
  for (const entry of Object.values(report.ships)) if (!entry.registered) Object.assign(entry,status(entry,false));
  // Resolve module variants only after every hull, weapon and wing is registered.
  // Store full child fits so runtime never reads installation files or guesses a variant.
  const modularVariants = {};
  const compileVariant = (variant, chain = []) => {
    if (chain.length > 8 || chain.includes(variant.variantId)) throw new Error('Cyclic/deep module variant: ' + variant.variantId);
    const base = ships[variant.hullId];
    if (!base) throw new Error('Unavailable module hull: ' + variant.hullId);
    const spec = assembleShip(base);
    spec.sourceHullId = base.id; spec.sourceVariantId = variant.variantId;
    spec.moduleCombat = (shipMeta[base.id]?.op ?? 0) > 0 || (variant.weaponGroups?.length ?? 0) > 0 || (spec.fighterBays ?? 0) > 0;
    spec.maxFlux += (variant.fluxCapacitors ?? 0) * 200;
    spec.shieldUpkeepBaseDissipation = base.fluxDissipation;
    spec.fluxDissipation += (variant.fluxVents ?? 0) * 10;
    spec.hullMods = [];
    for (const id of unique([...(variant.hullMods ?? []), ...(variant.permaMods ?? []), ...(variant.sMods ?? [])])) {
      if (!spec.builtInHullMods.includes(id) && !hullModInstallReason(spec, id)) spec.hullMods.push(id);
    }
    spec.sMods = (variant.sMods ?? []).filter(id => spec.hullMods.includes(id) || spec.builtInHullMods.includes(id));
    spec.defaultWeaponGroups = [];
    for (const group of variant.weaponGroups ?? []) {
      const slots = [];
      for (const [slotId, weaponId] of Object.entries(group.weapons ?? {})) {
        const slot = spec.weaponSlots.find(s => s.slotId === slotId);
        if (!slot) throw new Error('Missing module weapon mount: ' + variant.variantId + '/' + slotId);
        if (!slot.builtIn) {
          if (!compatible(slot, weaponId)) throw new Error('Unavailable module weapon: ' + variant.variantId + '/' + weaponId);
          slot.defaultWeaponId = weaponId;
        }
        if (slot.defaultWeaponId) slots.push(slotId);
      }
      if (slots.length) spec.defaultWeaponGroups.push({ index: spec.defaultWeaponGroups.length, weaponSlotIds: slots, mode: group.mode, isAutofire: true });
    }
    const ungrouped = spec.weaponSlots.filter(s => s.defaultWeaponId && !spec.defaultWeaponGroups.some(g => g.weaponSlotIds.includes(s.slotId))).map(s => s.slotId);
    if (ungrouped.length) spec.defaultWeaponGroups.push({index:spec.defaultWeaponGroups.length,weaponSlotIds:ungrouped,mode:'LINKED',isAutofire:true});
    if (spec.defaultWeaponGroups.length > 7) spec.defaultWeaponGroups[6].weaponSlotIds.push(...spec.defaultWeaponGroups.splice(7).flatMap(g => g.weaponSlotIds));
    const wingIds = [...(report.ships[base.id].sourceBuiltInWings ?? []), ...(variant.wings ?? []).filter(Boolean)];
    spec.fighterWings = wingIds.flatMap(id => {
      const wing = report.wings[id];
      return wing?.registered ? [{specId:wing.specId,role:wing.role === 'BOMBER' ? 'BOMBER' : 'FIGHTER',count:wing.count,rebuildSeconds:wing.rebuildSeconds,tags:wing.tags,range:wing.range}] : [];
    }).slice(0, spec.fighterBays ?? 0);
    const refs = Object.assign({}, ...(Array.isArray(variant.modules) ? variant.modules : [variant.modules ?? {}]));
    spec.modules = Object.entries(refs).map(([slotId, id]) => {
      const slot = base.moduleSlots?.find(s => s.slotId === slotId), child = findVariant(id)?.data;
      if (!slot || !child) throw new Error('Missing module reference: ' + variant.variantId + '/' + slotId + '/' + id);
      return {...slot, spec:compileVariant(child, [...chain, variant.variantId])};
    });
    return spec;
  };
  for (const {data:variant} of index.variant.values()) if (variant.modules && ships[variant.hullId]) {
    try {
      const spec = compileVariant(variant);
      validateShipSpec(spec, {registry,allowExistingId:true,requireBundledAssets:false});
      modularVariants[variant.variantId] = {hullId:variant.hullId, modules:spec.modules};
    } catch (error) { modularVariants[variant.variantId] = {hullId:variant.hullId, error:error.message}; }
  }
  for (const [id, ship] of Object.entries(ships)) if (ship.moduleSlots?.length) {
    const variantId = report.ships[id].defaultVariantId;
    const preferred = modularVariants[variantId] ?? Object.values(modularVariants).find(v => v.hullId === id && v.modules);
    if (!preferred?.modules?.length) { report.ships[id].registered = false; report.ships[id].reasons.push('No complete native module assembly: ' + JSON.stringify(Object.values(modularVariants).filter(v => v.hullId === id))); Object.assign(report.ships[id], status(report.ships[id],false)); delete ships[id]; delete shipMeta[id]; delete loadouts[id]; continue; }
    ship.modules = preferred.modules;
    ship.sourceVariantId = variantId;
    report.ships[id].level = 'approximate';
    report.ships[id].reasons.push('Module combat and attachment supported; station-specific scripted hullmods remain approximate where reported.');
  }
  // Validate the final equipped graph, including carrier references, before publishing generated outputs.
  for (const [id,ship] of Object.entries(ships)) {
    validateShipSpec(assembleShip(ship,loadouts[id]), {registry,allowExistingId:true,requireBundledAssets:false});
    for (const wing of ship.fighterWings ?? []) if (ships[wing.specId]?.hullSize !== 'FIGHTER') throw new Error(id + ': invalid wing graph');
  }
  for (const id of selection.hulls) if (!ships[id]) throw new Error('Curated hull failed import: ' + id + ': ' + report.ships[id]?.reasons.join('; '));
  for (const id of selection.weapons) if (!weapons[id]) throw new Error('Curated weapon failed import: ' + id + ': ' + report.weapons[id]?.reasons.join('; '));
  for (const kind of ['ships','weapons']) report.counts[kind] = {discovered:Object.keys(report[kind]).length,registered:Object.values(report[kind]).filter(e=>e.registered).length,...Object.fromEntries(['supported','approximate','unsupported'].map(level=>[level,Object.values(report[kind]).filter(e=>e.level===level).length]))};
  report.counts.ships.reportEntries = report.counts.ships.discovered;
  report.counts.ships.discovered = hullIds.length;
  report.counts.ships.nativeDiscovered = hullIds.length;
  report.counts.ships.nativeRegistered = Object.values(report.ships).filter(e=>e.registered && !e.sourceWingId).length;
  report.counts.ships.wingProfiles = Object.values(report.ships).filter(e=>e.registered && e.sourceWingId).length;
  report.counts.ships.fighters = Object.values(ships).filter(s=>s.hullSize==='FIGHTER').length;
  report.counts.ships.nonFighters = Object.keys(ships).length-report.counts.ships.fighters;
  report.counts.wings = {discovered:wingRows.size,registered:Object.values(report.wings).filter(e=>e.registered).length};
  const refit = {
    hullmods: Object.fromEntries([...hullmodRows].map(([id,row]) => [id, {name:row.name || id, implemented:hullModDefinitions.get(id)?.status === 'implemented', support:hullModDefinitions.get(id)?.support}])),
    sourceBuiltInMods: Object.fromEntries(Object.entries(report.ships).filter(([,entry])=>entry.sourceBuiltInHullMods?.length).map(([id,entry])=>[id,entry.sourceBuiltInHullMods])),
    sourceBuiltInWings: Object.fromEntries(Object.entries(report.ships).filter(([,entry])=>entry.sourceBuiltInWings?.length).map(([id,entry])=>[id,entry.sourceBuiltInWings])),
    ships:shipMeta,weapons:weaponMeta,wings:Object.fromEntries(Object.entries(report.wings).filter(([,e])=>e.registered).map(([id,e])=>[id,{specId:e.specId,role:e.role === 'BOMBER' ? 'BOMBER' : 'FIGHTER',count:e.count,rebuildSeconds:e.rebuildSeconds,tags:e.tags,op:e.op,name:e.name,displayName:e.displayName,sourceRole:e.sourceRole,roleDescription:e.roleDescription,category:e.category,range:e.range,formation:e.formation}])),shipStatus:Object.fromEntries(Object.entries(report.ships).map(([id,e])=>[id,status(e,e.registered)])),weaponStatus:Object.fromEntries(Object.entries(report.weapons).map(([id,e])=>[id,status(e,e.registered)]))};
  await mkdir(output,{recursive:true});
  const outputs = {ships,weapons,loadouts,'modular-variants':modularVariants,'weapon-sounds':weaponSounds,'weapon-adapters':previous['weapon-adapters'],provenance:{sourceFiles:[...sources].sort()},'runtime-import-report':report,'refit-source':refit};
  if (modulesOnly) {
    // A bounded content update must not refresh unrelated historical imports or drop legacy fits.
    const modularIds = new Set([...moduleHulls, ...[...index.ship].filter(([,entry])=>entry.data.moduleAnchor || entry.data.weaponSlots?.some(slot=>slot.type==='STATION_MODULE')).map(([id])=>id), ...Object.entries(ships).filter(([,s]) => s.isModuleHull || s.moduleSlots?.length).map(([id])=>id)]);
    const pick = rows => Object.fromEntries(Object.entries(rows).filter(([id])=>modularIds.has(id)));
    outputs.ships = {...previous.ships, ...pick(ships)};
    outputs.loadouts = {...previous.loadouts, ...pick(loadouts)};
    outputs.weapons = previous.weapons;
    outputs['refit-source'] = {...previous['refit-source']};
    for (const key of ['ships','shipStatus','sourceBuiltInMods','sourceBuiltInWings']) outputs['refit-source'][key] = {...previous['refit-source'][key], ...pick(refit[key])};
    outputs['refit-source'].hullmods = {...previous['refit-source'].hullmods, vastbulk:refit.hullmods.vastbulk, shared_flux_sink:refit.hullmods.shared_flux_sink};
    outputs['runtime-import-report'] = {...previous['runtime-import-report'], ships:{...previous['runtime-import-report'].ships, ...pick(report.ships)}};
    const merged = outputs['runtime-import-report'];
    merged.counts = {...merged.counts, ships:{...merged.counts.ships,
      registered:Object.keys(outputs.ships).length, nativeRegistered:Object.values(merged.ships).filter(e=>e.registered&&!e.sourceWingId).length,
      nonFighters:Object.values(outputs.ships).filter(s=>s.hullSize!=='FIGHTER').length,
      ...Object.fromEntries(['supported','approximate','unsupported'].map(level=>[level,Object.values(merged.ships).filter(e=>e.level===level).length]))}};
  }
  for (const [name,data] of Object.entries(outputs)) await writeFile(resolve(output,name+'.json'),JSON.stringify(data,null,2)+'\n');
  console.log(JSON.stringify(report.counts,null,2));
  const failures = Object.entries(report.ships).filter(([,e])=>!e.registered && !e.reasons.some(r=>r.includes('Modular/station'))).map(([id,e])=>[id,e.reasons.at(-1)]);
  console.log('Other hull exclusions:',JSON.stringify(failures));
  console.log('Weapon exclusions:',JSON.stringify(Object.entries(report.weapons).filter(([,e])=>!e.registered).map(([id,e])=>[id,e.reasons.at(-1)])));
} finally { await server.close(); }
