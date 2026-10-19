import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { en } from "./en";
import { es } from "./es";
import { ru } from "./ru";

export type Locale = "en" | "es" | "ru";
export type Dict = typeof en;

const DICTS: Record<Locale, Dict> = { en, es, ru };
export const LOCALES: { code: Locale; name: string }[] = [
  { code: "en", name: "English" },
  { code: "es", name: "Español" },
  { code: "ru", name: "Русский" },
];
const KEY = "labless.locale";

export function deviceLocale(): Locale {
  const code = getLocales()[0]?.languageCode ?? "en";
  return code === "es" || code === "ru" ? code : "en";
}

type Ctx = { locale: Locale; t: Dict; setLocale: (l: Locale) => void; ready: boolean };
const I18nContext = createContext<Ctx>({ locale: "en", t: en, setLocale: () => {}, ready: false });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(deviceLocale());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v === "en" || v === "es" || v === "ru") setLocaleState(v);
      })
      .finally(() => setReady(true));
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    AsyncStorage.setItem(KEY, l).catch(() => {});
  }, []);

  const value = useMemo(() => ({ locale, t: DICTS[locale], setLocale, ready }), [locale, setLocale, ready]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);

/** Fill `{name}` placeholders. */
export function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`).toString());
}

const intlLocale: Record<Locale, string> = { en: "en-US", es: "es-US", ru: "ru-RU" };

export function formatDate(value: string | null | undefined, locale: Locale, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  if (!value) return "";
  const d = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(intlLocale[locale], opts).format(d);
  } catch {
    return d.toDateString();
  }
}

export function formatNumber(value: number | null | undefined, locale: Locale) {
  if (value == null || !Number.isFinite(value)) return "—";
  const digits = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2;
  try {
    return new Intl.NumberFormat(intlLocale[locale], { maximumFractionDigits: digits }).format(value);
  } catch {
    return String(Math.round(value * 100) / 100);
  }
}
