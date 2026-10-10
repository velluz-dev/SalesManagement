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

/** Intl locale per language. Myanmar uses Burmese month names but Western digits, as in business documents. */
const LOCALES: Record<Lang, string> = { en: 'en-US', my: 'my-MM-u-nu-latn' };

function readStoredLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'my' || v === 'en' ? v : 'en';
  } catch {
    return 'en';
  }
}

// Module-level copy so non-React helpers (formatters, error messages) translate too.
let current: Lang = readStoredLang();

export const currentLang = () => current;
export const currentLocale = () => LOCALES[current];

/**
 * Translates an English UI string. Unknown strings fall back to the English text, so user data and
 * untranslated text pass through unchanged. `{name}` placeholders are filled from `vars`.
 */
export function translate(text: string, vars?: Record<string, string | number>): string {
  const out = DICTIONARIES[current][text] ?? text;
  return vars ? out.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : out;
}

/** Translates a ReactNode only when it is a plain string; elements are returned as-is. */
export function tNode(node: ReactNode): ReactNode {
  return typeof node === 'string' ? translate(node) : node;
}

/** Human label for an enum value (status, stage, method, role code…) in the current language. */
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
      /* preference only */
    }
    setLangState(l);
  }, []);

  const value = useMemo<I18nState>(() => ({ lang, locale: LOCALES[lang], setLang, t: translate }), [lang, setLang]);
  // Remounting on change makes every screen pick up the new language at once (data caches are kept).
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
