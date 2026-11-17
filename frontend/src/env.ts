import {UserFacingError} from '@/src/errors';
import Config from "react-native-config";

import { storage } from "@/src/utils/storage";

export type AppEnv = "development" | "qa" | "production";

export const ENVIRONMENTS: { key: AppEnv; label: string; url: string; desc: string }[] = [
  { key: "development", label: "Development", url: Config.APP_BACKEND_URL ?? "", desc: "Preview server used while building features" },
  { key: "qa", label: "QA / Staging", url: Config.APP_QA_BACKEND_URL ?? "", desc: "Release candidates tested by the QA team" },
  { key: "production", label: "Production", url: Config.APP_PROD_BACKEND_URL ?? "", desc: "Live app used by customers and partners" },
];

const ENV_KEY = "app_env";
export const BUILD_ENV = (Config.APP_ENV as AppEnv) || "development";

let current: AppEnv = BUILD_ENV;

export const baseUrl = () => {
  const url = ENVIRONMENTS.find((e) => e.key === current)?.url;
  if (!url) throw new UserFacingError("The booking service is not available yet. Please try again later.");
  if (current === "production" && !url.startsWith("https://")) throw new UserFacingError("A secure booking service is required.");
  return url.replace(/\/$/, "");
};
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
