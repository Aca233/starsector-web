import { useDwellHover } from './useDwellHover';
/** All equipment cards share B: delayed reveal, dwell lock and nested explanations. */
export const useEquipmentHover = useDwellHover;
export type EquipmentHover = ReturnType<typeof useEquipmentHover>;
