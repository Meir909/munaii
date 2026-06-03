import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/lib/store";
import { authApi } from "@/lib/api";

export const Route = createFileRoute("/auth/confirm")({
  head: () => ({ meta: [{ title: "Подтверждение email — MUNAI" }] }),
  component: AuthConfirmPage,
});

function AuthConfirmPage() {
  const nav = useNavigate();
  const { setAuth } = useAuthStore();
  const [message, setMessage] = useState("Подтверждаем email…");

  useEffect(() => {
    let cancelled = false;

    const finish = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (cancelled) return;

      if (error) {
        setMessage(error.message);
        return;
      }

      if (data.session?.access_token && data.user?.email) {
        try {
          const user = await authApi.me();
          setAuth(data.session.access_token, user);
          setMessage("Email подтверждён. Переход в приложение…");
          nav({ to: "/app/dashboard" });
          return;
        } catch {
          setAuth(data.session.access_token, {
            id: data.user.id,
            name: data.user.user_metadata?.name ?? data.user.email,
            email: data.user.email,
            role: "operator",
            position: "",
            region: "",
            active: true,
          });
          nav({ to: "/app/dashboard" });
          return;
        }
      }

      setMessage("Ссылка обработана. Войдите с email и паролем.");
    };

    void finish();
    return () => {
      cancelled = true;
    };
  }, [nav, setAuth]);

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="max-w-md w-full space-y-4 text-center">
        <h1 className="text-2xl font-bold">Подтверждение регистрации</h1>
        <p className="text-muted-foreground">{message}</p>
        <Link to="/login" className="text-primary font-medium hover:underline">
          Перейти ко входу
        </Link>
      </div>
    </div>
  );
}
