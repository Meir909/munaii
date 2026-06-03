import { QueryClient, type DefaultOptions } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import localforage from "localforage";

const PERSIST_KEYS = new Set([
  "wells",
  "wells-map",
  "reports",
  "reports-pending",
  "dashboard-stats",
  "notifications",
  "ai-insights",
]);

export function getDefaultQueryOptions(): DefaultOptions {
  return {
    queries: {
      staleTime: 5 * 60_000,
      gcTime: 24 * 60 * 60_000,
      retry: 1,
      retryDelay: 1000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      networkMode: "always",
    },
    mutations: {
      retry: 1,
      retryDelay: 1000,
      networkMode: "always",
    },
  };
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: getDefaultQueryOptions(),
  });
}

export const queryPersister = createAsyncStoragePersister({
  storage: {
    getItem: async (key) => {
      const v = await localforage.getItem<string>(key);
      return v ?? null;
    },
    setItem: async (key, value) => {
      await localforage.setItem(key, value);
    },
    removeItem: async (key) => {
      await localforage.removeItem(key);
    },
  },
  key: "munai-rq-cache-v1",
  throttleTime: 2000,
});

export const persistOptions = {
  persister: queryPersister,
  maxAge: 24 * 60 * 60 * 1000,
  dehydrateOptions: {
    shouldDehydrateQuery: (query: { queryKey: readonly unknown[] }) => {
      const root = query.queryKey[0];
      return typeof root === "string" && PERSIST_KEYS.has(root);
    },
  },
};
