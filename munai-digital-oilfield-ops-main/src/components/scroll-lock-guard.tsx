import { useEffect } from "react";
import { releaseStaleScrollLock } from "@/lib/dom-scroll-lock";

/** Prevents the app from staying frozen when a modal unmounts without closing. */
export function ScrollLockGuard() {
  useEffect(() => {
    releaseStaleScrollLock();

    const observer = new MutationObserver(() => {
      releaseStaleScrollLock();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "data-scroll-locked"],
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
