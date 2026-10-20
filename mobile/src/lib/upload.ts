import * as Crypto from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { Platform } from "react-native";
import type { ResolvedSharePayload } from "expo-sharing";
import { api } from "@/lib/api";
import { track } from "@/lib/analytics";
import { supabase } from "@/lib/supabase";

export type Page = { key: string; uri: string; kind: "image" | "pdf"; name?: string; width?: number; height?: number };

export const MAX_PAGES = 10;

export class PermissionError extends Error {}

const newKey = () => Math.random().toString(36).slice(2, 10);

export async function pickFromCamera(): Promise<Page[]> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new PermissionError("camera");
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.9 });
  if (res.canceled) return [];
  return res.assets.map((a) => ({ key: newKey(), uri: a.uri, kind: "image", width: a.width, height: a.height }));
}

export async function pickFromLibrary(limit: number): Promise<Page[]> {
  if (Platform.OS !== "web") {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) throw new PermissionError("library");
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    selectionLimit: Math.max(1, limit),
    quality: 0.9,
  });
  if (res.canceled) return [];
  return res.assets.slice(0, limit).map((a) => ({ key: newKey(), uri: a.uri, kind: "image", width: a.width, height: a.height }));
}

/** Turns files shared from other apps into pages. Anything that isn't a photo or a PDF is skipped. */
export function pagesFromShare(payloads: ResolvedSharePayload[]): Page[] {
  const pages: Page[] = [];
  for (const p of payloads) {
    if (!p.contentUri) continue;
    const mime = (p.contentMimeType ?? p.mimeType ?? "").toLowerCase();
    const name = p.originalName ?? undefined;
    const isPdf = mime === "application/pdf" || /\.pdf$/i.test(name ?? p.contentUri);
    const isImage = p.contentType === "image" || mime.startsWith("image/");
    if (isPdf) pages.push({ key: newKey(), uri: p.contentUri, kind: "pdf", name });
    else if (isImage) pages.push({ key: newKey(), uri: p.contentUri, kind: "image", name });
  }
  return pages.slice(0, MAX_PAGES);
}

export async function pickPdf(): Promise<Page[]> {
  const res = await DocumentPicker.getDocumentAsync({ type: "application/pdf", multiple: false, copyToCacheDirectory: true });
  if (res.canceled) return [];
  return res.assets.map((a) => ({ key: newKey(), uri: a.uri, kind: "pdf", name: a.name }));
}

// ---------- Encoding ----------

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const LOOKUP = new Uint8Array(256);
for (let i = 0; i < B64.length; i++) LOOKUP[B64.charCodeAt(i)] = i;

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^,]+,/, "").replace(/[^A-Za-z0-9+/]/g, "");
  const len = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(len);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = LOOKUP[clean.charCodeAt(i)];
    const b = LOOKUP[clean.charCodeAt(i + 1)];
    const c = LOOKUP[clean.charCodeAt(i + 2)];
    const d = LOOKUP[clean.charCodeAt(i + 3)];
    out[p++] = (a << 2) | (b >> 4);
    if (i + 2 < clean.length) out[p++] = ((b & 15) << 4) | (c >> 2);
    if (i + 3 < clean.length) out[p++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, p);
}

/** Shrinks photos to a size that reads perfectly and uploads fast. */
async function imageBytes(page: Page): Promise<Uint8Array> {
  const maxSide = 2000;
  let ref = await ImageManipulator.manipulate(page.uri).renderAsync();
  // Shared files arrive without dimensions, so size is checked on the decoded image.
  if (Math.max(ref.width, ref.height) > maxSide) {
    const ctx = ImageManipulator.manipulate(page.uri);
    if (ref.width >= ref.height) ctx.resize({ width: maxSide });
    else ctx.resize({ height: maxSide });
    ref = await ctx.renderAsync();
  }
  const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.78, base64: true });
  if (!saved.base64) throw new Error("encode_failed");
  return base64ToBytes(saved.base64);
}

async function pdfBytes(page: Page): Promise<Uint8Array> {
  if (Platform.OS === "web") {
    const res = await fetch(page.uri);
    return new Uint8Array(await res.arrayBuffer());
  }
  return new File(page.uri).bytes();
}

/**
 * Uploads the pages, creates the report and starts the analysis.
 * Returns the new report id right away; the analysis continues on the server.
 */
export async function submitReport(memberId: string, pages: Page[], onProgress: (done: number, total: number) => void): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error("signed_out");

  const reportId = Crypto.randomUUID();
  const files: { path: string; type: string }[] = [];
  track("upload_started", { pages: pages.length, pdf: pages.some((p) => p.kind === "pdf") });

  for (let i = 0; i < pages.length; i++) {
    onProgress(i, pages.length);
    const page = pages[i];
    const isPdf = page.kind === "pdf";
    const bytes = isPdf ? await pdfBytes(page) : await imageBytes(page);
    const path = `${userId}/${reportId}/${String(i + 1).padStart(2, "0")}.${isPdf ? "pdf" : "jpg"}`;
    const type = isPdf ? "application/pdf" : "image/jpeg";
    const { error } = await supabase.storage.from("reports").upload(path, bytes, { contentType: type, upsert: true });
    if (error) throw new Error(error.message);
    files.push({ path, type });
  }
  onProgress(pages.length, pages.length);

  const { error } = await supabase.from("reports").insert({
    id: reportId,
    owner_id: userId,
    member_id: memberId,
    status: "uploaded",
    files,
  });
  if (error) throw new Error(error.message);

  await api("/api/analyze", { body: { reportId } });
  track("report_uploaded", { report_id: reportId, pages: pages.length });
  return reportId;
}

export async function restartAnalysis(reportId: string) {
  await api("/api/analyze", { body: { reportId } });
}
