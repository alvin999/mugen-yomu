/**
 * @file keyVaultService.ts
 * @description BYOK API 金鑰本機加密保存服務 (Web Crypto API Encryption)
 * 支援三態金鑰防護模式：
 * 1. 明文模式 (plaintext): 沿用 localStorage 儲存
 * 2. 裝置透明加密 (device-auto): 以本機 IndexedDB 非導出 (non-extractable) CryptoKey + AES-GCM 進行自動加解密，免輸密碼
 * 3. 主密碼/PIN 防護 (master-pin): 使用者自訂 PIN 經 PBKDF2 衍生金鑰 + AES-GCM 加密，需解鎖至記憶體 Session Cache
 */

export type VaultSecurityMode = 'plaintext' | 'device-auto' | 'master-pin';

export interface EncryptedPayload {
  version: 1;
  mode: 'device-auto' | 'master-pin';
  iv: string;   // Base64
  salt?: string; // Base64 (僅 master-pin 模式有)
  ciphertext: string; // Base64
}

const STORAGE_KEY_MODE = 'mugen_vault_security_mode';
const STORAGE_PREFIX_ENCRYPTED = 'mugen_enc_key_';
const STORAGE_PREFIX_PLAINTEXT = 'mugen_key_';
const STORAGE_KEY_VERIFIER = 'mugen_vault_pin_verifier'; // 用於驗證主 PIN 正確性

const DB_NAME = 'mugen_yomu_crypto_v1';
const DB_STORE_NAME = 'keys';
const DEVICE_KEY_ID = 'device_root_key';

// 記憶體中暫存的解密金鑰 (Session Cache，分頁重整或關閉即自動銷毀)
const memoryKeyCache = new Map<string, string>();
let cachedMasterPin: string | null = null;
let isUnlockedState: boolean = false;

// ---------------------------------------------------------------------------
// 1. IndexedDB 輔助工具：儲存不可導出 (non-extractable) 之裝置根金鑰
// ---------------------------------------------------------------------------

function openCryptoDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported in this environment'));
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE_NAME)) {
        db.createObjectStore(DB_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getOrGenerateDeviceCryptoKey(): Promise<CryptoKey> {
  const db = await openCryptoDb();
  return new Promise(async (resolve, reject) => {
    try {
      const tx = db.transaction(DB_STORE_NAME, 'readonly');
      const store = tx.objectStore(DB_STORE_NAME);
      const req = store.get(DEVICE_KEY_ID);

      req.onsuccess = async () => {
        if (req.result) {
          resolve(req.result as CryptoKey);
          return;
        }

        // 不存在則生成全新不可導出之 AES-GCM 256-bit 金鑰
        try {
          const newKey = await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            false, // non-extractable: 任何 JS 程式碼皆無法導出二進位金鑰
            ['encrypt', 'decrypt']
          );

          const writeTx = db.transaction(DB_STORE_NAME, 'readwrite');
          const writeStore = writeTx.objectStore(DB_STORE_NAME);
          writeStore.put(newKey, DEVICE_KEY_ID);

          writeTx.oncomplete = () => resolve(newKey);
          writeTx.onerror = () => reject(writeTx.error);
        } catch (genErr) {
          reject(genErr);
        }
      };

      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

// ---------------------------------------------------------------------------
// 2. Web Crypto API 編解碼與演算法輔助工具
// ---------------------------------------------------------------------------

function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * 透過 PBKDF2 (100,000 次雜湊) 將使用者輸入的 PIN 碼衍生為 AES-GCM 256-bit 對稱金鑰
 */
async function deriveKeyFromPin(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ---------------------------------------------------------------------------
// 3. 核心加密 / 解密函式 (AES-GCM-256)
// ---------------------------------------------------------------------------

/**
 * 使用指定密鑰對明文進行 AES-GCM 加密，生成隨機 IV
 */
async function aesGcmEncrypt(key: CryptoKey, plaintext: string): Promise<{ iv: Uint8Array; ciphertext: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV 最佳推薦長度
  const enc = new TextEncoder();
  const encodedData = enc.encode(plaintext);

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encodedData
  );

  return {
    iv,
    ciphertext: new Uint8Array(cipherBuffer)
  };
}

/**
 * 使用指定密鑰對密文進行 AES-GCM 解密
 */
async function aesGcmDecrypt(key: CryptoKey, iv: Uint8Array, ciphertext: Uint8Array): Promise<string> {
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  const dec = new TextDecoder();
  return dec.decode(decryptedBuffer);
}

// ---------------------------------------------------------------------------
// 4. 金鑰安全庫 (KeyVault) 狀態與對外 API
// ---------------------------------------------------------------------------

/**
 * 讀取當前的金鑰安全模式（預設為裝置透明加密）
 */
export function getVaultSecurityMode(): VaultSecurityMode {
  if (typeof window === 'undefined') return 'plaintext';
  const saved = localStorage.getItem(STORAGE_KEY_MODE) as VaultSecurityMode | null;
  return saved || 'device-auto';
}

/**
 * 檢查主密碼模式目前是否處於已解鎖狀態
 */
export function isVaultUnlocked(): boolean {
  const mode = getVaultSecurityMode();
  if (mode === 'plaintext' || mode === 'device-auto') return true;
  return isUnlockedState && !!cachedMasterPin;
}

/**
 * 檢查是否已設定主 PIN 碼驗證器
 */
export function hasMasterPinSet(): boolean {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem(STORAGE_KEY_VERIFIER);
}

/**
 * 驗證並解鎖主密碼 PIN 碼
 */
export async function unlockVaultWithPin(pin: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const verifierRaw = localStorage.getItem(STORAGE_KEY_VERIFIER);
  if (!verifierRaw) {
    // 尚未設定驗證器，直接接受並設置為解鎖狀態
    cachedMasterPin = pin;
    isUnlockedState = true;
    return true;
  }

  try {
    const payload: EncryptedPayload = JSON.parse(verifierRaw);
    if (!payload.salt) return false;
    const salt = base64ToBuffer(payload.salt);
    const iv = base64ToBuffer(payload.iv);
    const ct = base64ToBuffer(payload.ciphertext);

    const derivedKey = await deriveKeyFromPin(pin, salt);
    const checkText = await aesGcmDecrypt(derivedKey, iv, ct);

    if (checkText === 'MUGEN_YOMU_PIN_OK') {
      cachedMasterPin = pin;
      isUnlockedState = true;
      // 自動解鎖並快取現有已儲存金鑰至記憶體
      await preloadAllKeysToMemory();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * 立即鎖定金鑰庫（清空記憶體中的 PIN 與已解密金鑰）
 */
export function lockVault(): void {
  cachedMasterPin = null;
  isUnlockedState = false;
  memoryKeyCache.clear();
}

/**
 * 設定新的主 PIN 碼（並更新驗證器標籤）
 */
export async function setMasterPin(pin: string): Promise<void> {
  if (typeof window === 'undefined') return;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derivedKey = await deriveKeyFromPin(pin, salt);
  const { iv, ciphertext } = await aesGcmEncrypt(derivedKey, 'MUGEN_YOMU_PIN_OK');

  const verifierPayload: EncryptedPayload = {
    version: 1,
    mode: 'master-pin',
    iv: bufferToBase64(iv),
    salt: bufferToBase64(salt),
    ciphertext: bufferToBase64(ciphertext)
  };

  localStorage.setItem(STORAGE_KEY_VERIFIER, JSON.stringify(verifierPayload));
  cachedMasterPin = pin;
  isUnlockedState = true;
}

/**
 * 取得指定 Provider 的 API 金鑰 (非同步安全提取)
 */
export async function getApiKey(provider: string): Promise<string> {
  if (typeof window === 'undefined') return '';
  const p = (provider || 'groq').toLowerCase();

  // 1. 優先從記憶體快取讀取
  if (memoryKeyCache.has(p)) {
    return memoryKeyCache.get(p) || '';
  }

  const mode = getVaultSecurityMode();

  // 2. 明文模式
  if (mode === 'plaintext') {
    const raw = (
      localStorage.getItem(`${STORAGE_PREFIX_PLAINTEXT}${p}`) ||
      localStorage.getItem(`mugen_api_key_${p}`) ||
      localStorage.getItem(`mugen_${p}_key`) ||
      localStorage.getItem(`${p}_api_key`) ||
      ''
    ).trim();
    if (raw) memoryKeyCache.set(p, raw);
    return raw;
  }

  // 3. 讀取密文
  const encRaw = localStorage.getItem(`${STORAGE_PREFIX_ENCRYPTED}${p}`);
  if (!encRaw) {
    // 檢查是否有尚未遷移的舊明文
    const legacyRaw = localStorage.getItem(`${STORAGE_PREFIX_PLAINTEXT}${p}`);
    if (legacyRaw) {
      // 舊版明文存在，暫存記憶體快取
      memoryKeyCache.set(p, legacyRaw.trim());
      return legacyRaw.trim();
    }
    return '';
  }

  try {
    const payload: EncryptedPayload = JSON.parse(encRaw);
    const iv = base64ToBuffer(payload.iv);
    const ct = base64ToBuffer(payload.ciphertext);

    if (payload.mode === 'device-auto') {
      const deviceKey = await getOrGenerateDeviceCryptoKey();
      const decrypted = await aesGcmDecrypt(deviceKey, iv, ct);
      memoryKeyCache.set(p, decrypted);
      return decrypted;
    } else if (payload.mode === 'master-pin') {
      if (!isVaultUnlocked() || !cachedMasterPin) {
        console.warn(`[KeyVault] Provider '${p}' 金鑰已加密保護，請先輸入主 PIN 碼解鎖。`);
        return '';
      }
      if (!payload.salt) return '';
      const salt = base64ToBuffer(payload.salt);
      const derivedKey = await deriveKeyFromPin(cachedMasterPin, salt);
      const decrypted = await aesGcmDecrypt(derivedKey, iv, ct);
      memoryKeyCache.set(p, decrypted);
      return decrypted;
    }
  } catch (err) {
    console.error(`[KeyVault] 解密 Provider '${p}' 金鑰失敗:`, err);
  }

  return '';
}

/**
 * 同步快速取得 API 金鑰（針對舊程式碼同步呼叫之降級方案，優先自記憶體快取或明文取回）
 */
export function getStoredApiKeySync(provider: string = 'groq'): string {
  if (typeof window === 'undefined') return '';
  const p = (provider || 'groq').toLowerCase();

  // 優先回傳記憶體快取中已解密好的金鑰
  if (memoryKeyCache.has(p)) {
    return memoryKeyCache.get(p) || '';
  }

  // 若為明文模式或存有舊明文
  const plain = (
    localStorage.getItem(`${STORAGE_PREFIX_PLAINTEXT}${p}`) ||
    localStorage.getItem(`mugen_api_key_${p}`) ||
    localStorage.getItem(`mugen_${p}_key`) ||
    localStorage.getItem(`${p}_api_key`) ||
    ''
  ).trim();

  if (plain) {
    memoryKeyCache.set(p, plain);
    return plain;
  }

  return '';
}

/**
 * 儲存指定 Provider 的 API 金鑰 (依據當前模式自動加解密)
 */
export async function setApiKey(provider: string, rawKey: string): Promise<void> {
  if (typeof window === 'undefined') return;
  const p = (provider || 'groq').toLowerCase();
  const cleanKey = rawKey.trim();

  if (!cleanKey) {
    // 移除金鑰
    memoryKeyCache.delete(p);
    localStorage.removeItem(`${STORAGE_PREFIX_PLAINTEXT}${p}`);
    localStorage.removeItem(`mugen_api_key_${p}`);
    localStorage.removeItem(`${STORAGE_PREFIX_ENCRYPTED}${p}`);
    return;
  }

  // 寫入記憶體快取
  memoryKeyCache.set(p, cleanKey);
  const mode = getVaultSecurityMode();

  if (mode === 'plaintext') {
    localStorage.setItem(`${STORAGE_PREFIX_PLAINTEXT}${p}`, cleanKey);
    localStorage.setItem(`mugen_api_key_${p}`, cleanKey);
    localStorage.removeItem(`${STORAGE_PREFIX_ENCRYPTED}${p}`);
    return;
  }

  // 清除舊明文，確保磁碟上不留痕跡
  localStorage.removeItem(`${STORAGE_PREFIX_PLAINTEXT}${p}`);
  localStorage.removeItem(`mugen_api_key_${p}`);

  if (mode === 'device-auto') {
    const deviceKey = await getOrGenerateDeviceCryptoKey();
    const { iv, ciphertext } = await aesGcmEncrypt(deviceKey, cleanKey);
    const payload: EncryptedPayload = {
      version: 1,
      mode: 'device-auto',
      iv: bufferToBase64(iv),
      ciphertext: bufferToBase64(ciphertext)
    };
    localStorage.setItem(`${STORAGE_PREFIX_ENCRYPTED}${p}`, JSON.stringify(payload));
  } else if (mode === 'master-pin') {
    if (!cachedMasterPin) {
      throw new Error('未提供或尚未驗證主 PIN 碼，無法加密金鑰');
    }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const derivedKey = await deriveKeyFromPin(cachedMasterPin, salt);
    const { iv, ciphertext } = await aesGcmEncrypt(derivedKey, cleanKey);
    const payload: EncryptedPayload = {
      version: 1,
      mode: 'master-pin',
      iv: bufferToBase64(iv),
      salt: bufferToBase64(salt),
      ciphertext: bufferToBase64(ciphertext)
    };
    localStorage.setItem(`${STORAGE_PREFIX_ENCRYPTED}${p}`, JSON.stringify(payload));
  }
}

/**
 * 預載入並解密所有已存金鑰至記憶體快取
 */
export async function preloadAllKeysToMemory(): Promise<void> {
  const providers = ['groq', 'gemini', 'openai', 'anthropic', 'deepseek'];
  for (const prov of providers) {
    try {
      await getApiKey(prov);
    } catch {
      // 略過錯誤
    }
  }
}

/**
 * 切換安全防護模式，並自動重構現有金鑰
 */
export async function switchVaultSecurityMode(
  newMode: VaultSecurityMode,
  options?: { newPin?: string; currentPin?: string }
): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  // 1. 先將現有所有已儲存金鑰完整解密到記憶體中
  await preloadAllKeysToMemory();

  // 若目標為 master-pin 模式，確保有合法 PIN 碼
  if (newMode === 'master-pin') {
    const pin = options?.newPin || cachedMasterPin;
    if (!pin || pin.length < 4) {
      throw new Error('主 PIN 碼長度至少需為 4 位');
    }
    await setMasterPin(pin);
  } else {
    // 切換成其他模式時，清除主 PIN 驗證器
    if (newMode === 'plaintext' || newMode === 'device-auto') {
      localStorage.removeItem(STORAGE_KEY_VERIFIER);
      cachedMasterPin = null;
    }
  }

  // 2. 更新當前模式
  localStorage.setItem(STORAGE_KEY_MODE, newMode);

  // 3. 將記憶體中所有金鑰依新模式重新寫入持久化儲存
  const currentKeys = new Map(memoryKeyCache);
  for (const [provider, rawKey] of currentKeys.entries()) {
    if (rawKey) {
      await setApiKey(provider, rawKey);
    }
  }

  return true;
}

/**
 * 安全抹除本機儲存的所有 API 金鑰與安全憑證
 */
export async function clearAllStoredKeys(): Promise<void> {
  if (typeof window === 'undefined') return;

  memoryKeyCache.clear();
  cachedMasterPin = null;
  isUnlockedState = false;

  const providers = ['groq', 'gemini', 'openai', 'anthropic', 'deepseek'];
  for (const p of providers) {
    localStorage.removeItem(`${STORAGE_PREFIX_PLAINTEXT}${p}`);
    localStorage.removeItem(`mugen_api_key_${p}`);
    localStorage.removeItem(`${STORAGE_PREFIX_ENCRYPTED}${p}`);
    localStorage.removeItem(`${p}_api_key`);
    localStorage.removeItem(`${p}_key`);
  }
  localStorage.removeItem(STORAGE_KEY_VERIFIER);

  // 清空 IndexedDB 中的裝置金鑰
  try {
    const db = await openCryptoDb();
    const tx = db.transaction(DB_STORE_NAME, 'readwrite');
    tx.objectStore(DB_STORE_NAME).clear();
  } catch (e) {
    console.warn('清空 CryptoKey 失敗:', e);
  }
}
