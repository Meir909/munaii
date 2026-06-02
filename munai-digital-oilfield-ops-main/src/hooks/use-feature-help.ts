import { useEffect, useState } from "react";
import { hasSeenFeatureHelp, type FeatureHelpId } from "@/lib/feature-help";
import type { Role } from "@/lib/session";

/** Показывает справку при первом заходе на функцию для данной роли */
export function useFeatureHelp(featureId: FeatureHelpId, role: Role, enabled = true) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setOpen(false);
      return;
    }
    if (!hasSeenFeatureHelp(featureId, role)) {
      const t = window.setTimeout(() => setOpen(true), 400);
      return () => window.clearTimeout(t);
    }
  }, [featureId, role, enabled]);

  return { open, setOpen };
}
