import { getCountryForTimezone } from "countries-and-timezones";

const names = new Intl.DisplayNames(["ru"], { type: "region" });

/** Country by its ISO code (e.g. the region set in the phone's settings). Null when unknown. */
export function countryFromCode(code: string | null | undefined): { code: string; name: string } | null {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return null;
  const upper = code.toUpperCase();
  return { code: upper, name: names.of(upper) ?? upper };
}

/** Country of the phone's time zone (the app reports it on every open). Null when unknown. */
export function countryFromTimezone(tz: string | null | undefined): { code: string; name: string } | null {
  if (!tz) return null;
  return countryFromCode(getCountryForTimezone(tz)?.id);
}
