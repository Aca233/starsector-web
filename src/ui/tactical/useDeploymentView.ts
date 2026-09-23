import { useEffect, useState, type SetStateAction } from 'react';
import type { DeploymentViewSource } from '../../engine/runtime/DeploymentView';

/** Preserve the existing 5 Hz UI cadence without reading a mutable simulation from React. */
export function useDeploymentView(source: DeploymentViewSource) {
  const [, refresh] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => refresh(value => value + 1), 200);
    return () => window.clearInterval(timer);
  }, [source]);
  return { view: source.read(), refresh: () => refresh(value => value + 1) };
}

/** A repeated ship ID in a new encounter must not inherit the old pending selection. */
export function useDeploymentSelection<T>(source: DeploymentViewSource, generation: string | number, initial: T) {
  const [stored, setStored] = useState({ source, generation, value: initial });
  const value = stored.source === source && stored.generation === generation ? stored.value : initial;
  const update = (action: SetStateAction<T>) => setStored(current => {
    const base = current.source === source && current.generation === generation ? current.value : initial;
    return { source, generation, value: typeof action === 'function' ? (action as (value: T) => T)(base) : action };
  });
  return [value, update] as const;
}
