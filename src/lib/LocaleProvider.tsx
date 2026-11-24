import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { translate, type DashboardLocale } from './i18n';

interface LocaleContextValue {
  locale: DashboardLocale;
  setLocale: (locale: DashboardLocale) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: 'en',
  setLocale: () => undefined,
  t: (key) => key,
});

export const LocaleProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [locale, setLocaleState] = useState<DashboardLocale>(() => {
    const stored = window.localStorage.getItem('shadowslayers-dashboard-locale');
    return stored === 'sv' ? 'sv' : 'en';
  });

  const setLocale = useCallback((next: DashboardLocale) => {
    window.localStorage.setItem('shadowslayers-dashboard-locale', next);
    setLocaleState(next);
  }, []);

  const t = useCallback(
    (key: string, values?: Record<string, string | number>) => translate(key, locale, values),
    [locale],
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
};

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}
