import { shipSystemDefinitions } from '../engine/extensions/ship-systems/Registry';
import { runtimeAssetUrl } from '../engine/runtime/RuntimePaths';

/** Static definition metadata; no new simulation or network state for skill art. */
export function SystemIcon({ systemId, large = false }: { systemId: string; large?: boolean }) {
  const url = shipSystemDefinitions.get(systemId)?.iconUrl;
  return url ? <img className={`ship-system-icon${large ? ' ship-system-icon--large' : ''}`} src={runtimeAssetUrl(url)} alt="" aria-hidden="true" draggable={false} /> : null;
}
