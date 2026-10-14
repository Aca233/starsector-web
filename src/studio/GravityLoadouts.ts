import { GRAVITY_HULL_ID } from '../engine/content/GravityIds';
import { createPackDesign } from './ShipPackDesign';
export const createGravityEscort = () => createPackDesign(GRAVITY_HULL_ID, 'gravity-escort');
export const createGravityControl = () => createPackDesign(GRAVITY_HULL_ID, 'gravity-control');
