import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { toast } from "sonner";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/supabase";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Вход - MUNAI" }] }),
  component: LoginPage,
});

const demoAccounts = [
  { label: "Оператор", email: "operator@munai.kz" },
  { label: "Менеджер", email: "manager@munai.kz" },
  { label: "Директор", email: "director@munai.kz" },
  { label: "Админ", email: "admin@munai.kz" },
];

function LoginPage() {
  const nav = useNavigate();
  const { setAuth } = useAuthStore();
  const [email, setEmail] = useState("operator@munai.kz");
  const [password, setPassword] = useState("demo1234");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const signIn = async (nextEmail = email, nextPassword = password) => {
    setError("");
    if (!nextEmail.trim() || !nextPassword.trim()) {
      setError("Введите email и пароль");
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.login(nextEmail.trim(), nextPassword);
      setAuth(res.access_token, res.user);
      toast.success(`Добро пожаловать, ${res.user.name.split(" ")[0]}!`);
      nav({ to: "/app/dashboard" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Ошибка входа";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void signIn();
  };

  const handleDemo = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword("demo1234");
    void signIn(demoEmail, "demo1234");
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex flex-1 bg-sidebar text-sidebar-foreground p-12 flex-col justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-xl bg-primary grid place-items-center text-primary-foreground font-bold">
            M
          </div>
          <span className="font-bold text-xl">MUNAI</span>
        </Link>
        <div>
          <h2 className="text-4xl font-bold tracking-tight">
            AI Digital Oilfield Operations Platform
          </h2>
          <p className="mt-4 text-sidebar-foreground/70 max-w-md">
            Единая система для управления нефтегазовыми операциями: скважины, отчеты, роли,
            уведомления и AI-анализ.
          </p>
        </div>
        <div className="text-xs text-sidebar-foreground/50">2026 MUNAI</div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-5">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="h-10 w-10 rounded-xl bg-primary grid place-items-center text-primary-foreground font-bold">
              M
            </div>
            <span className="font-bold text-xl">MUNAI</span>
          </div>
          <div>
            <h1 className="text-3xl font-bold">Вход в MUNAI</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Вход через Supabase Auth. AI и голос работают через OpenAI на сервере.
            </p>
          </div>
          {!isSupabaseConfigured() && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              Задайте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в файле .env (см. SETUP.md).
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11"
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Пароль</Label>
              <Link to="/forgot-password" className="text-xs text-primary hover:underline">
                Забыли?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11"
              disabled={loading}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full h-11 text-base" disabled={loading}>
            {loading ? "Вход..." : "Войти"}
          </Button>

          <div className="space-y-2 rounded-lg bg-muted/60 p-3">
            <div className="text-xs font-medium text-muted-foreground">
              Быстрый вход, пароль: demo1234
            </div>
            <div className="grid grid-cols-2 gap-2">
              {demoAccounts.map((account) => (
                <Button
                  key={account.email}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  disabled={loading}
                  onClick={() => handleDemo(account.email)}
                >
                  {account.label}
                </Button>
              ))}
            </div>
          </div>

          <p className="text-sm text-center text-muted-foreground">
            Нет аккаунта?{" "}
            <Link to="/register" className="text-primary font-medium hover:underline">
              Регистрация
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
