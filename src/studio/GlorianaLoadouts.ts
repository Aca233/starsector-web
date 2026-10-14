import { GLORIANA_HULL_ID } from '../engine/content/GlorianaPack';
import { createPackDesign } from './ShipPackDesign';
import type { Design } from './DesignModel';
export { GLORIANA_ARSENAL_FIT, GLORIANA_AVIATION_FIT } from '../engine/modding/packs/GlorianaShipPack';
/** Compatibility exports; fit data belongs to the package. */
export const createGlorianaArsenalDesign = (current?: Pick<Design, 'wings'>) => createPackDesign(GLORIANA_HULL_ID, 'web-gloriana-arsenal', current);
export const createGlorianaAviationDesign = () => createPackDesign(GLORIANA_HULL_ID, 'web-gloriana-aviation');
