/** Author replacement interface symbols from Lucide (ISC) and original geometry.
 * Not an image-to-image transformation: no source pixels are read, only PNG dimensions.
 * The rasterizer consumes this vector plan and writes the existing logical paths.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as icons from 'lucide-react';
const root = await fs.realpath(new URL('..', import.meta.url));
const assets = path.join(root, 'public/game-assets');
const groups = ['ui', 'hud', 'warroom', 'cursors', 'icons', 'hullmods', 'factions'];
const skillIcons = {
  "advanced_countermeasures": "ShieldEllipsis",
  "automated_ships": "Bot",
  "auxiliary_support": "LifeBuoy",
  "best_of_the_best": "Medal",
  "bulk_transport": "Container",
  "carrier_command": "PlaneTakeoff",
  "category_combat": "Swords",
  "category_industry": "Factory",
  "category_leadership": "Flag",
  "category_technology": "Cpu",
  "colony_management": "Building2",
  "combat_endurance": "HeartPulse",
  "containment_procedures": "CircleDashed",
  "coordinated_maneuvers": "Waypoints",
  "crew_training": "GraduationCap",
  "cybernetic_augmentation": "Microchip",
  "damage_control": "Bandage",
  "defensive_systems": "ShieldCheck",
  "derelict_contingent": "Ship",
  "energy_weapon_mastery": "Zap",
  "ew": "RadioTower",
  "field_modulation": "Activity",
  "field_repairs": "Wrench",
  "fighter_uplink": "Network",
  "flux_dynamics": "Waves",
  "gunnery_implants": "ScanEye",
  "helmsmanship": "ShipWheel",
  "hypercognition": "BrainCircuit",
  "impact_mitigation": "Shield",
  "industrial_planning": "ChartNoAxesCombined",
  "makeshift_equipment": "Hammer",
  "missile_specialization": "Rocket",
  "navigation": "Compass",
  "neural_link": "Cable",
  "officer_management": "UsersRound",
  "officer_training": "Presentation",
  "ordnance_expert": "Bomb",
  "phase_corps": "Orbit",
  "phase_mastery": "Eclipse",
  "planetary_ops": "Globe2",
  "polarized_armor": "ShieldHalf",
  "ranged_specialization": "Telescope",
  "recovery_ops": "Recycle",
  "reliability_engineering": "Cog",
  "salvaging": "Pickaxe",
  "sensors": "Radar",
  "space_ops": "Satellite",
  "special_modifications": "Settings2",
  "strike_commander": "Target",
  "systems_expertise": "SlidersHorizontal",
  "target_analysis": "Scan",
  "weapon_drills": "Crosshair",
  "wolfpack": "Group"
};
const rules = [
  [/pause/, 'Pause'], [/play/, 'Play'], [/close|cancel/, 'X'], [/retreat|disengage/, 'LogOut'],
  [/escort|defend|shield|armor|defense|resist/, 'Shield'], [/target|accuracy|aim|gunnery|ballistic|destroy/, 'Crosshair'],
  [/repair|maint|engineer|industrial|construction/, 'Wrench'], [/sensor|scan|radar|search|detect/, 'Radar'],
  [/nav|waypoint|course|route/, 'Navigation'], [/fighter|carrier|hangar|wing/, 'Plane'],
  [/missile|rocket|torpedo/, 'Rocket'], [/energy|flux|capacitor|reactor|power|capac/, 'Zap'],
  [/engine|speed|maneuver|burn|agility|injector/, 'Gauge'], [/fuel|antimatter/, 'Fuel'],
  [/supply|cargo|storage|salvage|recover|logistic|freight/, 'Package'], [/crew|officer|captain|people|population/, 'Users'],
  [/command|leader|fleet|tactical|combat/, 'Flag'], [/credit|money|trade|market|profit/, 'Coins'],
  [/comm|relay|transponder/, 'Radio'], [/station|colony|industry|building/, 'Building2'],
  [/planet|world|terraform/, 'Globe2'], [/star|sun/, 'Sun'], [/asteroid|ore|mining|metal/, 'Gem'],
  [/science|tech|research|automated|computer|ai_|robot/, 'Cpu'], [/stealth|phase|cloak|dark/, 'Orbit'],
  [/weapon|turret|laser|range|fire|attack/, 'Crosshair'], [/ship|hull|destroyer|cruiser|capital/, 'Ship'],
  [/warning|attention|danger/, 'TriangleAlert'], [/up|increase|plus/, 'ChevronUp'], [/down|decrease|minus/, 'ChevronDown'],
  [/left|previous/, 'ChevronLeft'], [/right|next/, 'ChevronRight'], [/check|accept|confirm|ready/, 'Check'],
  [/skill|special|elite|master/, 'Sparkles'], [/intel|info|story|log/, 'BookOpen'], [/time|clock/, 'Clock'],
];
async function walk(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.isSymbolicLink()) throw Error('Refusing symlink in UI assets');
    if (e.isDirectory()) out.push(...await walk(path.join(dir,e.name))); else out.push(path.join(dir,e.name));
  }
  return out;
}
const jobs=[];
for (const group of groups) for (const file of await walk(path.join(assets,'graphics',group))) {
  const relative=path.relative(assets,file).replaceAll('\\','/');
  if (relative.includes('web_') || !/[.](png|jpg)$/.test(file) || relative.endsWith('/starsector_title_alpha.png')) continue;
  const bytes=await fs.readFile(file);
  if (file.endsWith('.png') && bytes.toString('hex',0,8)!=='89504e470d0a1a0a') throw Error('Expected PNG: '+relative);
  if (file.endsWith('.jpg') && relative !== 'graphics/warroom/taskicons/icon.jpg') throw Error('Unknown JPEG dimensions');
  const width=file.endsWith('.jpg')?256:bytes.readUInt32BE(16),height=file.endsWith('.jpg')?256:bytes.readUInt32BE(20);
  const hash=createHash('sha256').update(relative).digest();
  const hue=group==='factions'?hash[0]*360/256:195+hash[0]%30;
  const accent=`hsl(${hue} 55% 73%)`;
  const name=path.basename(file).toLowerCase();
  const panel=group==='hud'&&/bg|status|target|grid|line|bar_/.test(name)
    ||group==='ui'&&/widget|decor|holder|field|border|tripad|campaign_abilities|^button/.test(name)
    ||group==='warroom'&&/widget|pauseplay/.test(name);
  const begin=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  let body;
  if (name==='ship_arrow.png'||group==='cursors') {
    body=`<path d="M ${width*.9} ${height*.5} L ${width*.15} ${height*.15} L ${width*.32} ${height*.5} L ${width*.15} ${height*.85} Z" fill="#c9e1eb" stroke="#0c1b29" stroke-width="1.5"/>`;
  } else if (/^(bar_|weapons_bar|line8)/.test(name)) {
    body=`<rect width="${width}" height="${height}" rx="${Math.min(2,height/3)}" fill="${/armor/.test(name)?'#d9b77b':'#8fcbd8'}"/>`;
  } else if (panel) {
    body=`<defs><linearGradient id="p" x2="0.8" y2="1"><stop stop-color="#132438" stop-opacity=".95"/><stop offset="1" stop-color="#080f1c" stop-opacity=".88"/></linearGradient></defs><rect x=".5" y=".5" width="${Math.max(0,width-1)}" height="${Math.max(0,height-1)}" rx="${Math.min(10,width/8,height/8)}" fill="url(#p)" stroke="#54778e" stroke-opacity=".6"/><path d="M ${width*.07} 1 H ${width*.29}" stroke="#d2b580" stroke-width="2"/>`;
  } else {
    const skill = relative.includes('/icons/skills/') ? skillIcons[name.replace(/\.(png|jpg)$/,'').replace(/\d+$/,'')] : undefined;
    const iconName=skill??rules.find(([pattern])=>pattern.test(name))?.[1]??'Hexagon';
    const Icon=icons[iconName];if(!Icon) throw Error('Unknown Lucide icon '+iconName);
    const side=Math.min(width,height), size=side*.60;
    const svg=renderToStaticMarkup(createElement(Icon,{width:size,height:size,color:accent,strokeWidth:1.65}));
    body=`<rect x="1" y="1" width="${Math.max(0,width-2)}" height="${Math.max(0,height-2)}" rx="${Math.min(side*.18,12)}" fill="#0d1b2b" stroke="#385268"/><g transform="translate(${(width-size)/2} ${(height-size)/2})">${svg}</g>`;
    if (/elite|improved|advanced/.test(name)) body+=`<circle cx="${width*.83}" cy="${height*.17}" r="${Math.max(1.5,side*.045)}" fill="#e6c78f"/>`;
  }
  jobs.push({path:relative,width,height,svg:begin+body+'</svg>',source:'original-geometry-and-lucide-isc'});
}
const output=path.join(root,'artifacts/original-ui-20260926');await fs.mkdir(output,{recursive:true});
await fs.writeFile(path.join(output,'vector-plan.json'),JSON.stringify(jobs));
console.log(JSON.stringify({interfaceSymbols:jobs.length,groups}));
