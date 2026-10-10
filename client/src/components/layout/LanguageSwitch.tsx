import { Languages } from 'lucide-react';
import { LANGUAGES, useI18n } from '../../i18n';
import { cn } from '../../lib/cn';

/** English ⇄ မြန်မာ toggle. The choice is remembered on this device. */
export function LanguageSwitch({ className }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div role="group" aria-label={t('Language')} className={cn('inline-flex items-center gap-0.5 rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm', className)}>
      <Languages className="mx-1.5 size-4 text-slate-400" aria-hidden />
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLang(l.code)}
          aria-pressed={lang === l.code}
          lang={l.code}
          className={cn(
            'rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors',
            lang === l.code ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800',
          )}
        >
          {l.short}
        </button>
      ))}
    </div>
  );
}
