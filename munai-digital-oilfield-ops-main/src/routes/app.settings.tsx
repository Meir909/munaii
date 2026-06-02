import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useI18n, type Lang } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/settings")({
  head: () => ({ meta: [{ title: "Настройки — MUNAI" }] }),
  component: SettingsPage,
});

function readBoolSetting(key: string, fallback: boolean) {
  const value = localStorage.getItem(key);
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function SettingsPage() {
  const { lang, setLang } = useI18n();
  const { theme, toggle } = useTheme();
  const [pushEnabled, setPushEnabled] = useState(() =>
    readBoolSetting("munai_push_notifications", true),
  );
  const [aiValidation, setAiValidation] = useState(() =>
    readBoolSetting("munai_ai_validation", true),
  );

  const updatePush = (value: boolean) => {
    setPushEnabled(value);
    localStorage.setItem("munai_push_notifications", String(value));
    toast.success(value ? "Push-уведомления включены" : "Push-уведомления отключены");
  };

  const updateAiValidation = (value: boolean) => {
    setAiValidation(value);
    localStorage.setItem("munai_ai_validation", String(value));
    toast.success(value ? "AI-валидация включена" : "AI-валидация отключена");
  };

  const updateLang = (nextLang: Lang) => {
    setLang(nextLang);
    toast.success(`Язык интерфейса: ${nextLang.toUpperCase()}`);
  };

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-5">
      <h1 className="text-3xl md:text-4xl font-bold">Настройки</h1>
      <div className="rounded-2xl border border-border bg-card p-6 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label>Тёмная тема</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Переключить визуальное оформление
            </p>
          </div>
          <Switch checked={theme === "dark"} onCheckedChange={toggle} />
        </div>
        <div>
          <Label className="mb-2 block">Язык интерфейса</Label>
          <div className="flex gap-2">
            {(["ru", "kz", "en"] as Lang[]).map((item) => (
              <Button
                key={item}
                type="button"
                variant={lang === item ? "default" : "outline"}
                onClick={() => updateLang(item)}
                className="h-11 uppercase"
              >
                {item}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label>Push-уведомления</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Получать уведомления о важных событиях
            </p>
          </div>
          <Switch checked={pushEnabled} onCheckedChange={updatePush} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label>AI-валидация по умолчанию</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Проверять все новые отчёты автоматически
            </p>
          </div>
          <Switch checked={aiValidation} onCheckedChange={updateAiValidation} />
        </div>
      </div>
    </div>
  );
}
