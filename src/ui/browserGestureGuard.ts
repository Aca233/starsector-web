/** Cancel browser defaults without swallowing the game's own mouse/gesture events. */
export function installBrowserGestureGuard(root: HTMLElement): () => void {
  const controller = new AbortController();
  const options = { capture: true, passive: false, signal: controller.signal };
  // Run before document/body capture listeners (including cooperative extensions).
  // The body also contains portaled dialogs, but a narrower root stays scoped.
  const eventRoot = root.ownerDocument.defaultView ?? root;
  const belongsToRoot = (event: Event): boolean => event.composedPath().includes(root);
  const isTextEntry = (target: EventTarget | null): boolean => target instanceof Element && (
    Boolean(target.closest('input, textarea, select, [role="textbox"]')) ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
  const preventDefault = (event: Event) => {
    if (belongsToRoot(event)) event.preventDefault();
  };

  eventRoot.addEventListener('contextmenu', event => {
    // Keep native editing menus, but not the browser menu over the game/HUD.
    if (belongsToRoot(event) && !isTextEntry(event.target)) event.preventDefault();
  }, options);
  eventRoot.addEventListener('dragstart', event => {
    if (belongsToRoot(event) && !isTextEntry(event.target) &&
      !(event.target instanceof Element && event.target.closest('[draggable="true"]'))) {
      event.preventDefault();
    }
  }, options);
  eventRoot.addEventListener('wheel', (event: WheelEvent) => {
    // Trackpad pinch is delivered as Ctrl+wheel in Chromium/Firefox.
    // Ordinary wheel events must still reach camera zoom and scrolling panels.
    if (belongsToRoot(event) && (event.ctrlKey || event.metaKey)) event.preventDefault();
  }, options);
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    eventRoot.addEventListener(type, preventDefault, options);
  }
  const preventMouseNavigation = (event: MouseEvent) => {
    if (!belongsToRoot(event)) return;
    const target = event.target;
    const textEntry = isTextEntry(target);
    const middleAutoscroll = event.button === 1 && !textEntry &&
      !(target instanceof Element && target.closest('a[href]'));
    const rightGesture = event.button === 2 && !textEntry;
    // Cancel right-button defaults from press through release, not only the menu.
    // Browser-owned/extension gestures may still bypass page cancellation.
    if (rightGesture || middleAutoscroll || event.button === 3 || event.button === 4) event.preventDefault();
  };
  eventRoot.addEventListener('mousedown', preventMouseNavigation, options);
  eventRoot.addEventListener('mouseup', preventMouseNavigation, options);
  eventRoot.addEventListener('auxclick', preventMouseNavigation, options);
  eventRoot.addEventListener('mousemove', (event: MouseEvent) => {
    if (belongsToRoot(event) && (event.buttons & 2) !== 0 && !isTextEntry(event.target)) event.preventDefault();
  }, options);
  // Do not cancel pointerdown: that suppresses compatibility mouse events used
  // by combat, and do not stop propagation: game and React handlers still own them.

  return () => controller.abort();
}
