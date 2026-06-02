import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";

const KpiPage = lazy(() => import("@/pages/kpi-page"));

export const Route = createFileRoute("/app/kpi")({
  head: () => ({ meta: [{ title: "KPI — MUNAI" }] }),
  component: KpiRoute,
});

function KpiRoute() {
  return (
    <Suspense fallback={<PageSkeleton variant="dashboard" />}>
      <KpiPage />
    </Suspense>
  );
}
