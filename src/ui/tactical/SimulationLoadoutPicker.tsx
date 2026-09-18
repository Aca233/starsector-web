import { SimulationOptionInspection } from './SimulationOptionInspection';
import type { OpenWeaponCodex } from '../../studio/useInspectionCodex';
import { LoadoutFlyout } from '../LoadoutFlyout';
import { prepareSimulationOption, simulationOptionErrors, type SimulationHull, type SimulationOption } from './SimulationRoster';

export interface LoadoutAnchor { hull: SimulationHull; element: HTMLButtonElement; pinned: boolean }
export function SimulationLoadoutPicker({ anchor, selected, onToggle, onInspect, onEnter, onLeave, onClose, onLockChange, onOpenCodex, inspectionEnabled }: {
  onLockChange: (locked: boolean) => void; onOpenCodex: OpenWeaponCodex; inspectionEnabled: boolean;
  anchor: LoadoutAnchor; selected: readonly string[]; onToggle: (option: SimulationOption) => void;
  onInspect: (option: SimulationOption) => void; onEnter: () => void; onLeave: () => void; onClose: () => void;
}) {
  const find = (id: string) => anchor.hull.options.find(option => option.id === id)!;
  return <LoadoutFlyout element={anchor.element} pinned={anchor.pinned} name={anchor.hull.options[0].name} selected={selected}
    options={anchor.hull.options.map(option => ({id:option.id, name:option.variantName, detail:option.id.split('--')[0], cost:option.cost ? option.cost+' DP' : '不可部署',
      error:simulationOptionErrors(option).length ? prepareSimulationOption(option).errors.join('；') : undefined}))}
    renderOption={(option, button) => <SimulationOptionInspection option={find(option.id)} onLockChange={onLockChange} onOpenCodex={onOpenCodex} enabled={inspectionEnabled}>{button}</SimulationOptionInspection>}
    onChoose={id => onToggle(find(id))} onInspect={id => onInspect(find(id))} onEnter={onEnter} onLeave={onLeave} onClose={onClose}/>;
}
