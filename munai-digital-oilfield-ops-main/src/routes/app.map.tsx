import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { wellsApi, type ApiWell } from "@/lib/api";
import { useSession } from "@/lib/session";
import {
  Crosshair,
  Loader2,
  MapPin,
  Plus,
  RotateCcw,
  Save,
  Search,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { useFeatureHelp } from "@/hooks/use-feature-help";
import { FeatureHelpDialog, FeatureHelpButton } from "@/components/feature-help-dialog";
import { useNetworkStatus } from "@/lib/network-status";
import { pollIntervalMs } from "@/lib/query-client";

export const Route = createFileRoute("/app/map")({
  head: () => ({ meta: [{ title: "Карта скважин - MUNAI" }] }),
  component: MapPage,
});

const colorByStatus: Record<string, string> = {
  active: "var(--color-success)",
  warning: "var(--color-warning)",
  inactive: "var(--color-muted-foreground)",
  broken: "var(--color-destructive)",
};

const statusLabels: Record<string, string> = {
  active: "Активные",
  warning: "Внимание",
  broken: "Авария",
  inactive: "Неактивные",
};

const tileSize = 256;
const DEFAULT_CENTER = { lat: 43.663, lng: 52.905 };

function lonLatToTile(lng: number, lat: number, zoom: number) {
  const latRad = (lat * Math.PI) / 180;
  const scale = 2 ** zoom;
  return {
    x: ((lng + 180) / 360) * scale,
    y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale,
  };
}

function tileToLonLat(x: number, y: number, zoom: number) {
  const scale = 2 ** zoom;
  const lng = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lng };
}

function getMapCenter(wells: ApiWell[]) {
  if (!wells.length) return DEFAULT_CENTER;
  return {
    lat: wells.reduce((sum, well) => sum + well.lat, 0) / wells.length,
    lng: wells.reduce((sum, well) => sum + well.lng, 0) / wells.length,
  };
}

type WellParams = {
  production24h: string;
  temperature: string;
  tubing_internal_p: string;
  tubing_external_p: string;
  annulus_p: string;
  pump_strokes: string;
  status: ApiWell["status"];
  note: string;
};

function wellToParams(well: ApiWell): WellParams {
  return {
    production24h: String(well.production24h),
    temperature: String(well.temperature),
    tubing_internal_p: String(well.tubing_internal_p),
    tubing_external_p: String(well.tubing_external_p),
    annulus_p: String(well.annulus_p),
    pump_strokes: String(well.pump_strokes),
    status: well.status,
    note: "",
  };
}

function MapPage() {
  const { user, role } = useSession();
  const mapHelp = useFeatureHelp("map.controls", role);
  const { liteMode, slow } = useNetworkStatus();
  const queryClient = useQueryClient();
  const mapRef = useRef<HTMLDivElement>(null);

  const [selected, setSelected] = useState<ApiWell | null>(null);
  const [params, setParams] = useState<WellParams | null>(null);
  const [zoom, setZoom] = useState(12);
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [centerLocked, setCenterLocked] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number; lat: number; lng: number } | null>(null);
  const panFrame = useRef<number | null>(null);
  const panDelta = useRef({ dx: 0, dy: 0 });

  const { data: wells = [], isLoading } = useQuery({
    queryKey: ["wells-map"],
    queryFn: () => wellsApi.list(),
    refetchInterval: pollIntervalMs(15_000, slow),
  });

  useEffect(() => {
    if (!centerLocked && wells.length) {
      setCenter(getMapCenter(wells));
      setCenterLocked(true);
    }
  }, [wells, centerLocked]);

  useEffect(() => {
    if (selected) setParams(wellToParams(selected));
  }, [selected]);

  const filteredWells = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return wells.filter((well) => {
      const matchesStatus = statusFilter === "all" || well.status === statusFilter;
      const matchesSearch =
        !needle ||
        well.code.toLowerCase().includes(needle) ||
        well.name.toLowerCase().includes(needle);
      return matchesStatus && matchesSearch;
    });
  }, [wells, statusFilter, search]);

  const canEditWell = useCallback(
    (well: ApiWell) => {
      if (["manager", "director", "admin"].includes(role)) return true;
      if (role === "operator") return well.operator_id === user.id;
      return false;
    },
    [role, user.id],
  );

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!selected || !params) throw new Error("Скважина не выбрана");
      return wellsApi.adjustParams(selected.id, {
        production24h: Number(params.production24h),
        temperature: Number(params.temperature),
        tubing_internal_p: Number(params.tubing_internal_p),
        tubing_external_p: Number(params.tubing_external_p),
        annulus_p: Number(params.annulus_p),
        pump_strokes: Number(params.pump_strokes),
        status: params.status,
        note: params.note || undefined,
      });
    },
    onSuccess: (updated) => {
      setSelected(updated);
      queryClient.invalidateQueries({ queryKey: ["wells-map"] });
      queryClient.invalidateQueries({ queryKey: ["wells"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success(`Параметры ${updated.code} сохранены — уведомление отправлено всем`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const projected = useMemo(() => {
    const centerTile = lonLatToTile(center.lng, center.lat, zoom);
    const viewport = { width: 920, height: 575 };
    return filteredWells.map((well) => {
      const point = lonLatToTile(well.lng, well.lat, zoom);
      return {
        ...well,
        mapX: viewport.width / 2 + (point.x - centerTile.x) * tileSize,
        mapY: viewport.height / 2 + (point.y - centerTile.y) * tileSize,
      };
    });
  }, [center.lat, center.lng, filteredWells, zoom]);

  const tiles = useMemo(() => {
    const centerTile = lonLatToTile(center.lng, center.lat, zoom);
    const baseX = Math.floor(centerTile.x);
    const baseY = Math.floor(centerTile.y);
    const centerOffsetX = (centerTile.x - baseX) * tileSize;
    const centerOffsetY = (centerTile.y - baseY) * tileSize;
    const items: Array<{
      key: string;
      left: number;
      top: number;
      url: string;
    }> = [];

    for (let dx = -3; dx <= 3; dx += 1) {
      for (let dy = -3; dy <= 3; dy += 1) {
        const x = baseX + dx;
        const y = baseY + dy;
        if (x < 0 || y < 0 || y >= 2 ** zoom) continue;
        const wrappedX = ((x % 2 ** zoom) + 2 ** zoom) % 2 ** zoom;
        items.push({
          key: `${zoom}-${wrappedX}-${y}`,
          left: 460 + dx * tileSize - centerOffsetX,
          top: 287.5 + dy * tileSize - centerOffsetY,
          url: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${y}.png`,
        });
      }
    }
    return items;
  }, [center.lat, center.lng, zoom]);

  const panByPixels = useCallback(
    (dx: number, dy: number) => {
      const centerTile = lonLatToTile(center.lng, center.lat, zoom);
      const next = tileToLonLat(
        centerTile.x - dx / tileSize,
        centerTile.y - dy / tileSize,
        zoom,
      );
      setCenter(next);
    },
    [center.lat, center.lng, zoom],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-well-pin]")) return;
    dragStart.current = { x: e.clientX, y: e.clientY, lat: center.lat, lng: center.lng };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || !dragStart.current) return;
    panDelta.current.dx += e.clientX - dragStart.current.x;
    panDelta.current.dy += e.clientY - dragStart.current.y;
    dragStart.current = { x: e.clientX, y: e.clientY, lat: center.lat, lng: center.lng };

    if (panFrame.current !== null) return;
    panFrame.current = window.requestAnimationFrame(() => {
      panFrame.current = null;
      const { dx, dy } = panDelta.current;
      panDelta.current = { dx: 0, dy: 0 };
      if (dx !== 0 || dy !== 0) panByPixels(dx, dy);
    });
  };

  const onPointerUp = () => {
    if (panFrame.current !== null) {
      window.cancelAnimationFrame(panFrame.current);
      panFrame.current = null;
    }
    if (panDelta.current.dx !== 0 || panDelta.current.dy !== 0) {
      panByPixels(panDelta.current.dx, panDelta.current.dy);
      panDelta.current = { dx: 0, dy: 0 };
    }
    setDragging(false);
    dragStart.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.min(15, Math.max(8, z + (e.deltaY < 0 ? 1 : -1))));
  };

  const flyToWell = (well: ApiWell) => {
    setSelected(well);
    setCenter({ lat: well.lat, lng: well.lng });
    setZoom(14);
  };

  const resetView = () => {
    setCenter(getMapCenter(wells));
    setZoom(12);
    setStatusFilter("all");
    setSearch("");
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-5">
      <FeatureHelpDialog
        featureId="map.controls"
        role={role}
        open={mapHelp.open}
        onOpenChange={mapHelp.setOpen}
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold">GIS-карта скважин</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Месторождение Узень · {filteredWells.length} из {wells.length} скважин · перетаскивайте
            карту, управляйте параметрами
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FeatureHelpButton featureId="map.controls" role={role} />
          <Button variant="outline" size="icon" onClick={resetView} aria-label="Сбросить вид">
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setZoom((value) => Math.max(8, value - 1))}
            aria-label="Уменьшить масштаб"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <div className="h-10 min-w-14 rounded-md border border-border grid place-items-center text-sm font-semibold">
            z{zoom}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setZoom((value) => Math.min(15, value + 1))}
            aria-label="Увеличить масштаб"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 h-9"
            placeholder="Поиск UZ-101..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {(["all", "active", "warning", "broken", "inactive"] as const).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(status)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs border transition ${
              statusFilter === status
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border hover:bg-muted"
            }`}
          >
            {status !== "all" && (
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: colorByStatus[status] }}
              />
            )}
            {status === "all" ? "Все" : statusLabels[status]}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div
          ref={mapRef}
          className={`lg:col-span-2 relative rounded-lg border border-border bg-card overflow-hidden touch-none ${
            dragging ? "cursor-grabbing" : "cursor-grab"
          }`}
          style={{ aspectRatio: "16/10" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onWheel={onWheel}
        >
          <div className="absolute inset-0 bg-muted" />
          {!liteMode &&
            tiles.map((tile) => (
              <img
                key={tile.key}
                src={tile.url}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
                className="absolute h-64 w-64 select-none pointer-events-none"
                style={{ left: tile.left, top: tile.top }}
              />
            ))}
          {liteMode && (
            <div className="absolute bottom-14 left-3 text-xs bg-card/90 backdrop-blur px-3 py-1.5 rounded-md border border-border pointer-events-none z-10">
              Упрощённая карта — без подложки OSM (экономия трафика)
            </div>
          )}
          <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(to_right,oklch(0_0_0/.08)_1px,transparent_1px),linear-gradient(to_bottom,oklch(0_0_0/.08)_1px,transparent_1px)] [background-size:64px_64px]" />
          <div className="absolute top-3 left-3 text-xs bg-card/90 backdrop-blur px-3 py-1.5 rounded-md border border-border flex items-center gap-2 pointer-events-none">
            <Crosshair className="h-3.5 w-3.5" />
            {center.lat.toFixed(5)}, {center.lng.toFixed(5)}
          </div>
          <div className="absolute top-3 right-3 text-[11px] bg-card/90 backdrop-blur px-3 py-1.5 rounded-md border border-border pointer-events-none">
            Колёсико — zoom · Drag — перемещение
          </div>
          <a
            className="absolute bottom-3 right-3 text-[11px] bg-card/90 backdrop-blur px-2 py-1 rounded border border-border z-10"
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            © OpenStreetMap
          </a>
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/30 backdrop-blur-sm z-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
          {projected.map((well) => (
            <button
              key={well.id}
              data-well-pin
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                flyToWell(well);
              }}
              className={`absolute -translate-x-1/2 -translate-y-full group z-10 ${
                selected?.id === well.id ? "scale-125" : ""
              }`}
              style={{ left: well.mapX, top: well.mapY }}
              aria-label={well.code}
            >
              <MapPin
                className="h-7 w-7 drop-shadow"
                fill={colorByStatus[well.status]}
                style={{ color: colorByStatus[well.status] }}
              />
              {(well.status === "warning" || well.status === "broken") && (
                <span
                  className="absolute left-1/2 top-4 h-4 w-4 -translate-x-1/2 rounded-full animate-ping opacity-70"
                  style={{ background: colorByStatus[well.status] }}
                />
              )}
              <span className="absolute left-6 top-1/2 -translate-y-1/2 text-[10px] font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 transition bg-card border border-border px-2 py-0.5 rounded">
                {well.code}
              </span>
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-border bg-card p-5 max-h-[640px] overflow-y-auto">
          {selected && params ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-lg">{selected.code}</div>
                  <div className="text-xs text-muted-foreground">{selected.name}</div>
                </div>
                <StatusBadge status={selected.status} />
              </div>

              <div className="text-xs text-muted-foreground rounded-lg bg-muted/50 p-2">
                {selected.lat.toFixed(5)}, {selected.lng.toFixed(5)} ·{" "}
                {selected.operator_name ?? "не назначен"}
              </div>

              {canEditWell(selected) ? (
                <div className="space-y-3 border-t border-border pt-3">
                  <div className="text-sm font-semibold">Управление параметрами</div>
                  <p className="text-[11px] text-muted-foreground">
                    Изменения видны всем пользователям через уведомления
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ["production24h", "Добыча м³/24ч"],
                      ["temperature", "Температура °C"],
                      ["tubing_internal_p", "P внутри НКТ"],
                      ["tubing_external_p", "P снаружи НКТ"],
                      ["annulus_p", "Затрубное P"],
                      ["pump_strokes", "Качаний/мин"],
                    ].map(([key, label]) => (
                      <div key={key}>
                        <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
                        <Input
                          className="h-9 mt-1"
                          type="number"
                          step="0.1"
                          value={params[key as keyof WellParams]}
                          onChange={(e) =>
                            setParams((p) => (p ? { ...p, [key]: e.target.value } : p))
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Статус</Label>
                    <Select
                      value={params.status}
                      onValueChange={(v) =>
                        setParams((p) => (p ? { ...p, status: v as ApiWell["status"] } : p))
                      }
                    >
                      <SelectTrigger className="h-9 mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Активная</SelectItem>
                        <SelectItem value="warning">Внимание</SelectItem>
                        <SelectItem value="inactive">Неактивная</SelectItem>
                        <SelectItem value="broken">Авария</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">
                      Комментарий к изменению
                    </Label>
                    <Input
                      className="h-9 mt-1"
                      placeholder="Например: корректировка после осмотра"
                      value={params.note}
                      onChange={(e) =>
                        setParams((p) => (p ? { ...p, note: e.target.value } : p))
                      }
                    />
                  </div>
                  <Button
                    className="w-full h-11"
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                  >
                    {saveMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Сохранить и уведомить всех
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ["Добыча/24ч", `${selected.production24h} м³`],
                    ["Температура", `${selected.temperature} °C`],
                    ["P внутри НКТ", `${selected.tubing_internal_p} атм`],
                    ["P снаружи НКТ", `${selected.tubing_external_p} атм`],
                    ["Затрубное", `${selected.annulus_p} атм`],
                    ["Качаний/мин", `${selected.pump_strokes}`],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-muted/50 p-3">
                      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
                      <div className="text-sm font-semibold mt-0.5">{value}</div>
                    </div>
                  ))}
                </div>
              )}

              {selected.last_report && (
                <div className="text-xs text-muted-foreground">
                  Последний замер: {selected.last_report}
                </div>
              )}
              <Link
                to="/app/reports/new"
                onClick={() => localStorage.setItem("munai_prefill_well_id", selected.id)}
              >
                <Button variant="outline" className="w-full h-11">
                  <Plus className="h-4 w-4 mr-2" /> Создать отчёт
                </Button>
              </Link>
            </div>
          ) : (
            <div className="text-center text-sm text-muted-foreground py-12">
              Выберите скважину на карте
              <br />
              <span className="text-xs mt-2 block">
                Оператор может менять параметры своих скважин прямо здесь
              </span>
            </div>
          )}
        </div>
      </div>

      {filteredWells.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {filteredWells.slice(0, 12).map((well) => (
            <button
              key={well.id}
              type="button"
              onClick={() => flyToWell(well)}
              className="text-xs px-3 py-1.5 rounded-full border border-border bg-card hover:bg-muted transition"
            >
              <span
                className="inline-block h-2 w-2 rounded-full mr-1.5"
                style={{ background: colorByStatus[well.status] }}
              />
              {well.code}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
