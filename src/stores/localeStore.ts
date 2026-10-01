import { writable, derived, get } from 'svelte/store';
import { zhTW, type LocaleDict } from '../locales/zh-TW';
import { en } from '../locales/en';
import { ja } from '../locales/ja';

export type SupportedLocale = 'zh-TW' | 'en' | 'ja';

export interface LocaleOption {
  id: SupportedLocale;
  label: string;
  flag: string;
}

export const AVAILABLE_LOCALES: LocaleOption[] = [
  { id: 'zh-TW', label: '繁體中文', flag: '🇹🇼' },
  { id: 'en', label: 'English', flag: '🇺🇸' },
  { id: 'ja', label: '日本語', flag: '🇯🇵' }
];

const DICTIONARIES: Record<SupportedLocale, LocaleDict> = {
  'zh-TW': zhTW,
  'en': en,
  'ja': ja
};

const STORAGE_KEY = 'mugen_locale_preference';

function getInitialLocale(): SupportedLocale {
  if (typeof window === 'undefined') return 'zh-TW';
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as SupportedLocale | null;
    if (saved && (saved === 'zh-TW' || saved === 'en' || saved === 'ja')) {
      return saved;
    }
    const navLang = (navigator.language || '').toLowerCase();
    if (navLang.startsWith('ja')) return 'ja';
    if (navLang.startsWith('en')) return 'en';
    if (navLang.startsWith('zh')) return 'zh-TW';
  } catch (e) {
    console.warn('讀取語系偏好失敗:', e);
  }
  return 'zh-TW';
}

export const currentLocale = writable<SupportedLocale>(getInitialLocale());

export function setLocale(locale: SupportedLocale) {
  currentLocale.set(locale);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, locale);
      document.documentElement.lang = locale;
    } catch (e) {
      console.warn('儲存語系偏好失敗:', e);
    }
  }
}

/**
 * 依路徑 (例如 "nav.workspace") 提取對應語系之文字
 */
function resolveKey(dict: any, path: string, params?: Record<string, any>): string {
  if (!dict || !path) return path;
  const parts = path.split('.');
  let curr = dict;
  for (const part of parts) {
    if (curr && typeof curr === 'object' && part in curr) {
      curr = curr[part];
    } else {
      return path;
    }
  }
  let result = typeof curr === 'string' ? curr : path;
  if (params && typeof result === 'string') {
    for (const [key, value] of Object.entries(params)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
      if (key === 'error') {
        result = result.replace(/\{msg\}/g, String(value));
      } else if (key === 'msg') {
        result = result.replace(/\{error\}/g, String(value));
      }
    }
  }
  return result;
}

/**
 * 響應式翻譯 helper，返回目前語系下 key 的值，支援 {param} 參數插值
 */
export const t = derived(currentLocale, ($locale) => {
  const dict = DICTIONARIES[$locale] || DICTIONARIES['zh-TW'];
  return (path: string, params?: Record<string, any>): string => {
    return resolveKey(dict, path, params);
  };
});

/**
 * 繁體中文轉換器功能限定旗標：僅在 zh-TW 語系下為 true
 */
export const isTraditionalConverterVisible = derived(
  currentLocale,
  ($locale) => $locale === 'zh-TW'
);
