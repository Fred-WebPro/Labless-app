import { getCountryForTimezone } from "countries-and-timezones";

const names = new Intl.DisplayNames(["ru"], { type: "region" });

/** Country of the phone's time zone (the app reports it on every open). Null when unknown. */
export function countryFromTimezone(tz: string | null | undefined): { code: string; name: string } | null {
  if (!tz) return null;
  const code = getCountryForTimezone(tz)?.id;
  if (!code) return null;
  return { code, name: names.of(code) ?? code };
}
