import { ADUN_ARK_ID } from '../engine/content/AdunArkIds';
import { createPackDesign } from './ShipPackDesign';
export { ADUN_DEFAULT_FIT } from '../engine/modding/packs/AuthoredPackVariants';
export const createAdunDesign = () => createPackDesign(ADUN_ARK_ID, 'web-adun-ark-solar-battleline');
