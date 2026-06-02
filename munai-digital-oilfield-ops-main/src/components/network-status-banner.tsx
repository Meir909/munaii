import { WifiOff, Gauge } from "lucide-react";
import { useNetworkStatus } from "@/lib/network-status";
import { useIsFetching } from "@tanstack/react-query";

export function NetworkStatusBanner() {
  const { offline, slow, liteMode } = useNetworkStatus();
  const fetching = useIsFetching();

  if (!offline && !slow && fetching === 0) return null;

  return (
    <div
      className={`shrink-0 px-4 py-2 text-sm flex items-center justify-center gap-2 border-b ${
        offline
          ? "bg-destructive/15 text-destructive border-destructive/30"
          : slow
            ? "bg-warning/15 text-warning-foreground border-warning/30"
            : "bg-muted text-muted-foreground border-border"
      }`}
      role="status"
    >
      {offline ? (
        <>
          <WifiOff className="h-4 w-4 shrink-0" />
          Нет интернета — показаны сохранённые данные. Отправка отчётов недоступна.
        </>
      ) : slow ? (
        <>
          <Gauge className="h-4 w-4 shrink-0" />
          Медленное соединение — данные из кэша, обновление в фоне
          {liteMode ? " · упрощённая карта" : ""}
        </>
      ) : (
        <>
          <Gauge className="h-4 w-4 shrink-0 animate-pulse" />
          Обновление данных…
        </>
      )}
    </div>
  );
}
