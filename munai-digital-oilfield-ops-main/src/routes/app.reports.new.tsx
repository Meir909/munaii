import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Mic,
  Upload,
  FileText,
  Image as ImageIcon,
  Sparkles,
  ChevronLeft,
  Loader2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { wellsApi, reportsApi, aiApi } from "@/lib/api";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { useSession } from "@/lib/session";
import { useFeatureHelp } from "@/hooks/use-feature-help";
import { FeatureHelpDialog, FeatureHelpButton } from "@/components/feature-help-dialog";
import { compressFilesForUpload } from "@/lib/compress-image";
import { useNetworkStatus } from "@/lib/network-status";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/app/reports/new")({
  head: () => ({ meta: [{ title: "Новый отчёт - MUNAI" }] }),
  component: NewReportPage,
});

function NewReportPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { role } = useSession();
  const [tab, setTab] = useState<"voice" | "manual" | "ai">("manual");
  const aiHelp = useFeatureHelp("reports.new.ai", role, tab === "ai");
  const voiceHelp = useFeatureHelp("reports.new.voice", role, tab === "voice");
  const manualHelp = useFeatureHelp("reports.new.manual", role, tab === "manual");
  const { offline } = useNetworkStatus();
  const [transcript, setTranscript] = useState("");
  const voice = useVoiceRecorder();
  const [wellId, setWellId] = useState("");
  const [temperature, setTemperature] = useState("");
  const [production, setProduction] = useState("");
  const [tubingIn, setTubingIn] = useState("");
  const [tubingOut, setTubingOut] = useState("");
  const [annulus, setAnnulus] = useState("");
  const [pumpStrokes, setPumpStrokes] = useState("");
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: wells = [] } = useQuery({
    queryKey: ["wells"],
    queryFn: () => wellsApi.list(),
  });

  useEffect(() => {
    const storedWellId = localStorage.getItem("munai_prefill_well_id");
    if (!storedWellId || !wells.some((well) => well.id === storedWellId)) return;
    setWellId(storedWellId);
    localStorage.removeItem("munai_prefill_well_id");
  }, [wells]);

  const generateAiReport = useMutation({
    mutationFn: () => {
      if (!wellId) throw new Error("Выберите скважину");
      return reportsApi.generateAi({ well_id: wellId, note: comment.trim() || undefined });
    },
    onSuccess: (report) => {
      qc.invalidateQueries({ queryKey: ["reports"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.success(
        `AI-отчёт создан. Качество: ${report.ai_score}/100 · AI-оценка: ${report.ai_confidence}/100`,
      );
      nav({ to: "/app/reports" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createReport = useMutation({
    mutationFn: async (body: Parameters<typeof reportsApi.create>[0]) => {
      const report = await reportsApi.create(body);
      const uploaded = files.length > 0 ? await reportsApi.uploadFiles(report.id, files) : [];
      return { report, uploadedCount: uploaded.length };
    },
    onSuccess: ({ report, uploadedCount }) => {
      qc.invalidateQueries({ queryKey: ["reports"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      if (report.flag) {
        toast.warning(`AI обнаружил: ${report.flag} (score: ${report.ai_score}/100)`);
      } else {
        toast.success(`Отчёт отправлен. AI score: ${report.ai_score}/100`);
      }
      if (uploadedCount > 0) toast.success(`Файлы сохранены в Supabase: ${uploadedCount}`);
      nav({ to: "/app/reports" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const validate = () => {
    const e: Record<string, string> = {};
    if (!wellId) e.wellId = "Выберите скважину";
    return e;
  };

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (offline) {
      toast.error("Нет интернета. Подключитесь к сети для отправки отчёта.");
      return;
    }
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    createReport.mutate({
      well_id: wellId,
      temperature: parseFloat(temperature) || undefined,
      production24h: parseFloat(production) || undefined,
      tubing_internal_p: parseFloat(tubingIn) || undefined,
      tubing_external_p: parseFloat(tubingOut) || undefined,
      annulus_p: parseFloat(annulus) || undefined,
      pump_strokes: parseInt(pumpStrokes) || undefined,
      comment: comment.trim() || undefined,
    });
  };

  const handleVoice = async () => {
    if (!voice.recording) {
      try {
        await voice.start();
        toast.info("Говорите… Нажмите снова, когда закончите.");
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Не удалось включить микрофон");
      }
      return;
    }

    voice.setProcessing(true);
    try {
      const blob = await voice.stop();
      toast.info("OpenAI Whisper распознаёт речь…");
      const text = await aiApi.transcribe(blob);
      setTranscript(text);
      toast.info("AI извлекает параметры из текста…");
      const parsed = await aiApi.parseVoice(text, wells);

      if (parsed.well_code) {
        const match = wells.find((w) => w.code === parsed.well_code);
        if (match) setWellId(match.id);
      } else if (wells.length === 1) {
        setWellId(wells[0].id);
      }

      if (parsed.temperature != null) setTemperature(String(parsed.temperature));
      if (parsed.production24h != null) setProduction(String(parsed.production24h));
      if (parsed.tubing_internal_p != null) setTubingIn(String(parsed.tubing_internal_p));
      if (parsed.tubing_external_p != null) setTubingOut(String(parsed.tubing_external_p));
      if (parsed.annulus_p != null) setAnnulus(String(parsed.annulus_p));
      if (parsed.pump_strokes != null) setPumpStrokes(String(parsed.pump_strokes));
      if (parsed.comment) setComment(parsed.comment);

      setTab("manual");
      toast.success("Голос распознан. Проверьте поля и отправьте отчёт.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Ошибка голосового ввода");
    } finally {
      voice.setProcessing(false);
    }
  };

  const pickFiles = (accept: string) => {
    if (fileInputRef.current) fileInputRef.current.accept = accept;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(ev.target.files ?? []);
    ev.target.value = "";
    if (!selected.length) return;
    const processed = await compressFilesForUpload(selected);
    const savedBytes = selected.reduce((s, f, i) => s + Math.max(0, f.size - (processed[i]?.size ?? f.size)), 0);
    if (savedBytes > 50_000) {
      toast.info("Фото сжаты для более быстрой загрузки");
    }
    setFiles((current) => {
      const all = [...current, ...processed];
      const unique = new Map(
        all.map((file) => [`${file.name}-${file.size}-${file.lastModified}`, file]),
      );
      return Array.from(unique.values());
    });
  };

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-5">
      <button
        onClick={() => nav({ to: "/app/reports" })}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> К отчётам
      </button>
      {offline && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Нет интернета — отправка отчёта недоступна. Данные на других экранах показаны из кэша.
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold">Новый отчёт</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Создайте отчёт вручную, голосом и прикрепите файлы любого формата.
          </p>
        </div>
        <FeatureHelpButton
          featureId={
            tab === "ai" ? "reports.new.ai" : tab === "voice" ? "reports.new.voice" : "reports.new.manual"
          }
          role={role}
        />
      </div>

      <FeatureHelpDialog
        featureId="reports.new.ai"
        role={role}
        open={aiHelp.open}
        onOpenChange={aiHelp.setOpen}
      />
      <FeatureHelpDialog
        featureId="reports.new.voice"
        role={role}
        open={voiceHelp.open}
        onOpenChange={voiceHelp.setOpen}
      />
      <FeatureHelpDialog
        featureId="reports.new.manual"
        role={role}
        open={manualHelp.open}
        onOpenChange={manualHelp.setOpen}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => setTab("ai")}
          className={`rounded-2xl border-2 p-5 text-left transition ${tab === "ai" ? "border-primary bg-accent" : "border-border bg-card hover:border-primary/40"}`}
        >
          <Sparkles className="h-6 w-6 text-primary" />
          <div className="font-semibold mt-3">AI-отчёт</div>
          <div className="text-xs text-muted-foreground">Создаст отчёт автоматически</div>
        </button>
        <button
          type="button"
          onClick={() => setTab("voice")}
          className={`rounded-2xl border-2 p-5 text-left transition ${tab === "voice" ? "border-primary bg-accent" : "border-border bg-card hover:border-primary/40"}`}
        >
          <Mic className="h-6 w-6 text-primary" />
          <div className="font-semibold mt-3">Голосовой ввод</div>
          <div className="text-xs text-muted-foreground">Продиктуйте параметры</div>
        </button>
        <button
          type="button"
          onClick={() => setTab("manual")}
          className={`rounded-2xl border-2 p-5 text-left transition ${tab === "manual" ? "border-primary bg-accent" : "border-border bg-card hover:border-primary/40"}`}
        >
          <FileText className="h-6 w-6 text-primary" />
          <div className="font-semibold mt-3">Заполнить форму</div>
          <div className="text-xs text-muted-foreground">Ввести параметры вручную</div>
        </button>
      </div>

      {tab === "ai" && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="space-y-2">
            <Label className="text-base">Скважина для AI-отчёта</Label>
            <Select value={wellId} onValueChange={setWellId}>
              <SelectTrigger className="h-12 text-base">
                <SelectValue placeholder="Выберите скважину..." />
              </SelectTrigger>
              <SelectContent>
                {wells.map((w) => (
                  <SelectItem key={w.id} value={w.id} className="text-base py-3">
                    {w.code} — {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.wellId && <p className="text-sm text-destructive">{errors.wellId}</p>}
          </div>
          <div className="space-y-2">
            <Label className="text-base">Заметка (необязательно)</Label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="text-base"
              placeholder="Например: после осмотра, шум насоса"
            />
          </div>
          <div className="rounded-xl bg-primary/10 border border-primary/20 p-4 text-sm leading-relaxed">
            <Sparkles className="h-5 w-5 text-primary inline mr-2" />
            AI сам заполнит параметры, напишет вывод и поставит оценку качества (0–100) и
            «AI-отчётность» (0–100). Менеджер увидит обе оценки при согласовании.
          </div>
          <Button
            className="w-full h-14 text-lg"
            disabled={offline || generateAiReport.isPending || !wellId}
            onClick={() => {
              if (offline) {
                toast.error("Нет интернета. AI-отчёт требует подключения.");
                return;
              }
              const errs = validate();
              setErrors(errs);
              if (Object.keys(errs).length === 0) generateAiReport.mutate();
            }}
          >
            {generateAiReport.isPending ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" /> AI формирует отчёт...
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5 mr-2" /> Создать AI-отчёт
              </>
            )}
          </Button>
        </div>
      )}

      {tab === "voice" && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-4">
          <button
            type="button"
            onClick={handleVoice}
            disabled={voice.processing}
            className={`mx-auto h-32 w-32 rounded-full grid place-items-center transition ${
              voice.recording
                ? "bg-primary text-primary-foreground animate-pulse"
                : "bg-accent text-primary"
            }`}
          >
            {voice.processing ? (
              <Loader2 className="h-12 w-12 animate-spin" />
            ) : (
              <Mic className="h-12 w-12" />
            )}
          </button>
          <div className="font-semibold text-lg">
            {voice.processing
              ? "Обработка через OpenAI…"
              : voice.recording
                ? "Идёт запись — нажмите ещё раз"
                : "Нажмите и говорите"}
          </div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            Пример: «Скважина UZ-104, температура 78, добыча 42, давление в НКТ 120, качаний 6».
            Распознавание: OpenAI Whisper.
          </p>
          {transcript && (
            <div className="text-left rounded-xl bg-muted/50 p-4 text-sm border border-border max-w-lg mx-auto">
              <div className="text-xs text-muted-foreground mb-1">Распознанный текст:</div>
              {transcript}
            </div>
          )}
        </div>
      )}

      {tab === "manual" && (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-border bg-card p-6 space-y-4"
        >
          <div className="space-y-2">
            <Label>Скважина</Label>
            <Select value={wellId} onValueChange={setWellId}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Выберите скважину..." />
              </SelectTrigger>
              <SelectContent>
                {wells.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.code} - {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.wellId && <p className="text-xs text-destructive">{errors.wellId}</p>}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Field
              label="Температура (C)"
              value={temperature}
              setValue={setTemperature}
              placeholder="78"
            />
            <Field
              label="Добыча за 24ч (м3)"
              value={production}
              setValue={setProduction}
              placeholder="42"
            />
            <Field
              label="P внутри НКТ (атм)"
              value={tubingIn}
              setValue={setTubingIn}
              placeholder="120"
            />
            <Field
              label="P снаружи НКТ (атм)"
              value={tubingOut}
              setValue={setTubingOut}
              placeholder="45"
            />
            <Field
              label="Затрубное давление (атм)"
              value={annulus}
              setValue={setAnnulus}
              placeholder="8"
            />
            <Field
              label="Качаний / мин"
              value={pumpStrokes}
              setValue={setPumpStrokes}
              placeholder="6"
            />
          </div>

          <div className="space-y-2">
            <Label>Комментарий</Label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="Дополнительная информация..."
            />
          </div>

          <div>
            <Label className="mb-2 block">Вложения</Label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
            <div className="grid grid-cols-3 gap-2">
              <AttachButton
                icon={Upload}
                label="PDF/Excel"
                onClick={() => pickFiles(".pdf,.xls,.xlsx,.csv")}
              />
              <AttachButton icon={ImageIcon} label="Фото" onClick={() => pickFiles("image/*")} />
              <AttachButton icon={FileText} label="Любой файл" onClick={() => pickFiles("*")} />
            </div>
            {files.length > 0 && (
              <div className="mt-3 space-y-2">
                {files.map((file, index) => (
                  <div
                    key={`${file.name}-${file.size}-${file.lastModified}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs"
                  >
                    <span className="min-w-0 truncate">{file.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-muted-foreground">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                      <button
                        type="button"
                        className="text-destructive hover:underline"
                        onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-lg bg-accent p-3">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            AI проверит отчёт на аномалии, а вложения сохранятся в Supabase Storage и таблице
            report_files.
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => nav({ to: "/app/reports" })}
            >
              Отмена
            </Button>
            <Button type="submit" className="h-11 flex-1" disabled={offline || createReport.isPending}>
              {createReport.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Отправка...
                </>
              ) : (
                "Отправить отчёт"
              )}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  setValue,
  placeholder,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-11"
        placeholder={placeholder}
      />
    </div>
  );
}

function AttachButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border-2 border-dashed border-border p-4 flex flex-col items-center gap-1 text-xs text-muted-foreground hover:border-primary hover:text-primary transition"
    >
      <Icon className="h-5 w-5" /> {label}
    </button>
  );
}
