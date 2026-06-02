import { Sparkles, Bot } from "lucide-react";

/** Показывает качество отчёта (ai_score) и «AI-ность» (ai_confidence) для менеджера. */
export function AiScoreBadge({
  aiScore,
  aiConfidence = 0,
  aiGenerated = false,
  compact = false,
}: {
  aiScore: number;
  aiConfidence?: number;
  aiGenerated?: boolean;
  compact?: boolean;
}) {
  const qualityTone =
    aiScore >= 80 ? "text-success" : aiScore >= 50 ? "text-warning-foreground" : "text-destructive";
  const aiTone =
    aiConfidence >= 85 ? "text-primary" : aiConfidence >= 60 ? "text-muted-foreground" : "text-muted-foreground";

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className={`flex items-center gap-0.5 font-medium ${qualityTone}`}>
          <Sparkles className="h-3 w-3" /> {aiScore}
        </span>
        {aiConfidence > 0 && (
          <span className={`flex items-center gap-0.5 ${aiTone}`} title="Насколько отчёт сформирован AI">
            <Bot className="h-3 w-3" /> {aiConfidence}%
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <div
        className={`rounded-lg border border-border px-3 py-2 min-w-[120px] ${
          aiScore >= 80 ? "bg-success/10" : aiScore >= 50 ? "bg-warning/10" : "bg-destructive/10"
        }`}
      >
        <div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1">
          <Sparkles className="h-3 w-3" /> Качество замера
        </div>
        <div className={`text-xl font-bold ${qualityTone}`}>{aiScore}/100</div>
      </div>
      <div
        className={`rounded-lg border border-border px-3 py-2 min-w-[120px] ${
          aiGenerated ? "bg-primary/10 border-primary/30" : "bg-muted/50"
        }`}
      >
        <div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1">
          <Bot className="h-3 w-3" /> AI-отчётность
        </div>
        <div className={`text-xl font-bold ${aiTone}`}>
          {aiConfidence > 0 ? `${aiConfidence}/100` : "—"}
        </div>
        {aiGenerated && (
          <div className="text-[10px] text-primary font-medium mt-0.5">Создан AI</div>
        )}
      </div>
    </div>
  );
}
