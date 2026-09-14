import React from 'react';
import type { CombatPresentationErrorCode, CombatPresentationState } from '../engine/runtime/CombatSession';
import { i18n } from '../engine/i18n/LocalizationManager';

export interface CombatAvailabilityOverlayProps {
  state: CombatPresentationState;
  onRefresh: () => void;
}

function failureDetailKey(errorCode: CombatPresentationErrorCode | null): string {
  switch (errorCode) {
    case 'webgl2-unsupported': return 'combat.availability.webgl2_unsupported';
    case 'renderer-init-failed': return 'combat.availability.renderer_init_failed';
    case 'resource-prepare-failed': return 'combat.availability.resource_prepare_failed';
    case 'context-restore-failed': return 'combat.availability.context_restore_failed';
    default: return 'combat.availability.failed_detail';
  }
}

export const CombatAvailabilityOverlay: React.FC<CombatAvailabilityOverlayProps> = ({ state, onRefresh }) => {
  if (state.status === 'idle' || state.status === 'ready' || state.status === 'disposed') return null;

  let titleKey = 'combat.availability.loading_title';
  let detailKey = 'combat.availability.loading_detail';
  if (state.status === 'context-lost') {
    titleKey = 'combat.availability.context_lost_title';
    detailKey = 'combat.availability.context_lost_detail';
  } else if (state.status === 'restoring') {
    titleKey = 'combat.availability.restoring_title';
    detailKey = 'combat.availability.restoring_detail';
  } else if (state.status === 'failed') {
    titleKey = 'combat.availability.failed_title';
    detailKey = failureDetailKey(state.errorCode);
  }

  const failed = state.status === 'failed';
  return (
    <div
      className="absolute inset-0 z-[100] flex items-center justify-center bg-slate-950/80 px-6 backdrop-blur-sm"
      data-combat-input-block
      role={failed ? 'alert' : 'status'}
      aria-live={failed ? 'assertive' : 'polite'}
      aria-busy={!failed}
    >
      <div className="w-full max-w-lg border border-cyan-500/30 bg-slate-950/95 p-6 text-center shadow-2xl">
        <h2 className="text-lg font-semibold tracking-wide text-cyan-100">{i18n.t(titleKey)}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-300">{i18n.t(detailKey)}</p>
        {failed && detailKey !== 'combat.availability.failed_detail' && (
          <p className="mt-2 text-sm leading-6 text-slate-400">{i18n.t('combat.availability.failed_detail')}</p>
        )}
        {failed && (
          <button
            type="button"
            className="mt-5 border border-cyan-400/60 bg-cyan-950/70 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-900/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
            onClick={onRefresh}
          >
            {i18n.t('combat.availability.refresh')}
          </button>
        )}
      </div>
    </div>
  );
};
