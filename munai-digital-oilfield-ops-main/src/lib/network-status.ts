import { useEffect, useState } from "react";

type NetworkInformation = {
  effectiveType?: "slow-2g" | "2g" | "3g" | "4g";
  saveData?: boolean;
  downlink?: number;
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
};

function getConnection(): NetworkInformation | undefined {
  return (navigator as Navigator & { connection?: NetworkInformation }).connection;
}

export function detectSlowNetwork(): boolean {
  if (!navigator.onLine) return false;
  const conn = getConnection();
  if (conn?.saveData) return true;
  const type = conn?.effectiveType;
  if (type === "slow-2g" || type === "2g" || type === "3g") return true;
  if (typeof conn?.downlink === "number" && conn.downlink > 0 && conn.downlink < 1.5) return true;
  return false;
}

export function useNetworkStatus() {
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [slow, setSlow] = useState(false);
  const [saveData, setSaveData] = useState(false);

  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
      setSlow(detectSlowNetwork());
      setSaveData(Boolean(getConnection()?.saveData));
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const conn = getConnection();
    conn?.addEventListener?.("change", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      conn?.removeEventListener?.("change", update);
    };
  }, []);

  return {
    online,
    offline: !online,
    slow,
    saveData,
    /** Упрощённый UI (без тяжёлых тайлов карты и т.п.) */
    liteMode: !online || slow || saveData,
  };
}
