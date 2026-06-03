import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { hasSeenFeatureHelp, type FeatureHelpId } from "@/lib/feature-help";
import type { Role } from "@/lib/session";

/** Показывает справку при первом заходе на функцию для данной роли */
export function useFeatureHelp(featureId: FeatureHelpId, role: Role, enabled = true) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!enabled) {
      setOpen(false);
      return;
    }
    if (!hasSeenFeatureHelp(featureId, role)) {
      const t = window.setTimeout(() => setOpen(true), 1200);
      return () => window.clearTimeout(t);
    }
  }, [featureId, role, enabled]);

  useEffect(() => () => setOpen(false), []);

  return { open, setOpen };
}
