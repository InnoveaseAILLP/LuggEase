import { storage } from "@/src/utils/storage";

export type AppEnv = "development" | "qa" | "production";

export const ENVIRONMENTS: { key: AppEnv; label: string; url: string; desc: string }[] = [
  { key: "development", label: "Development", url: process.env.EXPO_PUBLIC_BACKEND_URL ?? "", desc: "Preview server used while building features" },
  { key: "qa", label: "QA / Staging", url: process.env.EXPO_PUBLIC_QA_BACKEND_URL ?? "", desc: "Release candidates tested by the QA team" },
  { key: "production", label: "Production", url: process.env.EXPO_PUBLIC_PROD_BACKEND_URL ?? "", desc: "Live app used by customers and partners" },
];

const ENV_KEY = "app_env";
export const BUILD_ENV = (process.env.EXPO_PUBLIC_APP_ENV as AppEnv) || "development";

let current: AppEnv = BUILD_ENV;

export const baseUrl = () => ENVIRONMENTS.find((e) => e.key === current)?.url || ENVIRONMENTS[0].url;
export const currentEnv = () => current;

export async function loadEnv() {
  const saved = (await storage.getItem(ENV_KEY, null)) as AppEnv | null;
  if (saved && ENVIRONMENTS.find((e) => e.key === saved)?.url) current = saved;
  return current;
}

export async function setEnv(env: AppEnv) {
  current = env;
  await storage.setItem(ENV_KEY, env);
}
