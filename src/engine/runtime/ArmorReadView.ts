import type { ArmorGrid } from '../simulation/ArmorGrid';
export type ArmorReadSource = Pick<ArmorGrid,'cols'|'rows'|'minX'|'minY'|'cellWidth'|'cellHeight'|'maxCellArmor'|'cells'|'dirtyVersion'|'cellMutationRevision'|'copyCells'>;
export type ArmorReadView = Readonly<Pick<ArmorGrid, 'cols'|'rows'|'minX'|'minY'|'cellWidth'|'cellHeight'|'maxCellArmor'|'cells'|'dirtyVersion'>>;
/** This helper reads a display-owned array, never the authority's escaping cell view. */
export function readArmorCell(armor: {readonly cols:number; readonly rows:number; readonly cells:ArrayLike<number>}, col:number, row:number): number {
  return col < 0 || row < 0 || col >= armor.cols || row >= armor.rows ? 0 : armor.cells[row * armor.cols + col];
}
/** Preserve the authority's tracked-cell optimization. Exposed/custom mutable cells
 * report null and must be copied each time; a dirtyVersion alone is insufficient. */
export class ArmorReadCache {
  private readonly entries = new WeakMap<ArmorReadSource, {revision:number|null; view:ArmorReadView}>();
  read(source: ArmorReadSource): ArmorReadView {
    const revision = source.cellMutationRevision, previous = this.entries.get(source);
    const cells = revision !== null && previous?.revision === revision ? previous.view.cells : source.copyCells();
    const view = {cols:source.cols,rows:source.rows,minX:source.minX,minY:source.minY,cellWidth:source.cellWidth,cellHeight:source.cellHeight,
      maxCellArmor:source.maxCellArmor,dirtyVersion:source.dirtyVersion,cells};
    this.entries.set(source,{revision,view});return view;
  }
}