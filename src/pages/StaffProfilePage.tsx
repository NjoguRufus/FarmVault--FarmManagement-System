import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useStaff } from '@/contexts/StaffContext';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UserAvatar } from '@/components/UserAvatar';
import { uploadEmployeeAvatar, clearEmployeeAvatar } from '@/services/avatarService';
import { useQueryClient } from '@tanstack/react-query';
import { resolveUserDisplayName } from '@/lib/userDisplayName';
import { logger } from "@/lib/logger";

export default function StaffProfilePage() {
  const { user, employeeProfile } = useAuth();
  const { fullName, companyName, roleLabel, companyId, employeeId, avatarUrl: staffAvatarUrl } = useStaff();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState(() =>
    resolveUserDisplayName({ profileDisplayName: fullName, email: user?.email }),
  );
  const [avatarUrl, setAvatarUrl] = useState<string | null>(staffAvatarUrl ?? null);
  const [employeeRow, setEmployeeRow] = useState<{
    id: string;
    company_id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    avatar_url: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!user) {
    return (
      <div className="p-4">
        <p className="text-muted-foreground text-sm">You must be signed in to view this page.</p>
      </div>
    );
  }

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!companyId || !employeeId) {
        setLoading(false);
        return;
      }
      try {
        const { data, error } = await db
          .public()
          .from('employees')
          .select('id, company_id, full_name, email, phone, avatar_url')
          .eq('id', employeeId)
          .eq('company_id', companyId)
          .limit(1);

        const row = (Array.isArray(data) && data.length > 0 ? (data[0] as typeof employeeRow) : null) ?? null;

        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          logger.log('[StaffProfile] initial employee row loaded', {
            table: 'public.employees',
            companyId,
            employeeId,
            clerkUserId: user.id,
            data,
            row,
            error,
          });
        }

        if (cancelled) return;
        if (error) {
          throw error;
        }
        if (row) {
          setEmployeeRow(row);
          const nameFromRow = resolveUserDisplayName({
            profileDisplayName:
              row.full_name && String(row.full_name).trim().length > 0 ? String(row.full_name) : fullName,
            email: row.email ?? user.email,
          });
          setDisplayName(nameFromRow);
          const avatarFromRow =
            (row.avatar_url && String(row.avatar_url).trim().length > 0
              ? String(row.avatar_url)
              : null) ??
            staffAvatarUrl ??
            (user.avatar as string | null) ??
            null;
          setAvatarUrl(avatarFromRow);
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            logger.log('[StaffProfile] final displayed values', {
              displayName: nameFromRow,
              avatarUrl: avatarFromRow,
            });
          }
        }
      } catch (e) {
        if (!cancelled && import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.error('[StaffProfile] initial load error', e);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [companyId, employeeId, fullName, staffAvatarUrl, user.email, user.avatar]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (!companyId || !employeeId) {
        throw new Error('Your employee record is not linked correctly.');
      }

      const trimmedName = displayName.trim();
      const payload: Record<string, unknown> = {};
      if (trimmedName.length > 0) {
        payload.full_name = trimmedName;
      }

      if (Object.keys(payload).length === 0) {
        setSaving(false);
        return;
      }

      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        logger.log('[StaffProfile] save payload', {
          companyId,
          employeeId,
          payload,
        });
      }

      // Update without .select() to avoid 406 when PostgREST returns 0 or many rows
      const { error: updateError } = await db
        .public()
        .from('employees')
        .update(payload)
        .eq('id', employeeId)
        .eq('company_id', companyId);

      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        logger.log('[StaffProfile] employee update response', {
          table: 'public.employees',
          companyId,
          employeeId,
          clerkUserId: user.id,
          payload,
          updateError,
        });
      }

      if (updateError) {
        throw new Error(updateError?.message ?? 'Failed to update profile.');
      }

      // Separate select so we never request single-object representation (avoids 406)
      const { data: refetched, error: refetchError } = await db
        .public()
        .from('employees')
        .select('id, company_id, full_name, email, phone, avatar_url')
        .eq('id', employeeId)
        .eq('company_id', companyId)
        .limit(1);

      const refetchedRow =
        (Array.isArray(refetched) && refetched.length > 0 ? (refetched[0] as typeof employeeRow) : null) ?? null;

      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        logger.log('[StaffProfile] post-save refetch result', {
          table: 'public.employees',
          companyId,
          employeeId,
          clerkUserId: user.id,
          refetched,
          refetchedRow,
          refetchError,
        });
      }

      if (refetchError || !refetchedRow) {
        throw new Error(refetchError?.message ?? 'Profile saved but could not reload. Please refresh the page.');
      }

      const finalRow = refetchedRow;
      {
        setEmployeeRow(finalRow);
        const finalName = resolveUserDisplayName({
          profileDisplayName:
            finalRow.full_name && String(finalRow.full_name).trim().length > 0
              ? String(finalRow.full_name)
              : null,
          email: finalRow.email ?? user.email,
        });
        const finalAvatar =
          (finalRow.avatar_url && String(finalRow.avatar_url).trim().length > 0
            ? String(finalRow.avatar_url)
            : null) ?? avatarUrl;
        setDisplayName(finalName);
        setAvatarUrl(finalAvatar);

        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          logger.log('[StaffProfile] final displayed values', {
            displayName: finalName,
            avatarUrl: finalAvatar,
          });
        }
      }

      await queryClient.invalidateQueries({
        queryKey: ['staffEmployeeRow', companyId, employeeId],
      });
      await queryClient.invalidateQueries({
        queryKey: ['employees', companyId],
      });

      toast({ title: 'Profile updated', description: 'Your staff profile has been saved.' });
    } catch (e: any) {
      toast({
        title: 'Error',
        description: e?.message ?? 'Failed to update profile.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>My Staff Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <UserAvatar
              avatarUrl={avatarUrl ?? staffAvatarUrl ?? user.avatar}
              name={displayName}
              size="lg"
              className="h-16 w-16"
            />
            <div>
              <p className="text-sm text-muted-foreground">
                This is how you appear in the staff workspace and on the admin side.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Your Name</label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. James Mwangi"
            />
            <p className="text-xs text-muted-foreground">
              Your name as a team member — not your farm or company name. Saving updates your employee record for this
              workspace.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Profile photo</label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0] ?? null;
                  e.target.value = '';
                  if (!file || !user || !companyId || !employeeId) return;

                  setUploadingAvatar(true);
                  try {
                    const result = await uploadEmployeeAvatar({
                      file,
                      companyId,
                      employeeId,
                    });
                    if (import.meta.env.DEV) {
                      // eslint-disable-next-line no-console
                      logger.log('[StaffProfile] avatar upload result', {
                        companyId,
                        employeeId,
                        result,
                      });
                    }

                    const { data: refetched, error: refetchError } = await db
                      .public()
                      .from('employees')
                      .select('id, company_id, full_name, email, phone, avatar_url')
                      .eq('id', employeeId)
                      .eq('company_id', companyId)
                      .limit(1);

                    const refetchedRow =
                      (Array.isArray(refetched) && refetched.length > 0
                        ? (refetched[0] as typeof employeeRow)
                        : null) ?? null;

                    if (import.meta.env.DEV) {
                      // eslint-disable-next-line no-console
                      logger.log('[StaffProfile] post-save refetch result', {
                        table: 'public.employees',
                        companyId,
                        employeeId,
                        clerkUserId: user.id,
                        context: 'avatar',
                        refetched,
                        refetchedRow,
                        refetchError,
                      });
                    }

                    const finalRow = refetchedRow ?? null;
                    if (finalRow) {
                      setEmployeeRow(finalRow);
                      const finalName = resolveUserDisplayName({
                        profileDisplayName:
                          finalRow.full_name && String(finalRow.full_name).trim().length > 0
                            ? String(finalRow.full_name)
                            : displayName,
                        email: finalRow.email ?? user.email,
                      });
                      const finalAvatar =
                        (finalRow.avatar_url && String(finalRow.avatar_url).trim().length > 0
                          ? String(finalRow.avatar_url)
                          : null) ?? result.url;
                      setDisplayName(finalName);
                      setAvatarUrl(finalAvatar);

                      if (import.meta.env.DEV) {
                        // eslint-disable-next-line no-console
                        logger.log('[StaffProfile] final displayed values', {
                          displayName: finalName,
                          avatarUrl: finalAvatar,
                        });
                      }
                    } else {
                      setAvatarUrl(result.url);
                    }

                    await queryClient.invalidateQueries({
                      queryKey: ['staffEmployeeRow', companyId, employeeId],
                    });
                    await queryClient.invalidateQueries({
                      queryKey: ['employees', companyId],
                    });
                    toast({
                      title: 'Profile photo updated',
                      description: 'Your new photo is now visible in the staff workspace.',
                    });
                  } catch (err: any) {
                    toast({
                      title: 'Upload failed',
                      description: err?.message ?? 'Could not upload profile photo.',
                      variant: 'destructive',
                    });
                  } finally {
                    setUploadingAvatar(false);
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploadingAvatar || !companyId || !employeeId}
                onClick={() => {
                  if (!companyId || !employeeId) {
                    toast({
                      title: 'Cannot upload photo',
                      description: 'Your employee record is not linked correctly. Contact your admin.',
                      variant: 'destructive',
                    });
                    return;
                  }
                  fileInputRef.current?.click();
                }}
              >
                {uploadingAvatar ? 'Uploading…' : 'Upload photo'}
              </Button>
              {(avatarUrl ?? staffAvatarUrl) && companyId && employeeId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={uploadingAvatar}
                  onClick={async () => {
                    try {
                      await clearEmployeeAvatar(companyId, employeeId);
                      setAvatarUrl(null);
                      await queryClient.invalidateQueries({
                        queryKey: ['staffEmployeeRow', companyId, employeeId],
                      });
                      await queryClient.invalidateQueries({
                        queryKey: ['employees', companyId],
                      });
                      toast({
                        title: 'Profile photo removed',
                        description: 'We will now show your initials instead.',
                      });
                    } catch (err: any) {
                      toast({
                        title: 'Failed to remove photo',
                        description: err?.message ?? 'Could not remove profile photo.',
                        variant: 'destructive',
                      });
                    }
                  }}
                >
                  Remove photo
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Supported formats: JPG, PNG, WebP. Maximum size 5MB.
            </p>
          </div>

          <div className="space-y-1 text-sm text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Email:</span> {user.email}
            </p>
            {companyName && (
              <p>
                <span className="font-medium text-foreground">Company:</span> {companyName}
              </p>
            )}
            {roleLabel && (
              <p>
                <span className="font-medium text-foreground">Role:</span> {roleLabel}
              </p>
            )}
          </div>

          <div className="pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save profile'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

