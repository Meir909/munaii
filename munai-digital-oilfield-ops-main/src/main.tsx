import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import "./styles.css";
import { getRouter } from "./router";
import { createQueryClient, persistOptions } from "./lib/query-client";
import { detectSlowNetwork } from "./lib/network-status";

const queryClient = createQueryClient(detectSlowNetwork());
const router = getRouter(queryClient);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <RouterProvider router={router} />
    </PersistQueryClientProvider>
  </StrictMode>,
);
