import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { releaseStaleScrollLock } from "@/lib/dom-scroll-lock";

/**
 * Releases orphaned body scroll/pointer locks after navigation.
 * Avoids a document-wide MutationObserver — that blocked the main thread during scroll.
 */
export function ScrollLockGuard() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    releaseStaleScrollLock();
  }, [pathname]);

  useEffect(() => {
    releaseStaleScrollLock();

    const onVisible = () => {
      if (document.visibilityState === "visible") releaseStaleScrollLock();
    };

    window.addEventListener("focus", releaseStaleScrollLock);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.removeEventListener("focus", releaseStaleScrollLock);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
