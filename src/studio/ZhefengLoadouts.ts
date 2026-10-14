import { ZHEFENG_ID } from '../engine/content/ZhefengIds';
import { createPackDesign } from './ShipPackDesign';
export const createZhefengAssault = () => createPackDesign(ZHEFENG_ID, 'zhefeng-assault');
export const createZhefengPressure = () => createPackDesign(ZHEFENG_ID, 'zhefeng-pressure');
