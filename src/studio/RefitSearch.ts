import type { ShipSpec } from '../engine/content/ShipSpec';

/** Match Chinese names and source IDs without requiring exact spaces or punctuation. */
export function searchText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[\s_\-()[\]·.,/]+/g, '');
}
export function matchesRefitSearch(query: string, ...values: string[]): boolean {
  const terms = query.normalize('NFKC').trim().split(/\s+/).map(searchText).filter(Boolean);
  const text = values.map(searchText).join(' ');
  return terms.every(term => text.includes(term));
}
export function refitSearchRank(query: string, ...values: string[]): number {
  const term = searchText(query);
  if (!term) return 0;
  const texts = values.map(searchText);
  return texts.includes(term) ? 0 : texts.some(text => text.startsWith(term)) ? 1 : 2;
}

/** Assembly classification is structural, not dependent on a translated hull name. */
export function hullMatchesCategory(hull: ShipSpec, category: string): boolean {
  if (category === 'STATION') return !!hull.sourceHullTraits?.includes('STATION');
  if (category === 'MODULAR') return !!hull.modules?.length;
  return !category || hull.hullSize === category;
}
export function hullAssemblyLabel(hull: ShipSpec): string {
  if (!hull.modules?.length) return '';
  if (!hullMatchesCategory(hull, 'STATION')) return '模块化舰船';
  const id = hull.sourceHullId ?? hull.id;
  const tier = /^station([123])(?:_|$)/.exec(id)?.[1];
  if (tier) {
    const technology = id.includes('hightech') ? '高科' : id.includes('midline') ? '中线' : '低科';
    return technology + (tier === '3' ? '星堡' : tier === '2' ? '战斗空间站' : '轨道空间站');
  }
  return id.startsWith('remnant_') ? '余辉空间站' : '空间站';
}
export function hullSearchAliases(hull: ShipSpec): string {
  if (!hull.modules?.length) return '';
  const id = hull.sourceHullId ?? hull.id;
  return ['模块 模块化 模块化舰船 modular modules', hullAssemblyLabel(hull),
    hullMatchesCategory(hull, 'STATION') ? '空间站 轨道站 基地 station stations' : '',
    /^station3(?:_|$)/.test(id) ? '星堡 starfortress fortress' : '',
    id.includes('hightech') ? '高科技 hightech' : id.includes('midline') ? '中线 midline' : /^station[123]$/.test(id) ? '低科技 lowtech' : '',
    id.startsWith('remnant_') ? '余辉 中枢' : '', id.includes('derelict') ? '废弃 勘探 母舰' : '',
  ].join(' ');
}
