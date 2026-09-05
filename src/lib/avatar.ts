/**
 * The user's own photo: picked from their library, kept in a private bucket, read back through a
 * short-lived signed URL.
 *
 * Everything about the storage side is stated in `20260905120000_add_user_avatar.sql` — a private
 * `avatars` bucket whose policies allow a user to touch only the folder named after their uid.
 * This module is the app's half of that contract, and it holds the two rules the screens must not
 * have to remember:
 *
 *  1. **`users.avatar_path` stores a key, never a URL.** A signed URL expires; a row that kept one
 *     would go on promising an image that had stopped resolving. The URL is minted on read.
 *  2. **Every upload writes a new key.** A fixed `avatar.jpg` would be replaced in the bucket while
 *     every cache between it and the screen — expo-image's disk cache, the CDN — went on serving
 *     the previous face, which is the one thing a user changing their photo will not accept. The
 *     epoch-ms filename makes each photo its own object, so the old one is deleted rather than
 *     overwritten and nothing has a stale copy to serve.
 */
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';

const BUCKET = 'avatars';

/** How long a minted URL lives. Long enough that a session spent in Settings never re-signs,
 *  short enough that a URL which escapes the device is worthless by the time it is used. */
const SIGNED_URL_SECONDS = 60 * 60;

/** What the bucket accepts (`allowed_mime_types` in the migration), and the extension each takes.
 *  A type outside this map is one storage would reject, so it is refused here instead — with a
 *  sentence, rather than as a 400 from the network layer. */
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** A photo the user chose, and the type it will be stored as. */
export type PickedPhoto = { uri: string; mimeType: string };

/**
 * Open the system photo library and return the chosen image, or `null` if the user backed out.
 *
 * `allowsEditing` with a square aspect is doing real work: it hands the user the OS's own crop UI,
 * so what they see framed is exactly what the circle in Settings will show, and it re-encodes the
 * result — which is how a modern iPhone's HEIC becomes a JPEG the bucket will take. `quality` is
 * the file-size lever; a 0.7 JPEG of a cropped square lands comfortably inside the bucket's 2 MB
 * cap at any sensible resolution.
 *
 * No permission is requested. Both platforms now hand this to an out-of-process picker (iOS's
 * `PHPickerViewController`, Android's photo picker) which grants access to the single chosen item
 * and needs no library-wide grant — asking for one would be a prompt that buys nothing.
 */
export async function pickPhoto(): Promise<PickedPhoto | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  // The editor re-encodes to JPEG, so the fallback is the answer in practice rather than a guess.
  const mimeType = asset.mimeType && asset.mimeType in EXTENSIONS ? asset.mimeType : 'image/jpeg';
  return { uri: asset.uri, mimeType };
}

/**
 * Put a picked photo in the bucket and return its key. The caller writes that key to
 * `users.avatar_path`; until it does, the object is unreferenced (and the previous photo is still
 * the live one) — so a failure here leaves the user exactly where they were.
 */
export async function uploadPhoto(userId: string, photo: PickedPhoto): Promise<string> {
  // Raw bytes, not a `Blob`/`File`/`FormData`: storage-js says in as many words that those three
  // "do not work as intended" on React Native (the RN `Blob` is a handle to native data, not the
  // bytes), and an upload built from one lands as a 0-byte object — a photo that saved cleanly and
  // renders as a broken frame. An `ArrayBuffer` is the shape it asks for.
  const bytes = await new File(photo.uri).arrayBuffer();
  const path = `${userId}/${Date.now()}.${EXTENSIONS[photo.mimeType]}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: photo.mimeType,
  });
  if (error) throw error;
  return path;
}

/** A URL the `<Image>` can load, valid for {@link SIGNED_URL_SECONDS}. `null` when the object has
 *  gone (a photo deleted from another device, say) — the caller falls back to the monogram rather
 *  than showing a broken frame. */
export async function signedPhotoUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  return data?.signedUrl ?? null;
}

/** Delete an object. Called after the row has stopped pointing at it, so a failure here is a
 *  stranded blob and not a broken screen — which is why callers may ignore what it returns. */
export async function deletePhoto(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]);
}
