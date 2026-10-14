import type { ReactNode } from 'react';

/** A recoverable empty/error page: explain the current dependency and offer navigation. */
export function PageState({ title, children, actions, error = false }: {
  title: string; children: ReactNode; actions: ReactNode; error?: boolean;
}) {
  return <main className="ui-page-state" role={error ? 'alert' : 'status'}>
    <section className="ui-page-state-panel"><h1>{title}</h1><div>{children}</div><nav aria-label="恢复操作">{actions}</nav></section>
  </main>;
}
