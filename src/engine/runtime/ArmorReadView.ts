import type { ArmorGrid } from '../simulation/ArmorGrid';
import { knownProjectionKeys } from './local/RenderShipProjection';
export type ArmorReadSource = Pick<ArmorGrid,'cols'|'rows'|'minX'|'minY'|'cellWidth'|'cellHeight'|'maxCellArmor'|'cells'|'dirtyVersion'|'cellMutationRevision'|'copyCells'> & { copyCellsInto?: (target?: Float32Array) => Float32Array };
export type ArmorReadView = Readonly<Pick<ArmorGrid, 'cols'|'rows'|'minX'|'minY'|'cellWidth'|'cellHeight'|'maxCellArmor'|'cells'|'dirtyVersion'>>;
const armorReadViewKeys = ['cols', 'rows', 'minX', 'minY', 'cellWidth', 'cellHeight', 'maxCellArmor', 'dirtyVersion', 'cells'];
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
    if (previous && revision !== null && previous.revision === revision
      && previous.view.dirtyVersion === source.dirtyVersion
      && previous.view.cols === source.cols && previous.view.rows === source.rows
      && previous.view.minX === source.minX && previous.view.minY === source.minY
      && previous.view.cellWidth === source.cellWidth && previous.view.cellHeight === source.cellHeight
      && previous.view.maxCellArmor === source.maxCellArmor) {
      return previous.view;
    }
    const cells = revision !== null && previous?.revision === revision ? previous.view.cells : source.copyCells();
    const view = {cols:source.cols,rows:source.rows,minX:source.minX,minY:source.minY,cellWidth:source.cellWidth,cellHeight:source.cellHeight,
      maxCellArmor:source.maxCellArmor,dirtyVersion:source.dirtyVersion,cells};
    knownProjectionKeys.set(view, armorReadViewKeys);
    this.entries.set(source,{revision,view});return view;
  }
  readReadonly(source: ArmorReadSource): ArmorReadView {
    const revision = source.cellMutationRevision, previous = this.entries.get(source);
    const cells = revision !== null && previous?.revision === revision
      ? previous.view.cells
      : (source.copyCellsInto ? source.copyCellsInto(previous?.view.cells) : source.copyCells());
    if (previous) {
      const v = previous.view as Record<string, unknown>;
      v.cols = source.cols; v.rows = source.rows; v.minX = source.minX; v.minY = source.minY;
      v.cellWidth = source.cellWidth; v.cellHeight = source.cellHeight;
      v.maxCellArmor = source.maxCellArmor; v.dirtyVersion = source.dirtyVersion; v.cells = cells;
      previous.revision = revision;
      return previous.view;
    }
    const view = {cols:source.cols,rows:source.rows,minX:source.minX,minY:source.minY,cellWidth:source.cellWidth,cellHeight:source.cellHeight,
      maxCellArmor:source.maxCellArmor,dirtyVersion:source.dirtyVersion,cells};
    knownProjectionKeys.set(view, armorReadViewKeys);
    this.entries.set(source,{revision,view});return view;
  }
}