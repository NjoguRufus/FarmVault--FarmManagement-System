import React, { useRef, useState, useEffect } from 'react';
import { Settings as SettingsIcon, Building2, AlertTriangle, Trash2, Loader2, Lock, Save, User, Upload, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteAllCompanyData } from '@/services/companyDataService';
import { getCompany, updateCompany } from '@/services/companyService';
import { useNotifications } from '@/contexts/NotificationContext';
import { useTour } from '@/tour/TourProvider';
import { UserAvatar } from '@/components/UserAvatar';
import { uploadAvatar, clearAvatar } from '@/services/avatarService';
import { NotificationSettings } from '@/components/notifications/NotificationSettings';
import { QuickUnlockSettings } from '@/components/settings/QuickUnlockSettings';
import { db } from '@/lib/db';
import { useUser } from '@clerk/react';
import { resolveUserDisplayNameFromSources } from '@/lib/userDisplayName';
import { AnalyticsEvents, captureEvent } from '@/lib/analytics';
import { logger } from "@/lib/logger";

const PLANS = [
  { value: 'starter', label: 'Starter' },
  { value: 'professional', label: 'Professional' },
  { value: 'enterprise', label: 'Enterprise' },
] as const;

const STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'inactive', label: 'Inactive' },
] as const;

export default function SettingsPage() {
  const { user, refreshUserAvatar, refreshUserProfile } = useAuth();
  const { user: clerkUser } = useUser();
  const queryClient = useQueryClient();
  const { addNotification } = useNotifications();
  const { startTour } = useTour();
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | undefined>(user?.avatar);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile state
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileName, setProfileName] = useState('');
  const [originalProfileName, setOriginalProfileName] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const deletePasswordRequired = import.meta.env.VITE_COMPANY_DELETE_PASSWORD ?? '';

  const isCompanyAdmin = user?.role === 'company-admin' || (user as any)?.role === 'company_admin';
  const isDeveloper = user?.role === 'developer';
  const canEditCompany = isCompanyAdmin || isDeveloper;
  const companyId = user?.companyId ?? null;

  // Load profile name from database on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) {
        setProfileLoading(false);
        return;
      }
      try {
        const { data, error } = await db
          .core()
          .from('profiles')
          .select('full_name, avatar_url')
          .eq('clerk_user_id', user.id)
          .maybeSingle();
        
        if (error) throw error;
        if (cancelled) return;
        
        const stored =
          data?.full_name != null && String(data.full_name).trim().length > 0 ? String(data.full_name) : null;
        const fullName = resolveUserDisplayNameFromSources(stored, clerkUser, user.email);

        setProfileName(fullName);
        setOriginalProfileName(fullName);
      } catch (e) {
        if (import.meta.env.DEV) {
          console.warn('[SettingsPage] Profile load failed', e);
        }
        const fallback = resolveUserDisplayNameFromSources(null, clerkUser, user.email);
        setProfileName(fallback);
        setOriginalProfileName(fallback);
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, user?.name, user?.email, clerkUser?.fullName, clerkUser?.firstName, clerkUser?.lastName, clerkUser?.username]);

  // Check if profile has unsaved changes
  const profileHasChanges = profileName.trim() !== originalProfileName.trim();
  const profileNameIsValid = profileName.trim().length > 0;

  // Handle profile save
  const handleSaveProfile = async () => {
    if (!user?.id) return;
    
    const trimmedName = profileName.trim();
    if (!trimmedName) {
      setProfileError('Your name cannot be empty');
      return;
    }

    setProfileSaving(true);
    setProfileError(null);
    
    try {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        logger.log('[Settings/ProfileSave] Updating profile', {
          schema: 'core',
          table: 'profiles',
          where: { clerk_user_id: user.id },
          updates: {
            full_name: trimmedName,
          },
        });
      }

      // Update the profile in the database and return the updated row
      const { data: updatedRow, error } = await db
        .core()
        .from('profiles')
        .update({ 
          full_name: trimmedName,
          updated_at: new Date().toISOString(),
        })
        .eq('clerk_user_id', user.id)
        .select('clerk_user_id, full_name, avatar_url, active_company_id')
        .maybeSingle();
      
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        logger.log('[Settings/ProfileSave] Supabase update response', {
          data: updatedRow,
          error,
        });
      }

      if (error) {
        throw error;
      }

      // Verification read-back: fetch the profile again to ensure it persisted
      const { data: verifyRow, error: verifyError } = await db
        .core()
        .from('profiles')
        .select('clerk_user_id, full_name, avatar_url, active_company_id')
        .eq('clerk_user_id', user.id)
        .maybeSingle();

      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        logger.log('[Settings/ProfileSave] Verification query', {
          data: verifyRow,
          error: verifyError,
        });
      }

      if (verifyError) {
        throw verifyError;
      }

      if (verifyRow && verifyRow.full_name !== trimmedName) {
        throw new Error('Verification failed: saved profile name does not match expected value');
      }

      // Refresh the auth context to update user.name everywhere
      await refreshUserProfile?.();

      // Update local state
      setOriginalProfileName(trimmedName);
      
      addNotification({ 
        title: 'Profile updated', 
        message: 'Your name has been saved and updated everywhere.', 
        toastType: 'success' 
      });
      captureEvent(AnalyticsEvents.SETTINGS_UPDATED, {
        user_id: user.id,
        company_id: user.companyId ?? undefined,
        settings_section: 'profile',
        module_name: 'settings',
        route_path: '/settings',
      });
    } catch (e: any) {
      setProfileError(e?.message || 'Failed to save profile');
    } finally {
      setProfileSaving(false);
    }
  };

  const { data: company, isLoading: companyLoading, refetch: refetchCompany } = useQuery({
    queryKey: ['company', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      if (!companyId) return null;
      return getCompany(companyId);
    },
    staleTime: 30_000,
  });

  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPlan, setEditPlan] = useState<string>('');
  const [editStatus, setEditStatus] = useState<string>('');

  useEffect(() => {
    if (company) {
      setEditName(company.name ?? '');
      setEditEmail(company.email ?? '');
      setEditPlan(company.plan ?? 'starter');
      setEditStatus(company.status ?? 'active');
    }
  }, [company]);

  useEffect(() => {
    setAvatarPreviewUrl(user?.avatar);
  }, [user?.avatar]);

  // Check if there are unsaved changes
  const hasChanges =
    (editName.trim() !== (company?.name ?? '').trim()) ||
    (editEmail.trim() !== (company?.email ?? '').trim()) ||
    (editPlan !== (company?.plan ?? 'starter')) ||
    (editStatus !== (company?.status ?? 'active'));

  // Validate company name
  const nameIsValid = editName.trim().length > 0;

  const handleSaveCompany = async () => {
    if (!companyId || !canEditCompany) return;
    
    // Validate before saving
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setSaveError('Farm or company name cannot be empty');
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        logger.log('[Settings/CompanySave] Updating company', {
          schema: 'core',
          table: 'companies',
          companyId,
          payload: {
            name: trimmedName,
            email: editEmail.trim() || undefined,
            plan: editPlan || undefined,
            status: editStatus || undefined,
          },
        });
      }

      await updateCompany(companyId, {
        name: trimmedName,
        email: editEmail.trim() || undefined,
        plan: editPlan || undefined,
        status: editStatus || undefined,
      });
      
      // Invalidate all company-related queries to refresh company name everywhere
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['company', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['staffCompany', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['companies'] }),
      ]);
      
      // Refetch to ensure local state is updated and log verification result
      const { data: verifiedCompany, error: verifyError } = await db
        .core()
        .from('companies')
        .select('id, name, email, plan, status, billing_reference')
        .eq('id', companyId)
        .maybeSingle();

      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        logger.log('[Settings/CompanySave] Verification query', {
          data: verifiedCompany,
          error: verifyError,
        });
      }

      if (verifyError) {
        throw verifyError;
      }

      if (verifiedCompany && verifiedCompany.name !== trimmedName) {
        throw new Error('Verification failed: saved company name does not match expected value');
      }

      // Also let React Query refetch to keep hooks in sync
      await refetchCompany();
      
      addNotification({ title: 'Company updated', message: 'Your company details have been saved.', toastType: 'success' });
      captureEvent(AnalyticsEvents.SETTINGS_UPDATED, {
        user_id: user?.id,
        company_id: companyId,
        settings_section: 'company',
        module_name: 'settings',
        route_path: '/settings',
      });
    } catch (e: any) {
      setSaveError(e?.message || 'Failed to save company details');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEverything = async () => {
    if (!companyId || !isCompanyAdmin) return;
    if (deleteConfirm !== 'DELETE') return;
    if (deletePasswordRequired && deletePassword !== deletePasswordRequired) {
      setDeleteError('Incorrect password');
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAllCompanyData(companyId);
      setDeleteConfirm('');
      setDeletePassword('');
      addNotification({ title: 'Company data deleted', message: 'All company data has been removed.', toastType: 'warning' });
      alert('All company data has been deleted. You can continue using the app with a clean slate.');
      window.location.reload();
    } catch (e: any) {
      setDeleteError(e?.message || 'Failed to delete data');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <SettingsIcon className="h-6 w-6" />
          Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your profile and company settings
        </p>
      </div>

      {/* Profile section - name and avatar editing */}
      <div className="fv-card">
        <div className="flex items-center gap-2 mb-4">
          <User className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">Profile</h3>
        </div>
        
        {profileLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading profile...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {profileError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {profileError}
              </div>
            )}
            
            {/* Avatar section */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              <UserAvatar
                avatarUrl={avatarPreviewUrl}
                name={profileName || user?.name}
                size="lg"
                className="h-20 w-20 shrink-0 rounded-full border-2 border-border"
              />
              <div className="flex-1 space-y-2">
                <p className="text-sm text-muted-foreground">
                  {avatarPreviewUrl
                    ? 'Custom avatar or Google photo. Upload a new image to replace it, or remove to use default.'
                    : 'Upload a profile photo. Google sign-in users can override their Google photo with a custom avatar.'}
                </p>
                {avatarError && (
                  <p className="text-sm text-destructive">{avatarError}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file || !user?.id) return;
                      setAvatarError(null);
                      setAvatarUploading(true);
                      try {
                        const result = await uploadAvatar({
                          file,
                          clerkUserId: user.id,
                          companyId: user.companyId ?? null,
                        });
                        setAvatarPreviewUrl(result.url);
                        await refreshUserAvatar?.();
                        addNotification({ title: 'Avatar updated', message: 'Your profile photo has been saved.', toastType: 'success' });
                      } catch (err: any) {
                        setAvatarError(err?.message ?? 'Upload failed');
                      } finally {
                        setAvatarUploading(false);
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={avatarUploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="fv-btn fv-btn--secondary inline-flex items-center gap-1.5"
                  >
                    {avatarUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {avatarUploading ? 'Uploading…' : 'Upload photo'}
                  </button>
                  {avatarPreviewUrl && (
                    <button
                      type="button"
                      disabled={avatarUploading}
                      onClick={async () => {
                        if (!user?.id) return;
                        setAvatarError(null);
                        setAvatarUploading(true);
                        const previousAvatar = avatarPreviewUrl;
                        setAvatarPreviewUrl(undefined);
                        try {
                          await clearAvatar(user.id);
                          await refreshUserAvatar?.();
                          addNotification({ title: 'Avatar removed', message: 'Using default or Google photo.', toastType: 'success' });
                        } catch (err: any) {
                          setAvatarPreviewUrl(previousAvatar);
                          setAvatarError(err?.message ?? 'Failed to remove');
                        } finally {
                          setAvatarUploading(false);
                        }
                      }}
                      className="fv-btn fv-btn--secondary inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                      Remove photo
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Display name input */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Your Name <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={profileName}
                onChange={(e) => { setProfileName(e.target.value); setProfileError(null); }}
                className={`fv-input w-full max-w-md ${!profileNameIsValid && profileName.length > 0 ? 'border-destructive' : ''}`}
                placeholder="Your display name"
              />
              {!profileNameIsValid && profileName.length > 0 && (
                <p className="mt-1 text-xs text-destructive">Your name is required</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                This name is displayed in the dashboard, navbar, and throughout the app.
              </p>
            </div>

            {/* Save profile button */}
            <button
              type="button"
              disabled={profileSaving || !profileHasChanges || !profileNameIsValid}
              onClick={handleSaveProfile}
              className="fv-btn fv-btn--primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {profileSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span className="ml-1">{profileSaving ? 'Saving…' : profileHasChanges ? 'Save profile' : 'No changes'}</span>
            </button>
          </div>
        )}
      </div>

      <div className="fv-card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Guided Tour</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Walk through the main pages with a guided, step-by-step tour.
            </p>
          </div>
          <button
            type="button"
            className="fv-btn fv-btn--secondary"
            onClick={() => startTour()}
            data-tour="settings-take-tour"
          >
            Take a Tour
          </button>
        </div>
      </div>

      {/* Notification settings */}
      <NotificationSettings />

      {/* Quick unlock / App lock settings */}
      <QuickUnlockSettings />

      {/* Company settings - editable by admins/developers, read-only for staff */}
      <div className="fv-card">
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">Company</h3>
        </div>
        {companyLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading company data...</span>
          </div>
        ) : company && canEditCompany ? (
          <div className="space-y-4">
            {saveError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {saveError}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Farm / Company Name <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => { setEditName(e.target.value); setSaveError(null); }}
                className={`fv-input w-full ${!nameIsValid && editName.length > 0 ? 'border-destructive' : ''}`}
                placeholder="Your farm or business name"
              />
              {!nameIsValid && editName.length > 0 && (
                <p className="mt-1 text-xs text-destructive">Farm or company name is required</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Company email</label>
              <input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="fv-input w-full"
                placeholder="company@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Plan</label>
              <select
                value={editPlan}
                onChange={(e) => setEditPlan(e.target.value)}
                className="fv-input w-full"
              >
                {PLANS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Status</label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
                className="fv-input w-full"
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={saving || !hasChanges || !nameIsValid}
              onClick={handleSaveCompany}
              className="fv-btn fv-btn--primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span className="ml-1">{saving ? 'Saving…' : hasChanges ? 'Save changes' : 'No changes'}</span>
            </button>
          </div>
        ) : company ? (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground mb-3">
              Only company admins can edit these details.
            </p>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground text-xs uppercase tracking-wide">Farm / Company Name</dt>
                <dd className="font-medium text-foreground mt-0.5">{company.name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs uppercase tracking-wide">Company email</dt>
                <dd className="font-medium text-foreground mt-0.5">{company.email ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs uppercase tracking-wide">Plan</dt>
                <dd className="font-medium text-foreground capitalize mt-0.5">{company.plan ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs uppercase tracking-wide">Status</dt>
                <dd className="font-medium text-foreground capitalize mt-0.5">{company.status ?? '—'}</dd>
              </div>
            </dl>
          </div>
        ) : companyId ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Unable to load company data.</p>
            <button
              type="button"
              onClick={() => refetchCompany()}
              className="fv-btn fv-btn--secondary text-sm"
            >
              Try again
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No company associated with your account. Please complete onboarding or contact support.
          </p>
        )}
      </div>

      {/* Danger zone */}
      {canEditCompany && companyId && (
        <div className="fv-card border-destructive/40 border">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <h3 className="text-lg font-semibold text-destructive">Danger zone</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Permanently delete all data for your company: projects, harvests, sales, expenses, inventory,
            employees, and all other records. Your company account and user accounts will remain so you can
            log in again. This cannot be undone.
          </p>
          {deleteError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive mb-4">
              {deleteError}
            </div>
          )}
          <div className="space-y-3 flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-foreground mb-1">
                Type <span className="font-mono font-bold text-destructive">DELETE</span> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => { setDeleteConfirm(e.target.value); setDeleteError(null); }}
                placeholder="DELETE"
                className="fv-input border-destructive/50"
                disabled={deleting}
              />
            </div>
            {deletePasswordRequired && (
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-foreground mb-1">
                  <Lock className="h-3.5 w-3.5 inline mr-1" />
                  Password required to delete
                </label>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => { setDeletePassword(e.target.value); setDeleteError(null); }}
                  placeholder="Enter password"
                  className="fv-input border-destructive/50"
                  disabled={deleting}
                />
              </div>
            )}
            <button
              type="button"
              disabled={deleting || deleteConfirm !== 'DELETE' || (!!deletePasswordRequired && deletePassword !== deletePasswordRequired)}
              onClick={handleDeleteEverything}
              className="fv-btn bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              <span className="ml-1">Delete everything</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
