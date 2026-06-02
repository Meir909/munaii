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

export function getDefaultQueryOptions(slowNetwork = false): DefaultOptions {
  return {
    queries: {
      staleTime: slowNetwork ? 10 * 60_000 : 5 * 60_000,
      gcTime: 24 * 60 * 60_000,
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
      refetchOnWindowFocus: !slowNetwork,
      refetchOnReconnect: true,
      networkMode: "always",
    },
    mutations: {
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15_000),
      networkMode: "always",
    },
  };
}

export function createQueryClient(slowNetwork = false) {
  return new QueryClient({
    defaultOptions: getDefaultQueryOptions(slowNetwork),
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

/** Интервалы опроса: реже при медленной сети */
export function pollIntervalMs(baseMs: number, slowNetwork: boolean) {
  return slowNetwork ? baseMs * 2 : baseMs;
}
