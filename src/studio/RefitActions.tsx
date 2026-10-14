import { NativeButton } from '../ui/core/NativeControls';
import { RefitHint } from './RefitHint';

export interface RefitAction {
  shortcut: string; label: string; onClick?: () => void; disabled?: boolean; hint?: string; className?: string;
}

/** Page owns actions and permissions; this component owns their original order and markup. */
export function RefitActions({ actions }: { actions: RefitAction[] }) {
  return <div className="refit-actions">{actions.map(action => <RefitHint key={action.shortcut} text={action.hint}>
    <NativeButton shortcut={action.shortcut} disabled={action.disabled} className={action.className} onClick={action.onClick}>{action.label}</NativeButton>
  </RefitHint>)}</div>;
}
