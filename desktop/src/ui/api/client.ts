import axios, { AxiosError } from "axios";
import type { AxiosRequestConfig } from "axios";
import { desktopBridge } from "../platform/desktopBridge";

interface CachedAuth {
  name: string;
  token?: string;
  envUrl: string;
  crmType: "online" | "onpremise";
  expiresOn?: string | null;
}

type RefreshableAuth = Pick<CachedAuth, "crmType" | "expiresOn">;

const TOKEN_REFRESH_BUFFER_MS = 5 * 60_000;

export function shouldRefreshAuth(
  auth: RefreshableAuth,
  now = Date.now()
): boolean {
  if (auth.crmType !== "online" || !auth.expiresOn) return false;

  const expiresAt = Date.parse(auth.expiresOn);
  if (Number.isNaN(expiresAt)) return true;

  return expiresAt - now <= TOKEN_REFRESH_BUFFER_MS;
}

// Local sidecar URL + per-launch secret. Both are resolved once from the
// Electron main process and reused for the lifetime of the renderer.
let bootstrapPromise: Promise<{ baseUrl: string; secret: string }> | null = null;
function bootstrap() {
  return bootstrapPromise ??= Promise.all([
    desktopBridge.getApiBaseUrl(),
    desktopBridge.getLocalSecret(),
  ]).then(([baseUrl, secret]) => ({ baseUrl, secret }));
}

let cached: CachedAuth | null = null;
const targetCache: Record<string, CachedAuth> = {};

// Dedupes concurrent refresh calls so N queries that fire together against an
// expired token trigger exactly one main-process refresh, not N racing ones.
let inFlightPrimary: Promise<CachedAuth> | null = null;
const inFlightTargets = new Map<string, Promise<CachedAuth>>();

async function loadAuth(forceRefresh = false): Promise<CachedAuth> {
  if (!forceRefresh && cached && !shouldRefreshAuth(cached)) return cached;
  if (inFlightPrimary) return inFlightPrimary;

  inFlightPrimary = (async () => {
    const result = forceRefresh
      ? await desktopBridge.refreshToken()
      : await desktopBridge.getActiveConnection();

    if ("error" in result) throw new Error(result.error);

    cached = {
      name: result.name,
      token: result.token,
      envUrl: result.envUrl,
      crmType: result.crmType,
      expiresOn: result.expiresOn,
    };
    return cached;
  })();

  try {
    return await inFlightPrimary;
  } finally {
    inFlightPrimary = null;
  }
}

async function loadTargetAuth(name: string, forceRefresh = false): Promise<CachedAuth> {
  if (!forceRefresh && targetCache[name] && !shouldRefreshAuth(targetCache[name])) {
    return targetCache[name];
  }
  const existing = inFlightTargets.get(name);
  if (existing) return existing;

  const promise = (async () => {
    const result = await desktopBridge.getConnection(name);
    if ("error" in result) throw new Error(result.error);

    targetCache[name] = {
      name: result.name,
      token: result.token,
      envUrl: result.envUrl,
      crmType: result.crmType,
      expiresOn: result.expiresOn,
    };
    return targetCache[name];
  })();

  inFlightTargets.set(name, promise);
  try {
    return await promise;
  } finally {
    inFlightTargets.delete(name);
  }
}

export function clearAuthCache() {
  cached = null;
  inFlightPrimary = null;
}

export function clearTargetAuthCache(name: string) {
  delete targetCache[name];
  inFlightTargets.delete(name);
}

declare module "axios" {
  interface AxiosRequestConfig {
    meta?: {
      /** Override the primary connection used for this request. Defaults to the active connection. */
      connectionName?: string;
      /** Optional second connection sent via X-Target-* headers. */
      targetConnectionName?: string;
    };
  }
}

export const api = axios.create();

api.interceptors.request.use(async (config) => {
  const { baseUrl, secret } = await bootstrap();
  config.baseURL = baseUrl;
  config.headers.set("X-Local-Secret", secret);

  const auth = config.meta?.connectionName
    ? await loadTargetAuth(config.meta.connectionName)
    : await loadAuth();

  if (auth.crmType === "online") {
    config.headers.set("Authorization", `Bearer ${auth.token}`);
    config.headers.set("X-Environment-Url", auth.envUrl);
  } else {
    config.headers.set("X-Connection-Name", auth.name);
  }

  if (config.meta?.targetConnectionName) {
    const target = await loadTargetAuth(config.meta.targetConnectionName);
    if (target.crmType === "online") {
      config.headers.set("X-Target-Authorization", `Bearer ${target.token}`);
      config.headers.set("X-Target-Environment-Url", target.envUrl);
    } else {
      config.headers.set("X-Target-Connection-Name", target.name);
    }
  }

  return config;
});

type RetriableConfig = AxiosRequestConfig & { _retry?: boolean };

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      try {
        if (original.meta?.connectionName) {
          await loadTargetAuth(original.meta.connectionName, true);
        } else {
          await loadAuth(true);
        }
        if (original.meta?.targetConnectionName) {
          await loadTargetAuth(original.meta.targetConnectionName, true);
        }
        return api.request(original);
      } catch (refreshErr) {
        clearAuthCache();
        return Promise.reject(refreshErr);
      }
    }
    return Promise.reject(error);
  }
);

export async function apiGet<T>(url: string, config?: AxiosRequestConfig) {
  const res = await api.get<T>(url, config);
  return res.data;
}

export async function apiPost<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig
) {
  const res = await api.post<T>(url, body, config);
  return res.data;
}

export async function apiPut<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig
) {
  const res = await api.put<T>(url, body, config);
  return res.data;
}

export async function apiDelete<T>(url: string, config?: AxiosRequestConfig) {
  const res = await api.delete<T>(url, config);
  return res.data;
}
