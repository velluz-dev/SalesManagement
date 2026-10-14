import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { enumLabel as englishEnumLabel } from '@shared';
import { my } from './my';

export type Lang = 'en' | 'my';

export const LANGUAGES: { code: Lang; label: string; short: string }[] = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'my', label: 'မြန်မာ', short: 'မြန်မာ' },
];

const DICTIONARIES: Record<Lang, Record<string, string>> = { en: {}, my };
const STORAGE_KEY = 'saleshub.lang';

const LOCALES: Record<Lang, string> = { en: 'en-US', my: 'my-MM-u-nu-latn' };

function readStoredLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'my' || v === 'en' ? v : 'en';
  } catch {
    return 'en';
  }
}

let current: Lang = readStoredLang();

export const currentLang = () => current;
export const currentLocale = () => LOCALES[current];

export function translate(text: string, vars?: Record<string, string | number>): string {
  const out = DICTIONARIES[current][text] ?? text;
  return vars ? out.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : out;
}

export function tNode(node: ReactNode): ReactNode {
  return typeof node === 'string' ? translate(node) : node;
}

export function enumLabel(value: string): string {
  return DICTIONARIES[current][`enum.${value}`] ?? englishEnumLabel(value);
}

interface I18nState {
  lang: Lang;
  locale: string;
  setLang: (l: Lang) => void;
  t: typeof translate;
}

const I18nContext = createContext<I18nState | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(current);

  useEffect(() => {
    document.documentElement.lang = lang === 'my' ? 'my' : 'en';
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    current = l;
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
    }
    setLangState(l);
  }, []);

  const value = useMemo<I18nState>(() => ({ lang, locale: LOCALES[lang], setLang, t: translate }), [lang, setLang]);
  return (
    <I18nContext.Provider value={value}>
      <Fragment key={lang}>{children}</Fragment>
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
