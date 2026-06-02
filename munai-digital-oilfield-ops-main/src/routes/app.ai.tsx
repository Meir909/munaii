import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";

const AIPage = lazy(() => import("@/pages/ai-page"));

export const Route = createFileRoute("/app/ai")({
  head: () => ({ meta: [{ title: "AI-аналитика — MUNAI" }] }),
  component: AiRoute,
});

function AiRoute() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AIPage />
    </Suspense>
  );
}
