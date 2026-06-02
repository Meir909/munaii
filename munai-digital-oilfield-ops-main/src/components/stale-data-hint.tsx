import { RefreshCw } from "lucide-react";

/** Показывается, когда данные из кэша и идёт фоновое обновление */
/** Показывается при фоновом обновлении, когда на экране уже есть кэшированные данные */
export function StaleDataHint({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-2">
      <RefreshCw className="h-3 w-3 animate-spin" />
      Обновляем данные…
    </p>
  );
}
