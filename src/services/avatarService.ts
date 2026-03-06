/**
 * FarmVault avatar: custom uploads stored in Supabase Storage,
 * URL saved to core.profiles.avatar_url.
 * Priority in UI: profile.avatar_url > Clerk/Google imageUrl > initials.
 */

import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';

const AVATARS_BUCKET = 'avatars';
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

export interface UploadAvatarParams {
  file: File;
  clerkUserId: string;
  companyId: string | null;
}

export interface UploadAvatarResult {
  url: string;
  path: string;
}

/**
 * Upload avatar to Storage and save public URL to core.profiles.avatar_url.
 * Path: avatars/{company_id}/{clerk_user_id}.jpg (or .png/.webp from file).
 * UI resolution order: profile.avatar_url (custom) > Clerk/Google imageUrl > initials.
 */
export async function uploadAvatar(params: UploadAvatarParams): Promise<UploadAvatarResult> {
  const { file, clerkUserId, companyId } = params;

  if (!file || !clerkUserId) {
    throw new Error('File and user id are required');
  }
  if (file.size > MAX_SIZE_BYTES) {
    throw new Error('Image must be 2MB or smaller');
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Allowed types: JPEG, PNG, WebP');
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const safeExt = ['jpeg', 'jpg', 'png', 'webp'].includes(ext) ? ext : 'jpg';
  const folder = companyId && companyId.trim() !== '' ? companyId : 'default';
  const path = `${folder}/${clerkUserId}.${safeExt}`;

  const { error: uploadError } = await supabase.storage
    .from(AVATARS_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) {
    throw new Error(uploadError.message || 'Upload failed');
  }

  const { data: urlData } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path);
  const url = urlData?.publicUrl ?? '';

  const { error: updateError } = await db
    .core()
    .from('profiles')
    .update({ avatar_url: url })
    .eq('clerk_user_id', clerkUserId);

  if (updateError) {
    throw new Error(updateError.message || 'Failed to save avatar URL to profile');
  }

  return { url, path };
}

/**
 * Remove custom avatar: clear profile.avatar_url (storage object can remain for simplicity).
 */
export async function clearAvatar(clerkUserId: string): Promise<void> {
  const { error } = await db
    .core()
    .from('profiles')
    .update({ avatar_url: null })
    .eq('clerk_user_id', clerkUserId);

  if (error) {
    throw new Error(error.message || 'Failed to clear avatar');
  }
}
