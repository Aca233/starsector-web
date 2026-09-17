import React from "react";
import type {
  CombatPresentationErrorCode,
  CombatPresentationState,
} from "../engine/runtime/CombatSession";
import { i18n } from "../engine/i18n/LocalizationManager";
import { Button, Modal, Notice } from "./core/UI";

export interface CombatAvailabilityOverlayProps {
  state: CombatPresentationState;
  onRefresh: () => void;
  onReturnDesign?: () => void;
}

function failureDetailKey(
  errorCode: CombatPresentationErrorCode | null,
): string {
  switch (errorCode) {
    case "webgl2-unsupported":
      return "combat.availability.webgl2_unsupported";
    case "renderer-init-failed":
      return "combat.availability.renderer_init_failed";
    case "resource-prepare-failed":
      return "combat.availability.resource_prepare_failed";
    case "context-restore-failed":
      return "combat.availability.context_restore_failed";
    default:
      return "combat.availability.failed_detail";
  }
}

export const CombatAvailabilityOverlay: React.FC<
  CombatAvailabilityOverlayProps
> = ({ state, onRefresh, onReturnDesign }) => {
  if (
    state.status === "idle" ||
    state.status === "ready" ||
    state.status === "disposed"
  )
    return null;

  let titleKey = "combat.availability.loading_title";
  let detailKey = "combat.availability.loading_detail";
  if (state.status === "context-lost") {
    titleKey = "combat.availability.context_lost_title";
    detailKey = "combat.availability.context_lost_detail";
  } else if (state.status === "restoring") {
    titleKey = "combat.availability.restoring_title";
    detailKey = "combat.availability.restoring_detail";
  } else if (state.status === "failed") {
    titleKey = "combat.availability.failed_title";
    detailKey = failureDetailKey(state.errorCode);
  }

  const failed = state.status === "failed";
  return (
    <Modal
      title={i18n.t(titleKey)}
      eyebrow="战场资源"
      width="small"
      role={failed ? "alertdialog" : "dialog"}
      footer={
        failed || onReturnDesign ? (
          <>
            {onReturnDesign && (
              <Button onClick={onReturnDesign}>返回舰船设计</Button>
            )}
            {failed && (
              <Button variant="primary" onClick={onRefresh}>
                {i18n.t("combat.availability.refresh")}
              </Button>
            )}
          </>
        ) : undefined
      }
    >
      <div aria-busy={!failed} className="ui-stack">
        <Notice tone={failed ? "danger" : "info"}>{i18n.t(detailKey)}</Notice>
        {failed && detailKey !== "combat.availability.failed_detail" && (
          <p className="ui-muted">
            {i18n.t("combat.availability.failed_detail")}
          </p>
        )}
      </div>
    </Modal>
  );
};
