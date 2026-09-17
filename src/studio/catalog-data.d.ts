declare module 'virtual:native-catalog' {
  export const catalogText: string;
  export const catalogPartUrls: Record<import('./CatalogRelations').CatalogKind | 'report', string>;
}
