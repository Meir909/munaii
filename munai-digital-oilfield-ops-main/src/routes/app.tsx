import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { TopBar } from "@/components/top-bar";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { useEffect } from "react";
import { useAuthStore } from "@/lib/store";
import { notificationsApi } from "@/lib/api";
import { useNotifStore } from "@/lib/store";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { NetworkStatusBanner } from "@/components/network-status-banner";
import { useNetworkStatus } from "@/lib/network-status";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/app")({
  beforeLoad: async ({ location }) => {
    if (location.pathname === "/app" || location.pathname === "/app/") {
      throw redirect({ to: "/app/dashboard" });
    }
    const token = typeof window !== "undefined" ? localStorage.getItem("munai_token") : null;
    if (token) return;

    const session = isSupabaseConfigured() ? (await supabase.auth.getSession()).data.session : null;
    if (!session) {
      throw redirect({ to: "/login" });
    }
  },
  component: AppLayout,
});

function AppLayout() {
  const { token } = useAuthStore();
  const nav = useNavigate();
  const { setNotifications } = useNotifStore();
  const { offline } = useNetworkStatus();

  const { data: notifications } = useQuery({
    queryKey: ["notifications"],
    queryFn: notificationsApi.list,
    enabled: Boolean(token) && !offline,
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  useEffect(() => {
    if (notifications) setNotifications(notifications);
  }, [notifications, setNotifications]);

  useEffect(() => {
    if (!token) nav({ to: "/login" });
  }, [token, nav]);

  if (!token) return null;

  return (
    <div className="min-h-screen flex bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <NetworkStatusBanner />
        <main className="flex-1 min-w-0 pb-20 md:pb-0">
          <Outlet />
        </main>
        <MobileBottomNav />
      </div>
    </div>
  );
}
