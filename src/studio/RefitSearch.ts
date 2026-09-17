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
