import { useEffect, useState, type ReactNode } from 'react';
import { Modal } from '../ui/core/UI';
import { NativeButton } from '../ui/NativeChrome';

export function ResponsiveRefitStats({ children }: { children: ReactNode }) {
  const [compact, setCompact] = useState(() => matchMedia('(max-width: 600px)').matches);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const query = matchMedia('(max-width: 600px)');
    const change = () => { setCompact(query.matches); setOpen(false); };
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  if (!compact) return <aside className="refit-stats" aria-label="舰船装配参数">{children}</aside>;
  return <>
    <NativeButton className="refit-stats-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>装配参数</NativeButton>
    {open && <Modal title="装配参数" className="refit-stats-drawer" onClose={() => setOpen(false)}>
      <aside className="refit-stats-drawer-content" aria-label="舰船装配参数">{children}</aside>
    </Modal>}
  </>;
}
