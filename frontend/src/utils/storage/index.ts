import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Keychain from "react-native-keychain";

import { AssertNoExtras, StorageBase, StorageItemValue } from "./storage-base";

export class Storage extends StorageBase {
  // General KV — backed by AsyncStorage.
  // `fallback` is required and returned on any miss/parse error — a missing key looks identical to a stored `null`.
  async getItem<Fallback extends StorageItemValue>(
    key: string,
    fallback: Fallback,
  ): Promise<Fallback | null> {
    try {
      const raw = await AsyncStorage.getItem(key);
      return this.retrieve(raw, fallback);
    } catch (e) {
      this.warn("getItem", key, e);
      return fallback;
    }
  }

  async setItem<Value extends StorageItemValue>(
    key: string,
    value: Value,
  ): Promise<boolean> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      this.warn("setItem", key, e);
      return false;
    }
  }

  async removeItem(key: string): Promise<boolean> {
    try {
      await AsyncStorage.removeItem(key);
      return true;
    } catch (e) {
      this.warn("removeItem", key, e);
      return false;
    }
  }

  // Sensitive values — Keychain (iOS) / EncryptedSharedPreferences (Android).
  // Use these (not getItem) for auth tokens; whatever writes with secureSet must read with secureGet under the same key.
  // Key must match /^[A-Za-z0-9._-]+$/ — no ":", "/" or spaces — or Keychain throws and nothing is stored.
  async secureGet<Fallback extends StorageItemValue>(
    key: string,
    fallback: Fallback,
  ): Promise<Fallback | null> {
    try {
      const entry = await Keychain.getGenericPassword({ service: key });
      const raw = entry ? entry.password : null;
      return this.retrieve(raw, fallback);
    } catch (e) {
      this.warn("secureGet", key, e);
      return fallback;
    }
  }

  async secureSet<Value extends StorageItemValue>(
    key: string,
    value: Value,
  ): Promise<boolean> {
    try {
      await Keychain.setGenericPassword(key, JSON.stringify(value), { service: key, accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
      return true;
    } catch (e) {
      this.warn("secureSet", key, e);
      return false;
    }
  }

  async secureRemove(key: string): Promise<boolean> {
    try {
      await Keychain.resetGenericPassword({ service: key });
      return true;
    } catch (e) {
      this.warn("secureRemove", key, e);
      return false;
    }
  }
}

// The shared singleton — import THIS (`import { storage } from "@/src/utils/storage"`). Do not `new Storage()`.
export const storage = new Storage();

// Compile-time guard: any new method must be declared in storage-base.ts first.
type _NoExtras = AssertNoExtras<Exclude<keyof Storage, keyof StorageBase>>;