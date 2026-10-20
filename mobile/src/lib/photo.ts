import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";
import { base64ToBytes, PermissionError } from "@/lib/upload";

/** Lets the person pick a square photo. Null when they cancel. */
export async function pickPhoto(source: "library" | "camera"): Promise<string | null> {
  if (source === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new PermissionError("camera");
  } else if (Platform.OS !== "web") {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) throw new PermissionError("library");
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.85 };
  const res = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  return res.canceled ? null : (res.assets[0]?.uri ?? null);
}

/** Resizes to 512 px, uploads to the private avatars bucket and saves the path on the member. */
export async function uploadMemberPhoto(memberId: string, uri: string, previous: string | null) {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error("signed_out");

  const ref = await ImageManipulator.manipulate(uri).resize({ width: 512 }).renderAsync();
  const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  if (!saved.base64) throw new Error("encode_failed");

  const path = `${userId}/${memberId}-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from("avatars").upload(path, base64ToBytes(saved.base64), { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(error.message);
  const { error: updateError } = await supabase.from("members").update({ photo_path: path }).eq("id", memberId);
  if (updateError) throw new Error(updateError.message);
  if (previous) await supabase.storage.from("avatars").remove([previous]);
  return path;
}

export async function removeMemberPhoto(memberId: string, previous: string | null) {
  await supabase.from("members").update({ photo_path: null }).eq("id", memberId);
  if (previous) await supabase.storage.from("avatars").remove([previous]);
}
