import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CircleHelp, CheckCircle2 } from "lucide-react";
import {
  getFeatureHelp,
  markFeatureHelpSeen,
  type FeatureHelpId,
} from "@/lib/feature-help";
import type { Role } from "@/lib/session";
import { releaseStaleScrollLock } from "@/lib/dom-scroll-lock";

type Props = {
  featureId: FeatureHelpId;
  role: Role;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function FeatureHelpDialog({ featureId, role, open, onOpenChange }: Props) {
  const content = getFeatureHelp(featureId, role);

  useEffect(() => {
    if (open && !content) onOpenChange(false);
  }, [open, content, onOpenChange]);

  useEffect(() => {
    if (!open) {
      const id = window.requestAnimationFrame(() => releaseStaleScrollLock());
      return () => window.cancelAnimationFrame(id);
    }

    return () => {
      window.requestAnimationFrame(() => releaseStaleScrollLock());
    };
  }, [open]);

  if (!content) return null;

  const handleClose = (next: boolean) => {
    if (!next) markFeatureHelpSeen(featureId, role);
    onOpenChange(next);
    if (!next) window.requestAnimationFrame(() => releaseStaleScrollLock());
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <CircleHelp className="h-6 w-6 shrink-0" />
            <DialogTitle className="text-xl leading-snug">{content.title}</DialogTitle>
          </div>
          <DialogDescription className="text-base pt-1">{content.subtitle}</DialogDescription>
        </DialogHeader>

        <ol className="space-y-3 text-base leading-relaxed list-decimal list-inside">
          {content.steps.map((step, i) => (
            <li key={i} className="pl-1">
              {step}
            </li>
          ))}
        </ol>

        {content.tip && (
          <div className="rounded-xl bg-accent border border-border p-4 text-sm leading-relaxed">
            <strong className="text-primary">Совет: </strong>
            {content.tip}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            className="w-full h-12 text-base"
            onClick={() => handleClose(false)}
          >
            <CheckCircle2 className="h-5 w-5 mr-2" />
            Понятно, начать работу
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Кнопка «?» чтобы открыть справку снова */
export function FeatureHelpButton({
  featureId,
  role,
  className,
}: {
  featureId: FeatureHelpId;
  role: Role;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={className}
        onClick={() => setOpen(true)}
        aria-label="Справка"
      >
        <CircleHelp className="h-4 w-4 mr-1" />
        Справка
      </Button>
      <FeatureHelpDialog featureId={featureId} role={role} open={open} onOpenChange={setOpen} />
    </>
  );
}
