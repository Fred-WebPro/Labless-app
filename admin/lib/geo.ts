import { adminDb } from "@/lib/supabase";

/** Saves the country, region and city Vercel derives from the request IP. The IP itself is not stored. */
export async function recordGeo(req: Request, userId: string) {
  const country = req.headers.get("x-vercel-ip-country");
  if (!country) return;
  const decode = (v: string | null) => {
    if (!v) return null;
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  };
  await adminDb()
    .from("profiles")
    .update({
      geo_country: country,
      geo_region: decode(req.headers.get("x-vercel-ip-country-region")),
      geo_city: decode(req.headers.get("x-vercel-ip-city")),
      geo_at: new Date().toISOString(),
    })
    .eq("id", userId);
}
