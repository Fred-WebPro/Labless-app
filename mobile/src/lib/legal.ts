import * as WebBrowser from "expo-web-browser";

const SITE = "https://labless.dilami.pro";
const lang = (locale: string) => (["en", "es", "ru"].includes(locale) ? locale : "en");

export const privacyUrl = (locale: string) => `${SITE}/${lang(locale)}/privacy`;
export const termsUrl = (locale: string) => `${SITE}/${lang(locale)}/terms`;

/** Opens a legal page in the in-app browser sheet. */
export function openLegal(kind: "privacy" | "terms", locale: string) {
  WebBrowser.openBrowserAsync(kind === "privacy" ? privacyUrl(locale) : termsUrl(locale)).catch(() => {});
}
