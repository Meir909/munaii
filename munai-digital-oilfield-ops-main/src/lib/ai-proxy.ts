import { isSupabaseConfigured, supabase } from "./supabase";
import { fetchWithRetry } from "./fetch-retry";
import type { ApiWell } from "./api";

const BASE_URL =
  import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:8000/api" : "/api");

export interface AiReportDraft {
  temperature: number;
  production24h: number;
  tubing_internal_p: number;
  tubing_external_p: number;
  annulus_p: number;
  pump_strokes: number;
  comment: string;
  summary: string;
  ai_score: number;
  ai_confidence: number;
  flag: string | null;
  ai_generated: boolean;
}

export interface VoiceParsedFields {
  well_code: string | null;
  temperature: number | null;
  production24h: number | null;
  tubing_internal_p: number | null;
  tubing_external_p: number | null;
  annulus_p: number | null;
  pump_strokes: number | null;
  comment: string | null;
}

export interface AiUsage {
  total_tokens: number;
  total_cost_usd: number;
  budget_usd: number;
  max_tokens: number;
  tokens_remaining: number;
  budget_remaining_usd: number;
  blocked: boolean;
  block_reason: string | null;
  usage_percent_tokens: number;
  usage_percent_budget: number;
}

async function authHeaders(json = true): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";

  if (isSupabaseConfigured()) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      headers.Authorization = `Bearer ${data.session.access_token}`;
    }
  } else {
    const token = localStorage.getItem("munai_token");
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function parseError(res: Response): Promise<string> {
  let msg = `Ошибка ${res.status}`;
  try {
    const data = await res.json();
    msg = data.detail ?? data.message ?? msg;
  } catch {
    // ignore
  }
  return typeof msg === "string" ? msg : JSON.stringify(msg);
}

export const aiProxy = {
  /** OpenAI Whisper: audio → text */
  transcribe: async (audio: Blob, filename = "voice.webm"): Promise<string> => {
    const form = new FormData();
    form.append("file", audio, filename);
    const res = await fetchWithRetry(`${BASE_URL}/ai/transcribe`, {
      method: "POST",
      headers: await authHeaders(false),
      body: form,
    });
    if (!res.ok) throw new Error(await parseError(res));
    const data = (await res.json()) as { text: string };
    return data.text;
  },

  /** GPT: text → report fields */
  parseVoice: async (text: string, wells: ApiWell[]): Promise<VoiceParsedFields> => {
    const res = await fetchWithRetry(`${BASE_URL}/ai/parse-voice`, {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({
        text,
        wells: wells.map((w) => ({
          id: w.id,
          code: w.code,
          name: w.name,
          status: w.status,
          product: w.product,
          production24h: w.production24h,
          temperature: w.temperature,
          tubing_internal_p: w.tubing_internal_p,
          tubing_external_p: w.tubing_external_p,
          annulus_p: w.annulus_p,
          pump_strokes: w.pump_strokes,
          operator_id: w.operator_id,
        })),
      }),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<VoiceParsedFields>;
  },

  /** GPT: generate full report draft (saved to Supabase on client) */
  generateReportDraft: async (
    wellId: string,
    well: ApiWell,
    note?: string,
  ): Promise<AiReportDraft> => {
    const res = await fetchWithRetry(`${BASE_URL}/ai/generate-report-draft`, {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({
        well_id: wellId,
        note,
        well: {
          id: well.id,
          code: well.code,
          name: well.name,
          status: well.status,
          product: well.product,
          production24h: well.production24h,
          temperature: well.temperature,
          tubing_internal_p: well.tubing_internal_p,
          tubing_external_p: well.tubing_external_p,
          annulus_p: well.annulus_p,
          pump_strokes: well.pump_strokes,
          operator_id: well.operator_id,
        },
      }),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<AiReportDraft>;
  },

  chat: async (message: string) => {
    const res = await fetchWithRetry(`${BASE_URL}/ai/chat`, {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ message }),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<{
      reply: string;
      suggestions: string[];
      ai_blocked?: boolean;
      usage?: AiUsage;
    }>;
  },

  usage: async () => {
    const res = await fetchWithRetry(`${BASE_URL}/ai/usage`, {
      headers: await authHeaders(),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<AiUsage>;
  },

  insights: async () => {
    const res = await fetchWithRetry(`${BASE_URL}/ai/insights`, {
      headers: await authHeaders(),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<{
      insights: Array<{ tone: string; title: string; desc: string }>;
      suggestions: string[];
    }>;
  },
};
