/**
 * تخزين القيم الحساسة: expo-secure-store عند توفره (Keychain/Keystore)؛ وبديل في الذاكرة للتطوير
 * حتى لا تُكتب التوكنات عاريةً في التخزين غير الآمن.
 */
type SecureModule = {
  getItemAsync(k: string): Promise<string | null>;
  setItemAsync(k: string, v: string): Promise<void>;
  deleteItemAsync(k: string): Promise<void>;
};

let mod: SecureModule | null | undefined;
async function load(): Promise<SecureModule | null> {
  if (mod !== undefined) return mod;
  try {
    const req = (globalThis as unknown as { require?: (m: string) => unknown }).require;
    mod = ((req ? req('expo-secure-store') : null) as SecureModule | null) ?? null;
  } catch {
    mod = null;
  }
  return mod;
}

const DEV_PREFIX = 'dev:';
const devStore = new Map<string, string>();

export async function getSecure(key: string): Promise<string | null> {
  const m = await load();
  if (m) return await m.getItemAsync(key);
  const v = devStore.get(key);
  return v && v.startsWith(DEV_PREFIX) ? v.slice(DEV_PREFIX.length) : null;
}

export async function setSecure(key: string, value: string | null): Promise<void> {
  const m = await load();
  if (m) {
    if (value === null) await m.deleteItemAsync(key);
    else await m.setItemAsync(key, value);
    return;
  }
  if (value === null) devStore.delete(key);
  else devStore.set(key, `${DEV_PREFIX}${value}`);
}
