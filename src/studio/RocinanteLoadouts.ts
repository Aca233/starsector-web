import { ROCINANTE_HULL_ID } from '../engine/content/RocinanteIds';
import { createPackDesign } from './ShipPackDesign';
export const createRocinanteSkirmish = () => createPackDesign(ROCINANTE_HULL_ID, 'rocinante-skirmish');
export const createRocinanteHunter = () => createPackDesign(ROCINANTE_HULL_ID, 'rocinante-hunter');
