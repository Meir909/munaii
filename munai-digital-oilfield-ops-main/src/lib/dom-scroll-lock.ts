/** Clear stale Radix scroll/pointer locks left after dialogs unmount. */
export function releaseStaleScrollLock() {
  if (typeof document === "undefined") return;

  const openOverlay = document.querySelector(
    [
      '[data-radix-dialog-overlay][data-state="open"]',
      '[data-radix-alert-dialog-overlay][data-state="open"]',
      '[data-vaul-drawer-wrapper][data-state="open"]',
    ].join(", "),
  );

  if (openOverlay) return;

  document.body.style.pointerEvents = "";
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";
  document.body.removeAttribute("data-scroll-locked");
}
