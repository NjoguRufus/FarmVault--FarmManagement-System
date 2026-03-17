/**
 * FarmVault avatar: custom uploads stored in Supabase Storage,
 * URL saved to core.profiles.avatar_url.
 * Priority in UI: profile.avatar_url > Clerk/Google imageUrl > initials.
 */

import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';

const AVATARS_BUCKET = 'avatars';
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2MB (profile avatars)
const MAX_EMPLOYEE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB (employee staff avatars)
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

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[AvatarUpload/profile] Uploading avatar', {
      bucket: AVATARS_BUCKET,
      path,
      size: file.size,
      type: file.type,
      schema: 'core',
      table: 'profiles',
      where: { clerk_user_id: clerkUserId },
    });
  }

  const { error: uploadError } = await supabase.storage
    .from(AVATARS_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) {
    throw new Error(uploadError.message || 'Upload failed');
  }

  const { data: urlData } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path);
  const url = urlData?.publicUrl ?? '';

  const { data: updatedRow, error: updateError } = await db
    .core()
    .from('profiles')
    .update({ avatar_url: url })
    .eq('clerk_user_id', clerkUserId)
    .select('clerk_user_id, avatar_url')
    .maybeSingle();

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[AvatarUpload/profile] Supabase update response', {
      data: updatedRow,
      error: updateError,
    });
  }

  if (updateError) {
    throw new Error(updateError.message || 'Failed to save avatar URL to profile');
  }

  return { url, path };
}

export interface UploadEmployeeAvatarParams {
  file: File;
  companyId: string;
  employeeId: string;
}

/**
 * Upload employee avatar to Storage and save public URL to public.employees.avatar_url.
 * Path: avatars/{company_id}/{employee_id}.ext
 */
export async function uploadEmployeeAvatar(params: UploadEmployeeAvatarParams): Promise<UploadAvatarResult> {
  const { file, companyId, employeeId } = params;

  if (!file || !companyId || !employeeId) {
    throw new Error('File, company id, and employee id are required');
  }
  if (file.size > MAX_EMPLOYEE_SIZE_BYTES) {
    throw new Error('Image must be 5MB or smaller');
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Allowed types: JPEG, PNG, WebP');
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const safeExt = ['jpeg', 'jpg', 'png', 'webp'].includes(ext) ? ext : 'jpg';
  const path = `avatars/${companyId}/${employeeId}.${safeExt}`;

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[AvatarUpload] selected file', {
      name: file.name,
      size: file.size,
      type: file.type,
      companyId,
      employeeId,
    });
    // eslint-disable-next-line no-console
    console.log('[AvatarUpload] uploading to storage', { bucket: AVATARS_BUCKET, path });
  }

  const { error: uploadError } = await supabase.storage
    .from(AVATARS_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) {
    throw new Error(uploadError.message || 'Upload failed');
  }

  const { data: urlData } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path);
  const url = urlData?.publicUrl ?? '';

  if (!url) {
    throw new Error('Failed to resolve public URL for avatar');
  }

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[AvatarUpload] upload success', { path, url });
  }

  const { error: updateError } = await db
    .public()
    .from('employees')
    .update({ avatar_url: url })
    .eq('company_id', companyId)
    .eq('id', employeeId);

  if (updateError) {
    throw new Error(updateError.message || 'Failed to save avatar URL');
  }

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[AvatarUpload] saved avatar_url', { companyId, employeeId, url });
  }

  return { url, path };
}

export async function clearEmployeeAvatar(companyId: string, employeeId: string): Promise<void> {
  const { error } = await db
    .public()
    .from('employees')
    .update({ avatar_url: null })
    .eq('company_id', companyId)
    .eq('id', employeeId);

  if (error) {
    throw new Error(error.message || 'Failed to clear employee avatar');
  }
}

/**
 * Remove custom avatar: clear profile.avatar_url (storage object can remain for simplicity).
 */
export async function clearAvatar(clerkUserId: string): Promise<void> {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[AvatarUpload/profile] Clearing avatar', {
      schema: 'core',
      table: 'profiles',
      where: { clerk_user_id: clerkUserId },
      updates: { avatar_url: null },
    });
  }

  const { data, error } = await db
    .core()
    .from('profiles')
    .update({ avatar_url: null })
    .eq('clerk_user_id', clerkUserId)
    .select('clerk_user_id, avatar_url')
    .maybeSingle();

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[AvatarUpload/profile] Clear avatar response', {
      data,
      error,
    });
  }

  if (error) {
    throw new Error(error.message || 'Failed to clear avatar');
  }
}
