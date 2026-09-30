import { useEffect, useState } from 'react';
import { designLibraryChangedEvent, readLibrary, storageKey } from '../../studio/DesignModel';

/** Storage belongs to the browser, not the combat worker. Never write during refresh. */
export function useSimulationLibrary() {
  const [snapshot, setSnapshot] = useState(readLibrary);
  useEffect(() => {
    const refresh = () => {
      const next = readLibrary();
      setSnapshot(previous => previous.error === next.error &&
        JSON.stringify(previous.library.designs) === JSON.stringify(next.library.designs) ? previous : next);
    };
    const storage = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) refresh();
    };
    window.addEventListener('storage', storage);
    window.addEventListener('focus', refresh);
    window.addEventListener(designLibraryChangedEvent, refresh);
    refresh(); // Catch a write between initial render and subscription.
    return () => {
      window.removeEventListener('storage', storage);
      window.removeEventListener('focus', refresh);
      window.removeEventListener(designLibraryChangedEvent, refresh);
    };
  }, []);
  return { designs: snapshot.library.designs, error: snapshot.error };
}
