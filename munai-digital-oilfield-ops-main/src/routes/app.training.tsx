import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  FileText,
  GraduationCap,
  MapPin,
  Sparkles,
  CircleHelp,
  ThumbsUp,
} from "lucide-react";

export const Route = createFileRoute("/app/training")({
  head: () => ({ meta: [{ title: "Обучение — MUNAI" }] }),
  component: TrainingPage,
});

type ModuleId = "start" | "reports" | "map" | "ai" | "manager";

interface QuizOption {
  id: string;
  text: string;
  correct: boolean;
}

interface TrainingStep {
  title: string;
  body: string;
  bigTip?: string;
  visual?: "green" | "yellow" | "red" | "blue";
  link?: { to: string; label: string };
  quiz?: {
    question: string;
    options: QuizOption[];
    explain: string;
  };
}

interface TrainingModule {
  id: ModuleId;
  title: string;
  subtitle: string;
  duration: string;
  icon: typeof BookOpen;
  steps: TrainingStep[];
}

const VISUAL = {
  green: { bg: "bg-success/15 border-success/40", label: "🟢 Всё в порядке" },
  yellow: { bg: "bg-warning/15 border-warning/40", label: "🟡 Нужно внимание" },
  red: { bg: "bg-destructive/15 border-destructive/40", label: "🔴 Срочно" },
  blue: { bg: "bg-primary/10 border-primary/30", label: "ℹ️ Подсказка" },
};

const MODULES: TrainingModule[] = [
  {
    id: "start",
    title: "С чего начать",
    subtitle: "Первые 3 шага — очень просто",
    duration: "5 мин",
    icon: GraduationCap,
    steps: [
      {
        title: "Шаг 1. Войдите в систему",
        body: "Откройте MUNAI на телефоне или компьютере. Введите email и пароль, которые дал ваш менеджер. Если забыли пароль — нажмите «Забыли пароль?».",
        bigTip: "Демо для проверки: operator@munai.kz, пароль demo",
        visual: "blue",
        link: { to: "/app/dashboard", label: "Открыть главную" },
      },
      {
        title: "Шаг 2. Главная страница",
        body: "На главной вы видите цифры: сколько скважин работает, сколько нуждаются внимании, сколько отчётов ждут проверки. Большая зелёная кнопка «Новый отчёт» — для ежедневной работы.",
        visual: "green",
        link: { to: "/app/dashboard", label: "На главную" },
      },
      {
        title: "Шаг 3. Меню слева",
        body: "Слева список разделов: Отчёты, Карта, Обучение, Уведомления (колокольчик). Нажимайте крупные пункты — не нужно запоминать много кнопок.",
        quiz: {
          question: "Где создать новый отчёт?",
          options: [
            { id: "a", text: "Раздел «Отчёты» → кнопка «Новый отчёт»", correct: true },
            { id: "b", text: "В настройках телефона", correct: false },
            { id: "c", text: "Только у менеджера", correct: false },
          ],
          explain: "Правильно: Отчёты → Новый отчёт. Или кнопка на главной странице.",
        },
      },
    ],
  },
  {
    id: "reports",
    title: "Как сдать отчёт",
    subtitle: "Вручную, голосом или через AI",
    duration: "8 мин",
    icon: FileText,
    steps: [
      {
        title: "Выберите скважину",
        body: "Нажмите «Новый отчёт». В списке выберите свою скважину, например UZ-101. Если пришли с карты — скважина уже будет выбрана.",
        link: { to: "/app/reports/new", label: "Создать отчёт" },
      },
      {
        title: "Три способа заполнить",
        body: "1) AI-отчёт — система сама заполнит всё (нажмите «Создать AI-отчёт»). 2) Голосом — продиктуйте цифры. 3) Вручную — введите температуру, добычу, давление.",
        bigTip: "AI-отчёт удобен, если мало времени. Потом менеджер всё равно проверит.",
        visual: "blue",
      },
      {
        title: "Отправьте и ждите",
        body: "Нажмите «Отправить». Появится оценка AI (число от 0 до 100). Если всё хорошо — отчёт уйдёт менеджеру. Если AI нашёл проблему — придёт уведомление.",
        quiz: {
          question: "Что означает оценка AI 41 из 100?",
          options: [
            { id: "a", text: "Есть проблема — менеджер проверит", correct: true },
            { id: "b", text: "Отчёт удалён", correct: false },
            { id: "c", text: "Ничего не значит", correct: false },
          ],
          explain: "Низкая оценка — AI увидел отклонение (температура, давление и т.д.). Это нормально, менеджер поможет.",
        },
      },
    ],
  },
  {
    id: "map",
    title: "Карта скважин",
    subtitle: "Смотреть и менять параметры",
    duration: "7 мин",
    icon: MapPin,
    steps: [
      {
        title: "Откройте карту",
        body: "Раздел «Карта» показывает все скважины на местности. Зелёная точка — работает нормально. Жёлтая — внимание. Красная — авария.",
        visual: "green",
        link: { to: "/app/map", label: "Открыть карту" },
      },
      {
        title: "Как двигать карту",
        body: "Зажмите карту пальцем или мышкой и тяните — так перемещаетесь. Колёсико мыши или кнопки +/− — приблизить.",
        bigTip: "Не бойтесь «сломать» карту — всегда можно нажать круглую стрелку «Сбросить вид».",
      },
      {
        title: "Изменить параметры",
        body: "Нажмите на маркер скважины. Справа появятся цифры. Измените добычу или температуру. Нажмите «Сохранить и уведомить всех» — коллеги увидят в уведомлениях.",
        quiz: {
          question: "Жёлтый маркер на карте — это…",
          options: [
            { id: "a", text: "Скважина требует внимания", correct: true },
            { id: "b", text: "Скважина выключена навсегда", correct: false },
            { id: "c", text: "Ошибка карты", correct: false },
          ],
          explain: "Жёлтый = warning. Нужно проверить параметры или создать отчёт.",
        },
      },
    ],
  },
  {
    id: "ai",
    title: "AI-помощник",
    subtitle: "Спросить и получить ответ",
    duration: "5 мин",
    icon: Sparkles,
    steps: [
      {
        title: "Раздел AI-аналитика",
        body: "Здесь можно спросить: «Какие скважины требуют внимания?» или «Сколько отчётов на проверке?». AI отвечает по данным вашего месторождения.",
        link: { to: "/app/ai", label: "Открыть AI" },
      },
      {
        title: "AI-отчётность 0–100",
        body: "Когда отчёт создан AI, менеджер видит две оценки: качество замера (0–100) и насколько отчёт «AI-шный» (0–100). Чем выше вторая — тем больше текст сформировал AI.",
        visual: "blue",
      },
    ],
  },
  {
    id: "manager",
    title: "Для менеджера",
    subtitle: "Согласование отчётов",
    duration: "6 мин",
    icon: Calendar,
    steps: [
      {
        title: "Центр согласований",
        body: "Раздел «Согласования» — список отчётов от операторов. Смотрите две оценки AI. Если всё верно — «Одобрить». Если нет — «Отклонить» с комментарием.",
        link: { to: "/app/approvals", label: "Согласования" },
      },
      {
        title: "Календарь и команда",
        body: "В календаре создавайте осмотры и совещания. В разделе «Админ» — список пользователей (только для менеджера и выше).",
        link: { to: "/app/calendar", label: "Календарь" },
        quiz: {
          question: "AI-отчётность 94/100 означает…",
          options: [
            { id: "a", text: "Отчёт в основном создан AI", correct: true },
            { id: "b", text: "Оператор обманул систему", correct: false },
            { id: "c", text: "Отчёт нельзя одобрять", correct: false },
          ],
          explain: "Высокая AI-оценка — отчёт сгенерирован AI. Всё равно проверьте цифры глазами.",
        },
      },
    ],
  },
];

const STORAGE_KEY = "munai_training_progress_v2";

function loadProgress(): Record<ModuleId, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return { start: 0, reports: 0, map: 0, ai: 0, manager: 0 };
}

function saveProgress(progress: Record<ModuleId, number>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function TrainingPage() {
  const [progress, setProgress] = useState<Record<ModuleId, number>>(loadProgress);
  const [activeModule, setActiveModule] = useState<ModuleId | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [quizAnswer, setQuizAnswer] = useState<string | null>(null);
  const [quizOk, setQuizOk] = useState<boolean | null>(null);

  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  const module = MODULES.find((m) => m.id === activeModule);
  const step = module?.steps[stepIndex];
  const totalSteps = module?.steps.length ?? 0;

  const openModule = (id: ModuleId) => {
    setActiveModule(id);
    const mod = MODULES.find((m) => m.id === id)!;
    setStepIndex(Math.min(progress[id], mod.steps.length - 1));
    setQuizAnswer(null);
    setQuizOk(null);
  };

  const goNext = () => {
    if (!activeModule || !module || !step) return;
    if (step.quiz && quizOk !== true) return;

    const next = stepIndex + 1;
    setProgress((p) => ({ ...p, [activeModule]: Math.max(p[activeModule], next) }));
    if (next < module.steps.length) {
      setStepIndex(next);
      setQuizAnswer(null);
      setQuizOk(null);
    } else {
      setActiveModule(null);
      setStepIndex(0);
    }
  };

  const checkQuiz = (option: QuizOption) => {
    setQuizAnswer(option.id);
    setQuizOk(option.correct);
  };

  const overallPercent = Math.round(
    (Object.values(progress).reduce((a, b) => a + b, 0) /
      MODULES.reduce((a, m) => a + m.steps.length, 0)) *
      100,
  );

  if (module && step) {
    const Icon = module.icon;
    const visual = step.visual ? VISUAL[step.visual] : null;

    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
        <Button variant="ghost" size="lg" className="text-base h-12" onClick={() => setActiveModule(null)}>
          <ArrowLeft className="h-5 w-5 mr-2" /> Назад к курсам
        </Button>

        <div>
          <p className="text-base text-muted-foreground">{module.subtitle}</p>
          <h1 className="text-2xl md:text-3xl font-bold mt-1 flex items-center gap-3">
            <Icon className="h-8 w-8 text-primary shrink-0" />
            {module.title}
          </h1>
          <p className="text-lg mt-2 font-medium">
            Шаг {stepIndex + 1} из {totalSteps}
          </p>
        </div>

        <Progress value={((stepIndex + 1) / totalSteps) * 100} className="h-3" />

        <div className="rounded-2xl border-2 border-border bg-card p-6 md:p-8 space-y-5">
          <h2 className="text-xl md:text-2xl font-bold leading-snug">{step.title}</h2>
          <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">{step.body}</p>

          {visual && (
            <div className={`rounded-xl border-2 p-4 text-lg font-medium ${visual.bg}`}>
              {visual.label}
            </div>
          )}

          {step.bigTip && (
            <div className="rounded-xl bg-accent p-5 text-lg leading-relaxed border border-border">
              <strong className="text-primary">Важно: </strong>
              {step.bigTip}
            </div>
          )}

          {step.link && (
            <Link to={step.link.to}>
              <Button variant="outline" size="lg" className="h-12 text-base">
                {step.link.label}
              </Button>
            </Link>
          )}

          {step.quiz && (
            <div className="border-t-2 border-border pt-5 space-y-4">
              <div className="flex items-center gap-2 text-lg font-semibold">
                <CircleHelp className="h-6 w-6 text-primary" />
                Проверьте себя
              </div>
              <p className="text-xl font-medium">{step.quiz.question}</p>
              <div className="space-y-3">
                {step.quiz.options.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => checkQuiz(opt)}
                    className={`w-full text-left rounded-xl border-2 p-4 text-lg transition ${
                      quizAnswer === opt.id
                        ? opt.correct
                          ? "border-success bg-success/10"
                          : "border-destructive bg-destructive/10"
                        : "border-border hover:border-primary bg-muted/30"
                    }`}
                  >
                    {opt.text}
                  </button>
                ))}
              </div>
              {quizOk === true && (
                <p className="text-lg text-success flex items-center gap-2 font-medium">
                  <ThumbsUp className="h-5 w-5" /> Верно! {step.quiz.explain}
                </p>
              )}
              {quizOk === false && (
                <p className="text-lg text-destructive font-medium">{step.quiz.explain}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            variant="outline"
            size="lg"
            className="h-14 text-lg flex-1"
            disabled={stepIndex === 0}
            onClick={() => {
              setStepIndex((i) => Math.max(0, i - 1));
              setQuizAnswer(null);
              setQuizOk(null);
            }}
          >
            <ArrowLeft className="h-5 w-5 mr-2" /> Назад
          </Button>
          <Button
            size="lg"
            className="h-14 text-lg flex-1"
            onClick={goNext}
            disabled={Boolean(step.quiz) && quizOk !== true}
          >
            {stepIndex + 1 >= totalSteps ? (
              <>
                <CheckCircle2 className="h-5 w-5 mr-2" /> Готово!
              </>
            ) : (
              <>
                Дальше <ArrowRight className="h-5 w-5 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-3">
          <GraduationCap className="h-10 w-10 text-primary" />
          Обучение MUNAI
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground mt-3 leading-relaxed">
          Крупный текст, простые шаги, вопросы с ответами. Подходит для любого возраста — проходите
          в своём темпе.
        </p>
        <div className="mt-6 max-w-md">
          <div className="flex justify-between text-base mb-2">
            <span>Ваш прогресс</span>
            <span className="font-bold">{overallPercent}%</span>
          </div>
          <Progress value={overallPercent} className="h-4" />
        </div>
      </div>

      <div className="space-y-4">
        {MODULES.map((m) => {
          const done = progress[m.id];
          const pct = Math.round((done / m.steps.length) * 100);
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => openModule(m.id)}
              className="w-full text-left rounded-2xl border-2 border-border bg-card p-6 hover:border-primary transition"
            >
              <div className="flex items-start gap-4">
                <div className="h-16 w-16 rounded-2xl bg-accent grid place-items-center text-primary shrink-0">
                  <Icon className="h-8 w-8" />
                </div>
                <div className="flex-1">
                  <div className="text-xl font-bold">{m.title}</div>
                  <div className="text-base text-muted-foreground mt-1">{m.subtitle}</div>
                  <div className="text-sm text-muted-foreground mt-2">
                    {m.duration} · {m.steps.length} шагов ·{" "}
                    {pct === 100 ? "✅ Пройдено" : pct > 0 ? "В процессе" : "Не начато"}
                  </div>
                  <Progress value={pct} className="mt-3 h-2" />
                </div>
                <ArrowRight className="h-6 w-6 text-muted-foreground shrink-0 mt-4" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
