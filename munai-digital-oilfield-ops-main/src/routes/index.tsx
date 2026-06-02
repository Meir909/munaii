import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Droplets,
  Sparkles,
  Map,
  ShieldCheck,
  BarChart3,
  Mic,
  Users,
  Building2,
  Target,
  Handshake,
  Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MUNAI — AI Digital Oilfield Operations Platform" },
      {
        name: "description",
        content:
          "MUNAI — AI-платформа для нефтегазовых компаний Казахстана: скважины, отчёты, карта, обучение.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="h-16 px-6 md:px-10 flex items-center border-b border-border bg-background/80 backdrop-blur sticky top-0 z-30">
        <Link to="/" className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-primary grid place-items-center text-primary-foreground font-bold">
            M
          </div>
          <span className="font-bold tracking-tight text-lg">MUNAI</span>
        </Link>
        <nav className="ml-auto flex items-center gap-2">
          <Link to="/login">
            <Button variant="ghost">Войти</Button>
          </Link>
          <Link to="/register">
            <Button>Начать</Button>
          </Link>
        </nav>
      </header>

      <section className="munai-grad px-6 md:px-10 pt-20 pb-24">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider px-3 py-1.5 rounded-full bg-accent text-accent-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" /> AI Digital Oilfield Platform
          </div>
          <h1 className="mt-6 text-5xl md:text-7xl font-bold tracking-tight leading-[1.05]">
            Один экран. <br className="hidden md:block" />
            <span className="text-primary">Весь промысел.</span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            MUNAI заменяет бумажные журналы, Excel и устаревшие системы единой AI-платформой для
            управления скважинами, отчётами и операционной аналитикой на месторождениях Казахстана.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link to="/login">
              <Button size="lg" className="h-12 px-7 text-base">
                Открыть демо <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="outline" className="h-12 px-7 text-base">
                Войти в систему
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* О проекте */}
      <section className="px-6 md:px-10 py-20 border-t border-border">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-start">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold flex items-center gap-2">
              <Target className="h-8 w-8 text-primary" /> Цель проекта MUNAI
            </h2>
            <p className="mt-4 text-muted-foreground leading-relaxed text-lg">
              Сделать работу оператора на скважине простой и безопасной: меньше бумаги, меньше
              ошибок, быстрее решения. Руководитель видит всё месторождение на одной карте и
              получает отчёты с AI-проверкой до согласования.
            </p>
            <ul className="mt-6 space-y-3 text-base">
              {[
                "Сократить ручной ввод данных на 80–90%",
                "AI создаёт и проверяет суточные отчёты",
                "Прозрачные уведомления для всей смены",
                "Обучение прямо в системе — понятно любому возрасту",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-primary font-bold">✓</span> {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Handshake className="h-5 w-5 text-primary" /> С кем мы на связи
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Платформа ориентирована на нефтегазовые компании Мангистау и западного Казахстана,
              подрядчиков по добыче, сервисные организации и региональные НИИ. Интеграция с
              Supabase, OpenAI и облачным деплоем на Vercel.
            </p>
            <h3 className="font-semibold text-lg flex items-center gap-2 pt-2">
              <Building2 className="h-5 w-5 text-primary" /> Кому помогаем
            </h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                "Операторы на скважине",
                "Менеджеры участка",
                "Директора по добыче",
                "Служба безопасности",
                "Инженеры-технологи",
                "Администраторы IT",
              ].map((who) => (
                <div key={who} className="rounded-lg bg-muted/50 px-3 py-2">
                  {who}
                </div>
              ))}
            </div>
            <div className="rounded-xl bg-primary/10 border border-primary/20 p-4 mt-2">
              <div className="text-sm font-medium text-primary">Оценка стартапа (MVP)</div>
              <div className="text-2xl font-bold mt-1">$120 000 – $250 000</div>
              <p className="text-xs text-muted-foreground mt-1">
                Pre-seed / pilot stage · SaaS для 1–3 месторождений · сильный AI-слой и отраслевой UX
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Роли */}
      <section className="px-6 md:px-10 py-20 border-t border-border bg-muted/20">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center flex items-center justify-center gap-2">
            <Users className="h-8 w-8 text-primary" /> Роли в системе
          </h2>
          <div className="mt-10 grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                role: "Оператор",
                desc: "Отчёты, карта своих скважин, AI-отчёт, обучение",
                color: "border-success/40",
              },
              {
                role: "Менеджер",
                desc: "Согласования, AI-оценки 0–100, команда, календарь",
                color: "border-primary/40",
              },
              {
                role: "Директор",
                desc: "KPI, аналитика, аудит, стратегические решения",
                color: "border-info/40",
              },
              {
                role: "Админ",
                desc: "Пользователи, настройки, полный доступ",
                color: "border-warning/40",
              },
            ].map((r) => (
              <div key={r.role} className={`rounded-2xl border-2 ${r.color} bg-card p-5`}>
                <div className="font-bold text-lg">{r.role}</div>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{r.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 md:px-10 py-20 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center">Все функции MUNAI</h2>
          <div className="mt-12 grid md:grid-cols-3 gap-5">
            {[
              {
                icon: Mic,
                t: "Голосовые отчёты",
                d: "Оператор диктует параметры — MUNAI заполняет форму.",
              },
              {
                icon: Bot,
                t: "AI-отчёты",
                d: "AI сам создаёт суточный отчёт с оценкой качества и «AI-отчётности» 0–100.",
              },
              {
                icon: Sparkles,
                t: "AI-валидация",
                d: "Каждый отчёт проверяется на аномалии до согласования менеджером.",
              },
              {
                icon: Map,
                t: "GIS-карта",
                d: "24+ скважин на карте Узеня, управление параметрами, уведомления всем.",
              },
              {
                icon: Droplets,
                t: "Скважины",
                d: "CRUD, статусы, давления, добыча, история замеров.",
              },
              {
                icon: ShieldCheck,
                t: "Согласования",
                d: "Менеджер видит AI score и AI-оценку отчёта, одобряет или отклоняет.",
              },
              {
                icon: BarChart3,
                t: "KPI и дашборд",
                d: "Добыча, тренды, статусы скважин в реальном времени.",
              },
              {
                icon: Users,
                t: "Обучение",
                d: "Пошаговые курсы с крупным текстом и простыми вопросами.",
              },
              {
                icon: Building2,
                t: "Аудит и календарь",
                d: "Журнал действий, плановые осмотры и совещания.",
              },
            ].map((f) => (
              <div
                key={f.t}
                className="rounded-2xl border border-border bg-card p-6 hover:shadow-elevated transition"
              >
                <div className="h-11 w-11 rounded-xl bg-accent grid place-items-center">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{f.t}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 md:px-10 py-20 border-t border-border bg-muted/30">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold">Готовы увидеть MUNAI в действии?</h2>
          <p className="mt-3 text-muted-foreground text-lg">
            Демо: operator@munai.kz / пароль demo
          </p>
          <Link to="/login">
            <Button size="lg" className="mt-7 h-12 px-7">
              Запустить демо
            </Button>
          </Link>
        </div>
      </section>

      <footer className="px-6 md:px-10 py-8 border-t border-border text-sm text-muted-foreground flex flex-wrap items-center justify-between gap-2">
        <div>© 2026 MUNAI. AI Digital Oilfield Operations Platform.</div>
        <div className="flex gap-4">
          <Link to="/login">Войти</Link>
          <Link to="/register">Регистрация</Link>
        </div>
      </footer>
    </div>
  );
}
