import { HYPERION_HULL_ID } from '../engine/content/HyperionIds';
import { createPackDesign } from './ShipPackDesign';
export { HYPERION_ASSAULT_FIT, HYPERION_FOCUS_FIT, HYPERION_REPAIR_FIT } from '../engine/modding/packs/AuthoredPackVariants';
/** Compatibility entry points; the active package owns all equipment and labels. */
export const createHyperionAssaultDesign = () => createPackDesign(HYPERION_HULL_ID, 'web-sc2-hyperion-assault');
export const createHyperionFocusDesign = () => createPackDesign(HYPERION_HULL_ID, 'web-sc2-hyperion-focus');
export const createHyperionRepairDesign = () => createPackDesign(HYPERION_HULL_ID, 'web-sc2-hyperion-repair');
