function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export type FetchRetryOptions = {
  retries?: number;
  timeoutMs?: number;
  retryOnStatuses?: number[];
};

const DEFAULT_RETRY_STATUSES = [408, 429, 500, 502, 503, 504];

/**
 * fetch с таймаутом и экспоненциальным повтором (для медленной сети).
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: FetchRetryOptions = {},
): Promise<Response> {
  const retries = options.retries ?? 3;
  const timeoutMs = options.timeoutMs ?? 45_000;
  const retryOn = options.retryOnStatuses ?? DEFAULT_RETRY_STATUSES;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(input, {
        ...init,
        signal: init?.signal ?? controller.signal,
      });
      window.clearTimeout(timeoutId);

      if (retryOn.includes(res.status) && attempt < retries - 1) {
        await sleep(Math.min(1000 * 2 ** attempt, 15_000));
        continue;
      }
      return res;
    } catch (e) {
      window.clearTimeout(timeoutId);
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < retries - 1) {
        await sleep(Math.min(1000 * 2 ** attempt, 15_000));
        continue;
      }
    }
  }

  throw lastError ?? new Error("Не удалось выполнить запрос. Проверьте интернет.");
}
