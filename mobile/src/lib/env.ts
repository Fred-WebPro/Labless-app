export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "https://admin.labless.dilami.pro").replace(/\/$/, "");
/** Password reset links must point at an address on the Supabase redirect allowlist. */
export const RESET_URL = "https://labless-admin.vercel.app/auth/reset";
