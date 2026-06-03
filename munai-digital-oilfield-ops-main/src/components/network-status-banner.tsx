import { WifiOff } from "lucide-react";
import { useNetworkStatus } from "@/lib/network-status";

export function NetworkStatusBanner() {
  const { offline } = useNetworkStatus();

  if (!offline) return null;

  return (
    <div
      className="shrink-0 px-4 py-2 text-sm flex items-center justify-center gap-2 border-b bg-destructive/15 text-destructive border-destructive/30"
      role="status"
    >
      <WifiOff className="h-4 w-4 shrink-0" />
      Нет интернета — показаны сохранённые данные. Отправка отчётов недоступна.
    </div>
  );
}
