import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authApi } from "@/lib/api";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Восстановление пароля — MUNAI" }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    const normalizedEmail = email.trim();
    if (!/\S+@\S+\.\S+/.test(normalizedEmail)) {
      setError("Введите корректный email");
      return;
    }

    setLoading(true);
    try {
      await authApi.resetPassword(normalizedEmail);
      setSent(true);
      toast.success("Ссылка для сброса пароля отправлена");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Не удалось отправить письмо";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10 bg-background munai-grad">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-5 rounded-2xl border border-border bg-card p-8 shadow-soft"
      >
        <Link to="/" className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-xl bg-primary grid place-items-center text-primary-foreground font-bold">
            M
          </div>
          <span className="font-bold text-xl">MUNAI</span>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Восстановление пароля</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Введите email — Supabase отправит ссылку для сброса.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="reset-email">Email</Label>
          <Input
            id="reset-email"
            type="email"
            className="h-11"
            placeholder="you@munai.kz"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={loading || sent}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          {sent && (
            <p className="text-xs text-success">
              Письмо отправлено. Проверьте почту и вернитесь в MUNAI после смены пароля.
            </p>
          )}
        </div>
        <Button type="submit" className="w-full h-11" disabled={loading || sent}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Отправка...
            </>
          ) : sent ? (
            "Ссылка отправлена"
          ) : (
            "Отправить ссылку"
          )}
        </Button>
        <p className="text-sm text-center text-muted-foreground">
          <Link to="/login" className="text-primary font-medium hover:underline">
            Вернуться ко входу
          </Link>
        </p>
      </form>
    </div>
  );
}
