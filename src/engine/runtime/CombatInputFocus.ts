/** DOM ownership only. Gameplay command validity stays in CombatCommands. */
export function isCombatTextEntry(target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : null;
  return !!element && ((element instanceof HTMLElement && element.isContentEditable)
    || !!element.closest('input, textarea, select, [role="textbox"], [contenteditable]:not([contenteditable="false"])'));
}
export function hasCombatModal(): boolean {
  return !!document.querySelector('[role="dialog"], [role="alertdialog"]');
}
export function hasCombatInputFocus(): boolean {
  return document.visibilityState === 'visible' && document.hasFocus()
    && !hasCombatModal() && !isCombatTextEntry(document.activeElement);
}
export function isCombatPointerUi(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest(
    'button, a, input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="button"], [data-combat-input-block]');
}
