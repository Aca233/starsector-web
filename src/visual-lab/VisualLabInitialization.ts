import type { VisualScenarioController } from './VisualScenarioController';

export interface VisualLabInitialState {
  sceneId: string;
  seed: number;
  time: number;
  previewShipId: string | null;
}

export function initializeVisualLabControllerOnce(
  initializedControllerRef: { current: VisualScenarioController | null },
  assetsReady: boolean,
  controller: VisualScenarioController,
  initialState: VisualLabInitialState
): boolean {
  if (!assetsReady || initializedControllerRef.current === controller) return false;
  initializedControllerRef.current = controller;
  controller.setPreviewShip(initialState.previewShipId);
  controller.select(initialState.sceneId, initialState.seed);
  if (initialState.time > 0) controller.seek(initialState.time);
  return true;
}
