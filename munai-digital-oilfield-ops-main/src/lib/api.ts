import { isSupabaseConfigured, supabase } from "./supabase";
import { aiProxy, type AiReportDraft, type AiUsage } from "./ai-proxy";
import {
  allUsersAdmin as mockUsersData,
  auditLog as mockAuditData,
  calendarEvents as mockCalendarData,
  demoUsers as mockDemoUsers,
  notifications as mockNotificationsData,
  productionTrend as mockProductionTrend,
  reports as mockReportsData,
  wells as mockWellsData,
  type Role as MockRole,
} from "./mock";

const BASE_URL =
  import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:8000/api" : "/api");

/** Data layer: Supabase when configured; demo store only as offline fallback. */
function useFastApi() {
  return !isSupabaseConfigured();
}

function requireSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase не настроен. Укажите VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env (см. .env.example).",
    );
  }
}

async function broadcastSupabaseNotifications(
  title: string,
  body: string,
  tone: ApiNotification["tone"] = "info",
) {
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("active", true);
  if (error || !profiles?.length) return;
  await supabase.from("notifications").insert(
    profiles.map((p) => ({
      user_id: p.id,
      icon: tone === "warning" ? "alert" : "activity",
      title,
      body,
      tone,
      unread: true,
    })),
  );
}

async function insertReportFromDraft(
  wellId: string,
  draft: AiReportDraft,
  aiGenerated: boolean,
): Promise<ApiReport> {
  const user = await currentUser();
  const status = draft.flag ? ("flagged" as const) : ("pending" as const);
  const insert = {
    well_id: wellId,
    operator_id: user.id,
    status,
    ai_score: draft.ai_score,
    ai_confidence: draft.ai_confidence,
    ai_generated: aiGenerated,
    summary: draft.summary,
    flag: draft.flag,
    temperature: draft.temperature,
    production24h: draft.production24h,
    tubing_internal_p: draft.tubing_internal_p,
    tubing_external_p: draft.tubing_external_p,
    annulus_p: draft.annulus_p,
    pump_strokes: draft.pump_strokes,
    comment: draft.comment,
  };

  const { data, error } = await supabase.from("reports").insert(insert).select("*").single<ReportRow>();
  if (error) throw new Error(error.message);

  await Promise.all([
    supabase
      .from("wells")
      .update({
        production24h: draft.production24h,
        temperature: draft.temperature,
        tubing_internal_p: draft.tubing_internal_p,
        tubing_external_p: draft.tubing_external_p,
        annulus_p: draft.annulus_p,
        pump_strokes: draft.pump_strokes,
        status: draft.flag ? "warning" : "active",
      })
      .eq("id", wellId),
    broadcastSupabaseNotifications(
      aiGenerated ? `AI-отчёт: ${(await wellsApi.get(wellId)).code}` : "Новый отчёт",
      `${user.name}: ${draft.summary.slice(0, 120)}`,
      draft.flag ? "warning" : "info",
    ),
    insertAudit(aiGenerated ? "Создал AI-отчёт" : "Создал отчёт", wellId),
  ]);

  return reportsApi.get(data.id);
}

function getToken(): string | null {
  return localStorage.getItem("munai_token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem("munai_token");
    localStorage.removeItem("munai_user");
    window.location.href = "/login";
    throw new Error("Сессия истекла. Войдите снова.");
  }

  if (!res.ok) {
    let msg = `Ошибка ${res.status}`;
    try {
      const data = await res.json();
      msg = data.detail ?? msg;
    } catch {
      // Error responses may be empty.
    }
    throw new Error(msg);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body) });
const put = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "PUT", body: JSON.stringify(body) });
const del = <T>(path: string) => request<T>(path, { method: "DELETE" });

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: "operator" | "manager" | "director" | "admin";
  position: string;
  region: string;
  active: boolean;
}

export interface ApiWell {
  id: string;
  code: string;
  name: string;
  status: "active" | "warning" | "inactive" | "broken";
  product: "oil" | "gas" | "condensate";
  production24h: number;
  temperature: number;
  tubing_internal_p: number;
  tubing_external_p: number;
  annulus_p: number;
  pump_strokes: number;
  lat: number;
  lng: number;
  operator_id: string | null;
  manager_id: string | null;
  operator_name: string | null;
  manager_name: string | null;
  last_report: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiReport {
  id: string;
  well_id: string;
  well_code: string | null;
  well_name: string | null;
  operator_id: string;
  operator_name: string | null;
  status: "pending" | "approved" | "flagged" | "rejected";
  ai_score: number;
  ai_confidence: number;
  ai_generated: boolean;
  summary: string;
  flag: string | null;
  temperature: number | null;
  production24h: number | null;
  tubing_internal_p: number | null;
  tubing_external_p: number | null;
  annulus_p: number | null;
  pump_strokes: number | null;
  comment: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface ApiReportFile {
  id: string;
  report_id: string;
  user_id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  public_url: string | null;
  created_at: string;
}

export interface ApiNotification {
  id: string;
  icon: string;
  title: string;
  body: string;
  tone: "warning" | "success" | "info" | "destructive";
  unread: boolean;
  created_at: string;
}

export interface ApiCalendarEvent {
  id: string;
  title: string;
  date: string;
  event_type: string;
  created_by: string | null;
}

export interface ApiAuditLog {
  id: string;
  who: string;
  action: string;
  target: string;
  created_at: string;
}

export interface DashboardStats {
  active_wells: number;
  warning_wells: number;
  pending_reports: number;
  flagged_reports: number;
  total_production: number;
  production_trend: Array<{ day: string; oil: number; gas: number }>;
  well_statuses: Array<{ name: string; v: number }>;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: ApiUser;
}

const demoProfiles: ApiUser[] = (
  Object.values(mockDemoUsers) as Array<(typeof mockDemoUsers)[MockRole]>
).map((user) => ({
  ...user,
  active: true,
}));

const demoExtraUsers: ApiUser[] = mockUsersData
  .filter((user) => !demoProfiles.some((profile) => profile.email === user.email))
  .map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as ApiUser["role"],
    position: user.role === "operator" ? "Оператор по добыче нефти" : "",
    region: user.role === "operator" ? "Месторождение Узень-3" : "",
    active: user.active,
  }));

const demoUsersStore: ApiUser[] = [...demoProfiles, ...demoExtraUsers];

const demoWellsStore: ApiWell[] = mockWellsData.map((well, index) => ({
  id: well.id,
  code: well.code,
  name: well.name,
  status: well.status,
  product: well.product,
  production24h: well.production24h,
  temperature: well.temperature,
  tubing_internal_p: well.tubingInternalP,
  tubing_external_p: well.tubingExternalP,
  annulus_p: well.annulusP,
  pump_strokes: well.pumpStrokes,
  lat: well.lat,
  lng: well.lng,
  operator_id: well.operatorId,
  manager_id: well.managerId,
  operator_name:
    demoUsersStore.find((user) => user.id === well.operatorId)?.name ?? "Айбек Сарсенов",
  manager_name:
    demoUsersStore.find((user) => user.id === well.managerId)?.name ?? "Дана Жумабекова",
  last_report: well.lastReport,
  created_at: new Date(Date.now() - (index + 12) * 36e5).toISOString(),
  updated_at: new Date(Date.now() - index * 36e5).toISOString(),
}));

const demoReportsStore: ApiReport[] = mockReportsData.map((report, index) => {
  const well =
    demoWellsStore.find((item) => item.code === report.wellCode) ??
    demoWellsStore[index % demoWellsStore.length];
  const operator = demoUsersStore.find((user) => user.role === "operator") ?? demoUsersStore[0];
  return {
    id: report.id,
    well_id: well.id,
    well_code: well.code,
    well_name: well.name,
    operator_id: operator.id,
    operator_name: report.operator,
    status: report.status,
    ai_score: report.aiScore,
    ai_confidence: report.aiConfidence ?? (report.aiGenerated ? 92 : 65),
    ai_generated: report.aiGenerated ?? false,
    summary: report.summary,
    flag: report.flag ?? null,
    temperature: well.temperature,
    production24h: well.production24h,
    tubing_internal_p: well.tubing_internal_p,
    tubing_external_p: well.tubing_external_p,
    annulus_p: well.annulus_p,
    pump_strokes: well.pump_strokes,
    comment: null,
    created_at: new Date(Date.now() - (index + 1) * 36e5).toISOString(),
    reviewed_at:
      report.status === "approved" ? new Date(Date.now() - index * 36e5).toISOString() : null,
  };
});

const demoNotificationsStore: ApiNotification[] = mockNotificationsData.map(
  (notification, index) => ({
    id: notification.id,
    icon: notification.icon,
    title: notification.title,
    body: notification.body,
    tone: notification.tone,
    unread: notification.unread,
    created_at: new Date(Date.now() - (index + 1) * 18e5).toISOString(),
  }),
);

const demoCalendarStore: ApiCalendarEvent[] = mockCalendarData.map((event, index) => ({
  id: event.id,
  title: event.title,
  date: new Date(Date.now() + (index + 1) * 864e5).toISOString(),
  event_type: event.type,
  created_by: "u-mg-01",
}));

const demoAuditStore: ApiAuditLog[] = mockAuditData.map((log, index) => ({
  id: log.id,
  who: log.who,
  action: log.action,
  target: log.target,
  created_at: new Date(Date.now() - (index + 1) * 72e5).toISOString(),
}));

function demoCurrentUser(): ApiUser {
  try {
    const stored = localStorage.getItem("munai_user");
    if (stored) return JSON.parse(stored) as ApiUser;
  } catch {
    // Ignore corrupted demo session data and fall back to operator.
  }
  return demoUsersStore.find((user) => user.email === "operator@munai.kz") ?? demoUsersStore[0];
}

function demoToken(role: ApiUser["role"]) {
  return `demo-token-${role}`;
}

function isDemoPassword(password: string) {
  return password === "demo1234" || password === "demo" || password === "munai";
}

type ProfileRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: ApiUser["role"] | null;
  position: string | null;
  region: string | null;
  active: boolean | null;
};

type WellRow = {
  id: string;
  code: string;
  name: string;
  status: ApiWell["status"];
  product: ApiWell["product"];
  production24h: number | null;
  temperature: number | null;
  tubing_internal_p: number | null;
  tubing_external_p: number | null;
  annulus_p: number | null;
  pump_strokes: number | null;
  lat: number | null;
  lng: number | null;
  operator_id: string | null;
  manager_id: string | null;
  created_at: string;
  updated_at: string;
};

type ReportRow = {
  id: string;
  well_id: string;
  operator_id: string;
  status: ApiReport["status"];
  ai_score: number | null;
  ai_confidence?: number | null;
  ai_generated?: boolean | null;
  summary: string | null;
  flag: string | null;
  temperature: number | null;
  production24h: number | null;
  tubing_internal_p: number | null;
  tubing_external_p: number | null;
  annulus_p: number | null;
  pump_strokes: number | null;
  comment: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

function assertSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase не настроен: добавьте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env",
    );
  }
}

function profileToUser(profile: ProfileRow, fallbackEmail = ""): ApiUser {
  const email = profile.email || fallbackEmail;
  return {
    id: profile.id,
    name: profile.name || email.split("@")[0] || "Пользователь",
    email,
    role: profile.role || "operator",
    position: profile.position || "",
    region: profile.region || "",
    active: profile.active ?? true,
  };
}

async function getProfile(userId: string, fallbackEmail: string): Promise<ApiUser> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,name,email,role,position,region,active")
    .eq("id", userId)
    .maybeSingle<ProfileRow>();

  if (error) throw new Error(error.message);
  if (!data) {
    const created: ProfileRow = {
      id: userId,
      name: fallbackEmail.split("@")[0],
      email: fallbackEmail,
      role: "operator",
      position: "",
      region: "",
      active: true,
    };
    const { error: insertError } = await supabase.from("profiles").insert(created);
    if (insertError) throw new Error(insertError.message);
    return profileToUser(created, fallbackEmail);
  }
  return profileToUser(data, fallbackEmail);
}

async function currentUser(): Promise<ApiUser> {
  if (useFastApi()) {
    const token = getToken();
    if (!token || token.startsWith("demo-token-")) return demoCurrentUser();
    return get<ApiUser>("/auth/me");
  }
  if (!isSupabaseConfigured()) return demoCurrentUser();
  assertSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message);
  if (!data.user?.email) throw new Error("Пользователь не найден");
  return getProfile(data.user.id, data.user.email);
}

function requireRole(user: ApiUser, roles: ApiUser["role"][]) {
  if (!roles.includes(user.role)) {
    throw new Error("Недостаточно прав");
  }
}

function reportQuality(data: {
  temperature?: number | null;
  production24h?: number | null;
  tubing_internal_p?: number | null;
  pump_strokes?: number | null;
}) {
  let ai_score = 100;
  let flag: string | null = null;
  const issues: string[] = [];

  if (data.temperature && data.temperature > 90) {
    ai_score -= 30;
    issues.push("критически высокая температура");
    flag = "Аномалия температуры";
  } else if (data.temperature && data.temperature > 80) {
    ai_score -= 15;
    issues.push("повышенная температура");
  }
  if (data.production24h != null && data.production24h < 10) {
    ai_score -= 20;
    issues.push("низкая суточная добыча");
  }
  if (data.tubing_internal_p && data.tubing_internal_p > 160) {
    ai_score -= 25;
    issues.push("высокое давление в НКТ");
    flag = flag || "Превышение давления";
  }
  if (data.pump_strokes != null && data.pump_strokes < 3) {
    ai_score -= 20;
    issues.push("низкая частота качания");
  }

  ai_score = Math.max(0, ai_score);
  const ai_confidence = issues.length ? 68 : 72;
  return {
    ai_score,
    ai_confidence,
    flag,
    status: flag ? ("flagged" as const) : ("pending" as const),
    summary: issues.length ? `Выявлено: ${issues.join("; ")}.` : "Параметры в норме.",
  };
}

function relativeReportTime(createdAt?: string | null) {
  if (!createdAt) return null;
  const deltaMs = Date.now() - new Date(createdAt).getTime();
  const hours = Math.max(0, Math.floor(deltaMs / 36e5));
  if (hours < 1) return "менее часа назад";
  if (hours < 24) return `${hours} ч назад`;
  return `${Math.floor(hours / 24)} д назад`;
}

async function profilesById(ids: Array<string | null | undefined>) {
  const unique = [...new Set(ids.filter(Boolean))] as string[];
  if (!unique.length) return new Map<string, ProfileRow>();
  const { data, error } = await supabase
    .from("profiles")
    .select("id,name,email,role,position,region,active")
    .in("id", unique)
    .returns<ProfileRow[]>();
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((profile) => [profile.id, profile]));
}

async function wellsById(ids: Array<string | null | undefined>) {
  const unique = [...new Set(ids.filter(Boolean))] as string[];
  if (!unique.length) return new Map<string, WellRow>();
  const { data, error } = await supabase
    .from("wells")
    .select("*")
    .in("id", unique)
    .returns<WellRow[]>();
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((well) => [well.id, well]));
}

async function latestReportTimes(wellIds: string[]) {
  if (!wellIds.length) return new Map<string, string>();
  const { data, error } = await supabase
    .from("reports")
    .select("well_id,created_at")
    .in("well_id", wellIds)
    .order("created_at", { ascending: false })
    .returns<Array<{ well_id: string; created_at: string }>>();
  if (error) throw new Error(error.message);

  const latest = new Map<string, string>();
  for (const row of data ?? []) {
    if (!latest.has(row.well_id)) latest.set(row.well_id, row.created_at);
  }
  return latest;
}

function mapWell(
  row: WellRow,
  profiles: Map<string, ProfileRow>,
  latest: Map<string, string>,
): ApiWell {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
    product: row.product,
    production24h: row.production24h ?? 0,
    temperature: row.temperature ?? 0,
    tubing_internal_p: row.tubing_internal_p ?? 0,
    tubing_external_p: row.tubing_external_p ?? 0,
    annulus_p: row.annulus_p ?? 0,
    pump_strokes: row.pump_strokes ?? 0,
    lat: row.lat ?? 50,
    lng: row.lng ?? 55,
    operator_id: row.operator_id,
    manager_id: row.manager_id,
    operator_name: row.operator_id ? (profiles.get(row.operator_id)?.name ?? null) : null,
    manager_name: row.manager_id ? (profiles.get(row.manager_id)?.name ?? null) : null,
    last_report: relativeReportTime(latest.get(row.id)),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapReport(
  row: ReportRow,
  wells: Map<string, WellRow>,
  profiles: Map<string, ProfileRow>,
): ApiReport {
  const well = wells.get(row.well_id);
  const operator = profiles.get(row.operator_id);
  return {
    id: row.id,
    well_id: row.well_id,
    well_code: well?.code ?? null,
    well_name: well?.name ?? null,
    operator_id: row.operator_id,
    operator_name: operator?.name ?? null,
    status: row.status,
    ai_score: row.ai_score ?? 0,
    ai_confidence: row.ai_confidence ?? 0,
    ai_generated: Boolean(row.ai_generated),
    summary: row.summary ?? "",
    flag: row.flag,
    temperature: row.temperature,
    production24h: row.production24h,
    tubing_internal_p: row.tubing_internal_p,
    tubing_external_p: row.tubing_external_p,
    annulus_p: row.annulus_p,
    pump_strokes: row.pump_strokes,
    comment: row.comment,
    created_at: row.created_at,
    reviewed_at: row.reviewed_at,
  };
}

async function insertAudit(action: string, target: string) {
  try {
    const user = await currentUser();
    await supabase.from("audit_logs").insert({
      who: `${user.name} (${user.role})`,
      action,
      target,
    });
  } catch {
    // Аудит не должен ломать основное действие пользователя.
  }
}

function pushDemoBroadcast(title: string, body: string, tone: ApiNotification["tone"] = "info") {
  const now = new Date().toISOString();
  demoNotificationsStore.unshift({
    id: crypto.randomUUID(),
    icon: "activity",
    title,
    body,
    tone,
    unread: true,
    created_at: now,
  });
}

export const authApi = {
  login: async (email: string, password: string): Promise<TokenResponse> => {
    if (!isSupabaseConfigured()) {
      const user = demoUsersStore.find((item) => item.email.toLowerCase() === email.toLowerCase());
      if (!user || !isDemoPassword(password)) {
        throw new Error("Для демо используйте пароль demo1234");
      }
      if (!user.active) throw new Error("Аккаунт деактивирован");
      return { access_token: demoToken(user.role), token_type: "bearer", user };
    }
    assertSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.message === "Invalid login credentials") {
        throw new Error(
          "Неверный email или пароль. Демо: operator@munai.kz / demo1234 — пользователь должен быть создан в Supabase → Authentication → Users.",
        );
      }
      throw new Error(error.message);
    }
    if (!data.session || !data.user.email) throw new Error("Сессия Supabase не создана");

    const user = await getProfile(data.user.id, data.user.email);
    if (!user.active) {
      await supabase.auth.signOut();
      throw new Error("Аккаунт деактивирован");
    }

    return { access_token: data.session.access_token, token_type: "bearer", user };
  },
  register: async (
    name: string,
    email: string,
    password: string,
    role = "operator",
    position = "",
    region = "",
  ): Promise<TokenResponse> => {
    if (!isSupabaseConfigured()) {
      const safeRole = ["operator", "manager", "director", "admin"].includes(role)
        ? (role as ApiUser["role"])
        : "operator";
      const user: ApiUser = {
        id: crypto.randomUUID(),
        name,
        email,
        role: safeRole,
        position,
        region,
        active: true,
      };
      demoUsersStore.push(user);
      return { access_token: demoToken(user.role), token_type: "bearer", user };
    }
    assertSupabase();
    const safeRole = ["operator", "manager", "director", "admin"].includes(role)
      ? (role as ApiUser["role"])
      : "operator";
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, role: safeRole, position, region } },
    });
    if (error) throw new Error(error.message);
    if (!data.user) throw new Error("Supabase не вернул пользователя");

    const profile: ProfileRow = {
      id: data.user.id,
      name,
      email,
      role: safeRole,
      position,
      region,
      active: true,
    };
    const { error: profileError } = await supabase.from("profiles").upsert(profile);
    if (profileError) throw new Error(profileError.message);

    if (!data.session) {
      throw new Error("Аккаунт создан. Подтвердите email, затем войдите в систему.");
    }

    return {
      access_token: data.session.access_token,
      token_type: "bearer",
      user: profileToUser(profile, email),
    };
  },
  resetPassword: async (email: string) => {
    if (!isSupabaseConfigured()) {
      const exists = demoUsersStore.some(
        (user) => user.email.toLowerCase() === email.toLowerCase(),
      );
      if (!exists) throw new Error("Пользователь с таким email не найден");
      return { ok: true };
    }
    const redirectTo = `${window.location.origin}/app/profile`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw new Error(error.message);
    return { ok: true };
  },
  me: currentUser,
};

export const dashboardApi = {
  stats: async (): Promise<DashboardStats> => {
    if (useFastApi()) return get<DashboardStats>("/dashboard/stats");
    if (!isSupabaseConfigured()) {
      return {
        active_wells: demoWellsStore.filter((well) => well.status === "active").length,
        warning_wells: demoWellsStore.filter(
          (well) => well.status === "warning" || well.status === "broken",
        ).length,
        pending_reports: demoReportsStore.filter((report) => report.status === "pending").length,
        flagged_reports: demoReportsStore.filter((report) => report.status === "flagged").length,
        total_production: demoWellsStore.reduce((sum, well) => sum + well.production24h, 0),
        production_trend: mockProductionTrend.map((item) => ({
          day: item.day,
          oil: item.oil,
          gas: item.gas,
        })),
        well_statuses: [
          { name: "Активные", v: demoWellsStore.filter((well) => well.status === "active").length },
          {
            name: "Внимание",
            v: demoWellsStore.filter((well) => well.status === "warning").length,
          },
          { name: "Авария", v: demoWellsStore.filter((well) => well.status === "broken").length },
          {
            name: "Неактивные",
            v: demoWellsStore.filter((well) => well.status === "inactive").length,
          },
        ],
      };
    }
    assertSupabase();
    const [wells, reports] = await Promise.all([wellsApi.list(), reportsApi.list()]);
    const total_production = wells.reduce((sum, well) => sum + well.production24h, 0);
    const byDay = new Map<string, { day: string; oil: number; gas: number }>();

    reports.forEach((report) => {
      const day = new Date(report.created_at).toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
      });
      const well = wells.find((item) => item.id === report.well_id);
      const current = byDay.get(day) ?? { day, oil: 0, gas: 0 };
      if (well?.product === "gas") current.gas += report.production24h ?? 0;
      else current.oil += report.production24h ?? 0;
      byDay.set(day, current);
    });

    return {
      active_wells: wells.filter((well) => well.status === "active").length,
      warning_wells: wells.filter((well) => well.status === "warning" || well.status === "broken")
        .length,
      pending_reports: reports.filter((report) => report.status === "pending").length,
      flagged_reports: reports.filter((report) => report.status === "flagged").length,
      total_production,
      production_trend: [...byDay.values()].slice(-7),
      well_statuses: [
        { name: "Активные", v: wells.filter((well) => well.status === "active").length },
        { name: "Внимание", v: wells.filter((well) => well.status === "warning").length },
        { name: "Авария", v: wells.filter((well) => well.status === "broken").length },
        { name: "Неактивные", v: wells.filter((well) => well.status === "inactive").length },
      ],
    };
  },
};

export const wellsApi = {
  list: async (q?: string, status?: string): Promise<ApiWell[]> => {
    if (useFastApi()) {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (status) params.set("status", status);
      const qs = params.toString();
      return get<ApiWell[]>(`/wells${qs ? `?${qs}` : ""}`);
    }
    if (!isSupabaseConfigured()) {
      const needle = q?.toLowerCase().trim();
      return demoWellsStore.filter((well) => {
        const matchesStatus = !status || status === "all" || well.status === status;
        const matchesSearch =
          !needle ||
          well.code.toLowerCase().includes(needle) ||
          well.name.toLowerCase().includes(needle);
        return matchesStatus && matchesSearch;
      });
    }
    assertSupabase();
    let query = supabase.from("wells").select("*").order("code");
    if (status && status !== "all") query = query.eq("status", status);
    if (q) query = query.or(`code.ilike.%${q}%,name.ilike.%${q}%`);

    const { data, error } = await query.returns<WellRow[]>();
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const profiles = await profilesById(rows.flatMap((row) => [row.operator_id, row.manager_id]));
    const latest = await latestReportTimes(rows.map((row) => row.id));
    return rows.map((row) => mapWell(row, profiles, latest));
  },
  get: async (id: string): Promise<ApiWell> => {
    if (useFastApi()) return get<ApiWell>(`/wells/${id}`);
    if (!isSupabaseConfigured()) {
      const well = demoWellsStore.find((item) => item.id === id);
      if (!well) throw new Error("Скважина не найдена");
      return well;
    }
    assertSupabase();
    const { data, error } = await supabase.from("wells").select("*").eq("id", id).single<WellRow>();
    if (error) throw new Error(error.message);
    const profiles = await profilesById([data.operator_id, data.manager_id]);
    const latest = await latestReportTimes([data.id]);
    return mapWell(data, profiles, latest);
  },
  adjustParams: async (
    id: string,
    body: {
      production24h?: number;
      temperature?: number;
      tubing_internal_p?: number;
      tubing_external_p?: number;
      annulus_p?: number;
      pump_strokes?: number;
      status?: ApiWell["status"];
      note?: string;
    },
  ): Promise<ApiWell> => {
    if (useFastApi()) return post<ApiWell>(`/wells/${id}/adjust`, body);

    if (isSupabaseConfigured()) {
      assertSupabase();
      const user = await currentUser();
      const existing = await wellsApi.get(id);
      if (user.role === "operator" && existing.operator_id !== user.id) {
        throw new Error("Можно управлять только своими скважинами");
      }
      const updates = Object.fromEntries(
        Object.entries(body).filter(
          ([key, val]) =>
            val !== undefined &&
            key !== "note" &&
            [
              "production24h",
              "temperature",
              "tubing_internal_p",
              "tubing_external_p",
              "annulus_p",
              "pump_strokes",
              "status",
            ].includes(key),
        ),
      );
      const { error } = await supabase.from("wells").update(updates).eq("id", id);
      if (error) throw new Error(error.message);
      const note = body.note ? ` ${body.note}` : "";
      await broadcastSupabaseNotifications(
        `Карта: ${user.name} обновил ${existing.code}`,
        `Параметры скважины изменены.${note}`,
        "info",
      );
      await insertAudit("Изменил параметры на карте", existing.code);
      return wellsApi.get(id);
    }

    const user = await currentUser();
    const index = demoWellsStore.findIndex((well) => well.id === id);
    if (index < 0) throw new Error("Скважина не найдена");
    const well = demoWellsStore[index];
    if (user.role === "operator" && well.operator_id !== user.id) {
      throw new Error("Можно управлять только своими скважинами");
    }

    const changes: string[] = [];
    const apply = (key: keyof ApiWell, label: string, val: number | string | undefined) => {
      if (val === undefined) return;
      if (well[key] !== val) changes.push(`${label}: ${well[key]} → ${val}`);
      (well as unknown as Record<string, unknown>)[key] = val;
    };
    apply("production24h", "добыча", body.production24h);
    apply("temperature", "температура", body.temperature);
    apply("tubing_internal_p", "P НКТ", body.tubing_internal_p);
    apply("tubing_external_p", "P снаружи", body.tubing_external_p);
    apply("annulus_p", "затрубное P", body.annulus_p);
    apply("pump_strokes", "качания", body.pump_strokes);
    apply("status", "статус", body.status);
    well.updated_at = new Date().toISOString();
    demoWellsStore[index] = well;
    pushDemoBroadcast(
      `Карта: ${user.name} обновил ${well.code}`,
      changes.length ? changes.join("; ") : "параметры обновлены",
      "info",
    );
    return well;
  },
  create: async (body: Partial<ApiWell>): Promise<ApiWell> => {
    if (useFastApi()) {
      const user = await currentUser();
      requireRole(user, ["manager", "director", "admin"]);
      return post<ApiWell>("/wells", body);
    }
    if (!isSupabaseConfigured()) {
      const user = await currentUser();
      requireRole(user, ["manager", "director", "admin"]);
      const now = new Date().toISOString();
      const well: ApiWell = {
        id: crypto.randomUUID(),
        code: body.code || `UZ-${100 + demoWellsStore.length + 1}`,
        name: body.name || "Новая скважина",
        status: body.status ?? "active",
        product: body.product ?? "oil",
        production24h: body.production24h ?? 0,
        temperature: body.temperature ?? 0,
        tubing_internal_p: body.tubing_internal_p ?? 0,
        tubing_external_p: body.tubing_external_p ?? 0,
        annulus_p: body.annulus_p ?? 0,
        pump_strokes: body.pump_strokes ?? 0,
        lat: body.lat ?? 43.65,
        lng: body.lng ?? 52.88,
        operator_id: body.operator_id ?? null,
        manager_id: body.manager_id ?? null,
        operator_name: body.operator_id
          ? (demoUsersStore.find((item) => item.id === body.operator_id)?.name ?? null)
          : null,
        manager_name: body.manager_id
          ? (demoUsersStore.find((item) => item.id === body.manager_id)?.name ?? null)
          : null,
        last_report: null,
        created_at: now,
        updated_at: now,
      };
      demoWellsStore.unshift(well);
      demoAuditStore.unshift({
        id: crypto.randomUUID(),
        who: `${user.name} (${user.role})`,
        action: "Создал скважину",
        target: well.code,
        created_at: now,
      });
      return well;
    }
    const user = await currentUser();
    requireRole(user, ["manager", "director", "admin"]);
    const insert = {
      code: body.code,
      name: body.name,
      status: body.status ?? "active",
      product: body.product ?? "oil",
      production24h: body.production24h ?? 0,
      temperature: body.temperature ?? 0,
      tubing_internal_p: body.tubing_internal_p ?? 0,
      tubing_external_p: body.tubing_external_p ?? 0,
      annulus_p: body.annulus_p ?? 0,
      pump_strokes: body.pump_strokes ?? 0,
      lat: body.lat ?? 43.65,
      lng: body.lng ?? 52.88,
      operator_id: body.operator_id ?? null,
      manager_id: body.manager_id ?? null,
    };
    const { data, error } = await supabase
      .from("wells")
      .insert(insert)
      .select("*")
      .single<WellRow>();
    if (error) throw new Error(error.message);
    await insertAudit("Создал скважину", data.code);
    return wellsApi.get(data.id);
  },
  update: async (id: string, body: Partial<ApiWell>): Promise<ApiWell> => {
    if (useFastApi()) {
      const user = await currentUser();
      requireRole(user, ["manager", "director", "admin"]);
      return put<ApiWell>(`/wells/${id}`, body);
    }
    if (!isSupabaseConfigured()) {
      const user = await currentUser();
      requireRole(user, ["manager", "director", "admin"]);
      const index = demoWellsStore.findIndex((well) => well.id === id);
      if (index < 0) throw new Error("Скважина не найдена");
      demoWellsStore[index] = {
        ...demoWellsStore[index],
        ...body,
        operator_name: body.operator_id
          ? (demoUsersStore.find((item) => item.id === body.operator_id)?.name ?? null)
          : demoWellsStore[index].operator_name,
        manager_name: body.manager_id
          ? (demoUsersStore.find((item) => item.id === body.manager_id)?.name ?? null)
          : demoWellsStore[index].manager_name,
        updated_at: new Date().toISOString(),
      };
      demoAuditStore.unshift({
        id: crypto.randomUUID(),
        who: `${user.name} (${user.role})`,
        action: "Обновил скважину",
        target: id,
        created_at: new Date().toISOString(),
      });
      return demoWellsStore[index];
    }
    const user = await currentUser();
    requireRole(user, ["manager", "director", "admin"]);
    const updates = Object.fromEntries(
      Object.entries(body).filter(
        ([key, value]) =>
          value !== undefined &&
          [
            "name",
            "status",
            "product",
            "production24h",
            "temperature",
            "tubing_internal_p",
            "tubing_external_p",
            "annulus_p",
            "pump_strokes",
            "lat",
            "lng",
            "operator_id",
            "manager_id",
          ].includes(key),
      ),
    );
    const { error } = await supabase.from("wells").update(updates).eq("id", id);
    if (error) throw new Error(error.message);
    await insertAudit("Обновил скважину", id);
    return wellsApi.get(id);
  },
  delete: async (id: string) => {
    if (!isSupabaseConfigured()) {
      const user = await currentUser();
      requireRole(user, ["director", "admin"]);
      const index = demoWellsStore.findIndex((well) => well.id === id);
      if (index >= 0) demoWellsStore.splice(index, 1);
      demoAuditStore.unshift({
        id: crypto.randomUUID(),
        who: `${user.name} (${user.role})`,
        action: "Удалил скважину",
        target: id,
        created_at: new Date().toISOString(),
      });
      return { ok: true };
    }
    const user = await currentUser();
    requireRole(user, ["director", "admin"]);
    const { error } = await supabase.from("wells").delete().eq("id", id);
    if (error) throw new Error(error.message);
    await insertAudit("Удалил скважину", id);
    return { ok: true };
  },
};

export const reportsApi = {
  list: async (q?: string, status?: string): Promise<ApiReport[]> => {
    if (useFastApi()) {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (status) params.set("status", status ?? "all");
      const qs = params.toString();
      return get<ApiReport[]>(`/reports${qs ? `?${qs}` : ""}`);
    }
    if (!isSupabaseConfigured()) {
      const user = await currentUser();
      const needle = q?.toLowerCase().trim();
      return demoReportsStore.filter((report) => {
        const matchesRole = user.role !== "operator" || report.operator_id === user.id;
        const matchesStatus = !status || status === "all" || report.status === status;
        const matchesSearch =
          !needle ||
          report.id.toLowerCase().includes(needle) ||
          (report.well_code ?? "").toLowerCase().includes(needle);
        return matchesRole && matchesStatus && matchesSearch;
      });
    }
    const user = await currentUser();
    let query = supabase.from("reports").select("*").order("created_at", { ascending: false });
    if (user.role === "operator") query = query.eq("operator_id", user.id);
    if (status && status !== "all") query = query.eq("status", status);

    const { data, error } = await query.returns<ReportRow[]>();
    if (error) throw new Error(error.message);

    let rows = data ?? [];
    if (q) {
      const needle = q.toLowerCase();
      rows = rows.filter(
        (row) =>
          row.id.toLowerCase().includes(needle) || row.well_id.toLowerCase().includes(needle),
      );
    }

    const wells = await wellsById(rows.map((row) => row.well_id));
    const profiles = await profilesById(rows.map((row) => row.operator_id));
    return rows.map((row) => mapReport(row, wells, profiles));
  },
  pending: async () => {
    const user = await currentUser();
    requireRole(user, ["manager", "director", "admin"]);
    return reportsApi.list(undefined, "pending");
  },
  get: async (id: string): Promise<ApiReport> => {
    if (!isSupabaseConfigured()) {
      const report = demoReportsStore.find((item) => item.id === id);
      if (!report) throw new Error("Отчёт не найден");
      return report;
    }
    assertSupabase();
    const { data, error } = await supabase
      .from("reports")
      .select("*")
      .eq("id", id)
      .single<ReportRow>();
    if (error) throw new Error(error.message);
    const wells = await wellsById([data.well_id]);
    const profiles = await profilesById([data.operator_id]);
    return mapReport(data, wells, profiles);
  },
  create: async (body: {
    well_id: string;
    temperature?: number;
    production24h?: number;
    tubing_internal_p?: number;
    tubing_external_p?: number;
    annulus_p?: number;
    pump_strokes?: number;
    comment?: string;
  }): Promise<ApiReport> => {
    if (useFastApi()) return post<ApiReport>("/reports", body);
    if (!isSupabaseConfigured()) {
      const user = await currentUser();
      const well = demoWellsStore.find((item) => item.id === body.well_id);
      if (!well) throw new Error("Скважина не найдена");
      const quality = reportQuality(body);
      const now = new Date().toISOString();
      const report: ApiReport = {
        id: crypto.randomUUID(),
        well_id: well.id,
        well_code: well.code,
        well_name: well.name,
        operator_id: user.id,
        operator_name: user.name,
        status: quality.status,
        ai_score: quality.ai_score,
        ai_confidence: quality.ai_confidence,
        ai_generated: false,
        summary: quality.summary,
        flag: quality.flag,
        temperature: body.temperature ?? null,
        production24h: body.production24h ?? null,
        tubing_internal_p: body.tubing_internal_p ?? null,
        tubing_external_p: body.tubing_external_p ?? null,
        annulus_p: body.annulus_p ?? null,
        pump_strokes: body.pump_strokes ?? null,
        comment: body.comment ?? null,
        created_at: now,
        reviewed_at: null,
      };
      demoReportsStore.unshift(report);
      Object.assign(well, {
        production24h: body.production24h ?? well.production24h,
        temperature: body.temperature ?? well.temperature,
        tubing_internal_p: body.tubing_internal_p ?? well.tubing_internal_p,
        tubing_external_p: body.tubing_external_p ?? well.tubing_external_p,
        annulus_p: body.annulus_p ?? well.annulus_p,
        pump_strokes: body.pump_strokes ?? well.pump_strokes,
        status: quality.flag ? "warning" : "active",
        last_report: "менее часа назад",
        updated_at: now,
      });
      demoAuditStore.unshift({
        id: crypto.randomUUID(),
        who: `${user.name} (${user.role})`,
        action: "Создал отчёт",
        target: well.code,
        created_at: now,
      });
      if (quality.flag) {
        pushDemoBroadcast(
          `AI: аномалия на ${well.code}`,
          `${quality.summary} (оценка ${quality.ai_score}/100)`,
          "warning",
        );
      }
      return report;
    }
    const user = await currentUser();
    const quality = reportQuality(body);
    const insert = {
      ...body,
      operator_id: user.id,
      status: quality.status,
      ai_score: quality.ai_score,
      ai_confidence: quality.ai_confidence,
      ai_generated: false,
      summary: quality.summary,
      flag: quality.flag,
    };
    const { data, error } = await supabase
      .from("reports")
      .insert(insert)
      .select("*")
      .single<ReportRow>();
    if (error) throw new Error(error.message);

    await Promise.all([
      supabase
        .from("wells")
        .update({
          production24h: body.production24h ?? 0,
          temperature: body.temperature ?? 0,
          tubing_internal_p: body.tubing_internal_p ?? 0,
          tubing_external_p: body.tubing_external_p ?? 0,
          annulus_p: body.annulus_p ?? 0,
          pump_strokes: body.pump_strokes ?? 0,
          status: quality.flag ? "warning" : "active",
        })
        .eq("id", body.well_id),
      quality.flag
        ? supabase.from("notifications").insert({
            user_id: user.id,
            icon: "alert",
            title: "AI: обнаружена аномалия",
            body: quality.flag,
            tone: "warning",
          })
        : Promise.resolve(),
      insertAudit("Создал отчет", body.well_id),
    ]);

    return reportsApi.get(data.id);
  },
  generateAi: async (body: { well_id: string; note?: string }): Promise<ApiReport> => {
    const well = useFastApi()
      ? demoWellsStore.find((item) => item.id === body.well_id)
      : await wellsApi.get(body.well_id);
    if (!well) throw new Error("Скважина не найдена");

    const user = await currentUser();
    if (user.role === "operator" && well.operator_id && well.operator_id !== user.id) {
      throw new Error("Можно создавать AI-отчёт только по своим скважинам");
    }

    let draft: AiReportDraft;
    try {
      draft = await aiProxy.generateReportDraft(body.well_id, well, body.note);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ошибка AI";
      throw new Error(
        `${msg}. Проверьте OPENAI_API_KEY в Vercel и что API /api доступен.`,
      );
    }

    if (isSupabaseConfigured()) {
      return insertReportFromDraft(body.well_id, draft, true);
    }

    const now = new Date().toISOString();
    const report: ApiReport = {
      id: crypto.randomUUID(),
      well_id: well.id,
      well_code: well.code,
      well_name: well.name,
      operator_id: user.id,
      operator_name: user.name,
      status: draft.flag ? "flagged" : "pending",
      ai_score: draft.ai_score,
      ai_confidence: draft.ai_confidence,
      ai_generated: true,
      summary: draft.summary,
      flag: draft.flag,
      temperature: draft.temperature,
      production24h: draft.production24h,
      tubing_internal_p: draft.tubing_internal_p,
      tubing_external_p: draft.tubing_external_p,
      annulus_p: draft.annulus_p,
      pump_strokes: draft.pump_strokes,
      comment: draft.comment,
      created_at: now,
      reviewed_at: null,
    };
    demoReportsStore.unshift(report);
    pushDemoBroadcast(`AI-отчёт: ${well.code}`, `AI-оценка ${draft.ai_confidence}/100`, "info");
    return report;
  },
  review: async (
    id: string,
    status: "approved" | "rejected",
    comment?: string,
  ): Promise<ApiReport> => {
    if (useFastApi()) {
      const user = await currentUser();
      requireRole(user, ["manager", "director", "admin"]);
      return post<ApiReport>(`/reports/${id}/review`, { status, comment });
    }
    if (!isSupabaseConfigured()) {
      const user = await currentUser();
      requireRole(user, ["manager", "director", "admin"]);
      const report = demoReportsStore.find((item) => item.id === id);
      if (!report) throw new Error("Отчёт не найден");
      report.status = status;
      report.reviewed_at = new Date().toISOString();
      demoNotificationsStore.unshift({
        id: crypto.randomUUID(),
        icon: status === "approved" ? "check" : "x",
        title: status === "approved" ? "Отчёт одобрен" : "Отчёт отклонён",
        body: comment || report.well_code || "",
        tone: status === "approved" ? "success" : "destructive",
        unread: true,
        created_at: new Date().toISOString(),
      });
      demoAuditStore.unshift({
        id: crypto.randomUUID(),
        who: `${user.name} (${user.role})`,
        action: status === "approved" ? "Одобрил отчёт" : "Отклонил отчёт",
        target: id,
        created_at: new Date().toISOString(),
      });
      return report;
    }
    const user = await currentUser();
    requireRole(user, ["manager", "director", "admin"]);
    const report = await reportsApi.get(id);
    const { error } = await supabase
      .from("reports")
      .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: user.id })
      .eq("id", id);
    if (error) throw new Error(error.message);

    await Promise.all([
      supabase.from("notifications").insert({
        user_id: report.operator_id,
        icon: status === "approved" ? "check" : "x",
        title: status === "approved" ? "Отчет одобрен" : "Отчет отклонен",
        body: comment || "",
        tone: status === "approved" ? "success" : "destructive",
      }),
      insertAudit(status === "approved" ? "Одобрил отчет" : "Отклонил отчет", id),
    ]);
    return reportsApi.get(id);
  },
  delete: async (id: string) => {
    if (!isSupabaseConfigured()) {
      const user = await currentUser();
      const report = demoReportsStore.find((item) => item.id === id);
      if (!report) throw new Error("Отчёт не найден");
      if (!["manager", "director", "admin"].includes(user.role) && report.operator_id !== user.id) {
        throw new Error("Недостаточно прав");
      }
      demoReportsStore.splice(demoReportsStore.indexOf(report), 1);
      demoAuditStore.unshift({
        id: crypto.randomUUID(),
        who: `${user.name} (${user.role})`,
        action: "Удалил отчёт",
        target: id,
        created_at: new Date().toISOString(),
      });
      return { ok: true };
    }
    const user = await currentUser();
    const report = await reportsApi.get(id);
    if (!["manager", "director", "admin"].includes(user.role) && report.operator_id !== user.id) {
      throw new Error("Недостаточно прав");
    }
    const { error } = await supabase.from("reports").delete().eq("id", id);
    if (error) throw new Error(error.message);
    await insertAudit("Удалил отчет", id);
    return { ok: true };
  },
  uploadFiles: async (reportId: string, files: File[]) => {
    if (!isSupabaseConfigured()) {
      const user = await currentUser();
      return files.map((file) => ({
        id: crypto.randomUUID(),
        report_id: reportId,
        user_id: user.id,
        file_name: file.name,
        file_path: `demo/${reportId}/${file.name}`,
        file_type: file.type || "application/octet-stream",
        file_size: file.size,
        public_url: null,
        created_at: new Date().toISOString(),
      }));
    }
    const user = await currentUser();
    const uploaded: ApiReportFile[] = [];
    for (const file of files) {
      const safeName = file.name.replace(/[^\w.\-а-яА-ЯёЁ]+/g, "_");
      const path = `${user.id}/${reportId}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("report-files")
        .upload(path, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
      if (uploadError) throw new Error(uploadError.message);

      const { data: publicData } = supabase.storage.from("report-files").getPublicUrl(path);
      const { data, error: insertError } = await supabase
        .from("report_files")
        .insert({
          report_id: reportId,
          user_id: user.id,
          file_name: file.name,
          file_path: path,
          file_type: file.type || "application/octet-stream",
          file_size: file.size,
          public_url: publicData.publicUrl,
        })
        .select(
          "id,report_id,user_id,file_name,file_path,file_type,file_size,public_url,created_at",
        )
        .single<ApiReportFile>();
      if (insertError) throw new Error(insertError.message);
      uploaded.push(data);
    }
    return uploaded;
  },
};

export const usersApi = {
  list: async (): Promise<ApiUser[]> => {
    if (!isSupabaseConfigured()) {
      const user = await currentUser();
      requireRole(user, ["manager", "director", "admin"]);
      return demoUsersStore;
    }
    const user = await currentUser();
    requireRole(user, ["manager", "director", "admin"]);
    const { data, error } = await supabase
      .from("profiles")
      .select("id,name,email,role,position,region,active")
      .order("name")
      .returns<ProfileRow[]>();
    if (error) throw new Error(error.message);
    return (data ?? []).map((profile) => profileToUser(profile));
  },
  create: async (body: {
    name: string;
    email: string;
    password: string;
    role: string;
    position?: string;
    region?: string;
  }) => {
    if (!isSupabaseConfigured()) {
      const user = await currentUser();
      requireRole(user, ["admin"]);
      const profile: ApiUser = {
        id: crypto.randomUUID(),
        name: body.name,
        email: body.email,
        role: ["operator", "manager", "director", "admin"].includes(body.role)
          ? (body.role as ApiUser["role"])
          : "operator",
        position: body.position ?? "",
        region: body.region ?? "",
        active: true,
      };
      demoUsersStore.push(profile);
      demoAuditStore.unshift({
        id: crypto.randomUUID(),
        who: `${user.name} (${user.role})`,
        action: "Создал пользователя",
        target: body.email,
        created_at: new Date().toISOString(),
      });
      return profile;
    }
    const user = await currentUser();
    requireRole(user, ["admin"]);
    const currentSession = (await supabase.auth.getSession()).data.session;
    const { data, error } = await supabase.auth.signUp({
      email: body.email,
      password: body.password,
      options: {
        data: {
          name: body.name,
          role: body.role,
          position: body.position ?? "",
          region: body.region ?? "",
        },
      },
    });
    if (error) throw new Error(error.message);
    if (!data.user) throw new Error("Supabase не создал пользователя");
    if (currentSession) {
      await supabase.auth.setSession({
        access_token: currentSession.access_token,
        refresh_token: currentSession.refresh_token,
      });
    }
    const profile: ProfileRow = {
      id: data.user.id,
      name: body.name,
      email: body.email,
      role: ["operator", "manager", "director", "admin"].includes(body.role)
        ? (body.role as ApiUser["role"])
        : "operator",
      position: body.position ?? "",
      region: body.region ?? "",
      active: true,
    };
    const { error: profileError } = await supabase.from("profiles").upsert(profile);
    if (profileError) throw new Error(profileError.message);
    return profileToUser(profile);
  },
  update: async (id: string, body: Partial<ApiUser & { password: string }>): Promise<ApiUser> => {
    if (!isSupabaseConfigured()) {
      const user = await currentUser();
      if (user.role !== "admin" && user.id !== id) throw new Error("Недостаточно прав");
      const index = demoUsersStore.findIndex((profile) => profile.id === id);
      if (index < 0) throw new Error("Пользователь не найден");
      demoUsersStore[index] = { ...demoUsersStore[index], ...body };
      return demoUsersStore[index];
    }
    const user = await currentUser();
    if (user.role !== "admin" && user.id !== id) throw new Error("Недостаточно прав");
    const updates = Object.fromEntries(
      Object.entries(body).filter(
        ([key, value]) =>
          value !== undefined && ["name", "role", "position", "region", "active"].includes(key),
      ),
    );
    if (Object.keys(updates).length) {
      const { error } = await supabase.from("profiles").update(updates).eq("id", id);
      if (error) throw new Error(error.message);
    }
    if (body.password && user.id === id) {
      const { error } = await supabase.auth.updateUser({ password: body.password });
      if (error) throw new Error(error.message);
    }
    const { data, error } = await supabase
      .from("profiles")
      .select("id,name,email,role,position,region,active")
      .eq("id", id)
      .single<ProfileRow>();
    if (error) throw new Error(error.message);
    return profileToUser(data);
  },
  delete: async (id: string) => {
    if (!isSupabaseConfigured()) {
      const user = await currentUser();
      requireRole(user, ["admin"]);
      const target = demoUsersStore.find((profile) => profile.id === id);
      if (target) target.active = false;
      return { ok: true };
    }
    const user = await currentUser();
    requireRole(user, ["admin"]);
    const { error } = await supabase.from("profiles").update({ active: false }).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },
};

export const notificationsApi = {
  list: async (): Promise<ApiNotification[]> => {
    if (useFastApi()) return get<ApiNotification[]>("/notifications");
    if (!isSupabaseConfigured()) return demoNotificationsStore;
    const user = await currentUser();
    const { data, error } = await supabase
      .from("notifications")
      .select("id,icon,title,body,tone,unread,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .returns<ApiNotification[]>();
    if (error) throw new Error(error.message);
    return data ?? [];
  },
  markRead: async (id: string) => {
    if (useFastApi()) return post<{ ok: boolean }>(`/notifications/${id}/read`, {});
    if (!isSupabaseConfigured()) {
      const notification = demoNotificationsStore.find((item) => item.id === id);
      if (notification) notification.unread = false;
      return { ok: true };
    }
    const { error } = await supabase.from("notifications").update({ unread: false }).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },
  markAllRead: async () => {
    if (useFastApi()) return post<{ ok: boolean }>("/notifications/read-all", {});
    if (!isSupabaseConfigured()) {
      demoNotificationsStore.forEach((notification) => {
        notification.unread = false;
      });
      return { ok: true };
    }
    const user = await currentUser();
    const { error } = await supabase
      .from("notifications")
      .update({ unread: false })
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },
};

export const calendarApi = {
  list: async (): Promise<ApiCalendarEvent[]> => {
    if (!isSupabaseConfigured()) return demoCalendarStore;
    assertSupabase();
    const { data, error } = await supabase
      .from("calendar_events")
      .select("id,title,date,event_type,created_by")
      .order("date")
      .returns<ApiCalendarEvent[]>();
    if (error) throw new Error(error.message);
    return data ?? [];
  },
  create: async (body: {
    title: string;
    date: string;
    event_type: string;
  }): Promise<ApiCalendarEvent> => {
    if (!isSupabaseConfigured()) {
      const user = await currentUser();
      requireRole(user, ["manager", "director", "admin"]);
      const event: ApiCalendarEvent = { id: crypto.randomUUID(), ...body, created_by: user.id };
      demoCalendarStore.unshift(event);
      return event;
    }
    const user = await currentUser();
    requireRole(user, ["manager", "director", "admin"]);
    const { data, error } = await supabase
      .from("calendar_events")
      .insert({ ...body, created_by: user.id })
      .select("id,title,date,event_type,created_by")
      .single<ApiCalendarEvent>();
    if (error) throw new Error(error.message);
    return data;
  },
  delete: async (id: string) => {
    if (!isSupabaseConfigured()) {
      const user = await currentUser();
      requireRole(user, ["manager", "director", "admin"]);
      const index = demoCalendarStore.findIndex((event) => event.id === id);
      if (index >= 0) demoCalendarStore.splice(index, 1);
      return { ok: true };
    }
    const user = await currentUser();
    requireRole(user, ["manager", "director", "admin"]);
    const { error } = await supabase.from("calendar_events").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },
};

export const auditApi = {
  list: async (): Promise<ApiAuditLog[]> => {
    if (!isSupabaseConfigured()) {
      const user = await currentUser();
      requireRole(user, ["manager", "director", "admin"]);
      return demoAuditStore;
    }
    const user = await currentUser();
    requireRole(user, ["manager", "director", "admin"]);
    const { data, error } = await supabase
      .from("audit_logs")
      .select("id,who,action,target,created_at")
      .order("created_at", { ascending: false })
      .returns<ApiAuditLog[]>();
    if (error) throw new Error(error.message);
    return data ?? [];
  },
};

export const aiApi = {
  transcribe: (audio: Blob, filename?: string) => aiProxy.transcribe(audio, filename),
  parseVoice: (text: string, wells: ApiWell[]) => aiProxy.parseVoice(text, wells),
  usage: async () => {
    if (isSupabaseConfigured() || !useFastApi()) {
      try {
        return await aiProxy.usage();
      } catch {
        // fallback below
      }
    }
    if (!useFastApi()) {
      try {
        return await get<AiUsage>("/ai/usage");
      } catch {
        // fallback
      }
    }
    return {
      total_tokens: 0,
      total_cost_usd: 0,
      budget_usd: 2,
      max_tokens: 100_000,
      tokens_remaining: 100_000,
      budget_remaining_usd: 2,
      blocked: false,
      block_reason: null,
      usage_percent_tokens: 0,
      usage_percent_budget: 0,
    };
  },

  chat: async (message: string) => {
    if (isSupabaseConfigured()) {
      try {
        return await aiProxy.chat(message);
      } catch {
        // fallback below
      }
    }
    if (!useFastApi()) {
      try {
        return await post<{ reply: string; suggestions: string[] }>("/ai/chat", { message });
      } catch {
        // fallback
      }
    }

    const lower = message.toLowerCase();
    const [reports, wells] = await Promise.all([reportsApi.list(), wellsApi.list()]);
    const flagged = reports.filter((report) => report.status === "flagged").length;
    const lowProduction = wells.filter((well) => well.production24h < 20).length;
    const warningWells = wells.filter(
      (well) => well.status === "warning" || well.status === "broken",
    );

    if (lower.includes("аномал") || lower.includes("ошиб") || lower.includes("провер")) {
      return {
        reply: `AI обнаружил ${flagged} отчёта с аномалиями. В первую очередь проверьте ${
          warningWells
            .slice(0, 3)
            .map((well) => well.code)
            .join(", ") || "скважины со статусом warning"
        }.`,
        suggestions: ["Открыть согласования", "Показать карту скважин"],
      };
    }
    if (lower.includes("добыч") || lower.includes("скваж") || lower.includes("производ")) {
      return {
        reply: `${lowProduction} скважин показывают низкую добычу. Рекомендуется сверить давление, температуру и режим насоса по последним отчётам.`,
        suggestions: ["Показать KPI", "Создать задачу осмотра"],
      };
    }

    return {
      reply:
        "Я анализирую данные MUNAI из текущей базы: скважины, отчёты, KPI и уведомления. Спросите про добычу, аномалии или согласования.",
      suggestions: ["Какие отчёты требуют проверки?", "Какие скважины просели по добыче?"],
    };
  },
  insights: async () => {
    if (isSupabaseConfigured()) {
      try {
        return await aiProxy.insights();
      } catch {
        // fallback
      }
    }
    if (!useFastApi()) {
      try {
        return get<{
          insights: Array<{ tone: string; title: string; desc: string }>;
          suggestions: string[];
        }>("/ai/insights");
      } catch {
        // fallback
      }
    }

    const [reports, wells] = await Promise.all([reportsApi.list(), wellsApi.list()]);
    const flagged = reports.filter((report) => report.status === "flagged").length;
    const lowProduction = wells.filter((well) => well.production24h < 20).length;
    const bestWarning = wells.find((well) => well.status === "warning" || well.status === "broken");

    return {
      insights: [
        {
          tone: flagged > 0 ? "warning" : "success",
          title:
            flagged > 0 ? `AI: ${flagged} отчёта требуют проверки` : "AI: критичных аномалий нет",
          desc: bestWarning
            ? `${bestWarning.code}: проверьте температуру, давление и режим насоса`
            : "Все отчёты проходят первичную проверку",
        },
        {
          tone: lowProduction > 0 ? "info" : "success",
          title:
            lowProduction > 0 ? `${lowProduction} скважин с низкой добычей` : "Добыча стабильна",
          desc: "Сравните показатели с последними суточными замерами",
        },
        {
          tone: "info",
          title: `${wells.length} скважин в контуре`,
          desc: "Карта, отчёты и KPI синхронизированы с Supabase",
        },
      ],
      suggestions: ["Проверить отчёты", "Открыть карту", "Посмотреть KPI"],
    };
  },
};
