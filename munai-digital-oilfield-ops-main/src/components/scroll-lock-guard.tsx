import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { scheduleReleaseStaleScrollLock } from "@/lib/dom-scroll-lock";

/** Releases orphaned body scroll/pointer locks after route changes. */
export function ScrollLockGuard() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    scheduleReleaseStaleScrollLock();
  }, [pathname]);

  return null;
}
