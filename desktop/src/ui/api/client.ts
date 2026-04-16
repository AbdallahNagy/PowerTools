import axios, { AxiosError } from "axios";
import type { AxiosRequestConfig } from "axios";

const API_BASE_URL = "https://localhost:7258";

interface CachedAuth {
  token: string;
  envUrl: string;
}

let cached: CachedAuth | null = null;

async function loadAuth(forceRefresh = false): Promise<CachedAuth> {
  if (!forceRefresh && cached) return cached;

  const result = forceRefresh
    ? await window.electron.refreshToken()
    : await window.electron.getActiveConnection();

  if ("error" in result) throw new Error(result.error);

  cached = { token: result.token, envUrl: result.envUrl };
  return cached;
}

export function clearAuthCache() {
  cached = null;
}

export const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use(async (config) => {
  const { token, envUrl } = await loadAuth();
  config.headers.set("Authorization", `Bearer ${token}`);
  config.headers.set("X-Environment-Url", envUrl);
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
        await loadAuth(true);
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
