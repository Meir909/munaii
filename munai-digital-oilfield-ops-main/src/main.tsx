import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import "./styles.css";
import { getRouter } from "./router";
import { createQueryClient, persistOptions } from "./lib/query-client";

const queryClient = createQueryClient();
const router = getRouter(queryClient);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <RouterProvider router={router} />
    </PersistQueryClientProvider>
  </StrictMode>,
);
