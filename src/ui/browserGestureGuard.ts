/** Cancel browser defaults without swallowing the game's own mouse/gesture events. */
export function installBrowserGestureGuard(root: HTMLElement): () => void {
  const controller = new AbortController();
  const options = { capture: true, passive: false, signal: controller.signal };
  const isTextEntry = (target: EventTarget | null): boolean => target instanceof Element && (
    Boolean(target.closest('input, textarea, select')) ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
  const preventDefault = (event: Event) => event.preventDefault();

  root.addEventListener('contextmenu', event => {
    // Keep native editing menus, but not the browser menu over the game/HUD.
    if (!isTextEntry(event.target)) event.preventDefault();
  }, options);
  root.addEventListener('dragstart', event => {
    if (!isTextEntry(event.target) && !(event.target instanceof Element && event.target.closest('[draggable="true"]'))) {
      event.preventDefault();
    }
  }, options);
  root.addEventListener('wheel', event => {
    // Trackpad pinch is delivered as Ctrl+wheel in Chromium/Firefox.
    // Ordinary wheel events must still reach camera zoom and scrolling panels.
    if (event.ctrlKey || event.metaKey) event.preventDefault();
  }, options);
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    root.addEventListener(type, preventDefault, options);
  }
  const preventMouseNavigation = (event: MouseEvent) => {
    const target = event.target;
    const middleAutoscroll = event.button === 1 && !isTextEntry(target) &&
      !(target instanceof Element && target.closest('a[href]'));
    // Browser-owned/extension gestures may still bypass page cancellation.
    if (middleAutoscroll || event.button === 3 || event.button === 4) event.preventDefault();
  };
  root.addEventListener('mousedown', preventMouseNavigation, options);
  root.addEventListener('mouseup', preventMouseNavigation, options);
  root.addEventListener('auxclick', preventMouseNavigation, options);

  return () => controller.abort();
}
