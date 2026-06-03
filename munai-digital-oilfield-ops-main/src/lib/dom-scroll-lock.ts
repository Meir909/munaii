/** True when a modal dialog/drawer is still open. */
function hasOpenModalOverlay() {
  if (typeof document === "undefined") return false;

  return Boolean(
    document.querySelector(
      [
        '[data-radix-dialog-overlay][data-state="open"]',
        '[data-radix-alert-dialog-overlay][data-state="open"]',
        '[data-vaul-drawer-wrapper][data-state="open"]',
        '[role="dialog"][data-state="open"]',
        '[role="alertdialog"][data-state="open"]',
      ].join(", "),
    ),
  );
}

/** Clear stale Radix / react-remove-scroll locks left after dialogs unmount. */
export function releaseStaleScrollLock() {
  if (typeof document === "undefined") return;
  if (hasOpenModalOverlay()) return;

  const { body, documentElement } = document;

  body.style.pointerEvents = "";
  body.style.overflow = "";
  body.style.paddingRight = "";
  body.style.position = "";
  body.style.top = "";
  body.style.left = "";
  body.style.right = "";
  body.style.width = "";
  body.style.marginRight = "";

  documentElement.style.overflow = "";
  documentElement.style.paddingRight = "";

  body.removeAttribute("data-scroll-locked");
  body.removeAttribute("data-radix-scroll-lock-scrollbar-size");
  body.removeAttribute("inert");
}

/** Run after Radix close animations / state updates finish. */
export function scheduleReleaseStaleScrollLock() {
  if (typeof window === "undefined") return;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => releaseStaleScrollLock());
  });
}
