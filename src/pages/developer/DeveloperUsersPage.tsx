import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/react';
import { DeveloperPageShell } from '@/components/developer/DeveloperPageShell';
import { fetchDeveloperUsers } from '@/services/developerService';
import { deleteUserSafely } from '@/services/developerAdminService';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { DeveloperUserRow } from '@/services/developerService';
import { resolveUserDisplayName } from '@/lib/userDisplayName';

function UserTypeBadge({ userType }: { userType: string | null | undefined }) {
  const t = (userType ?? 'company_admin').toLowerCase();
  if (t === 'ambassador') {
    return (
      <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium bg-amber-100 text-amber-700">
        Ambassador
      </span>
    );
  }
  if (t === 'both') {
    return (
      <span className={cn(
        'inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium',
        'bg-blue-100 text-blue-700'
      )}>
        Company Admin (Ambassador)
      </span>
    );
  }
  // 'company_admin' or anything else
  return (
    <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium bg-muted text-muted-foreground">
      Company Admin
    </span>
  );
}

export default function DeveloperUsersPage() {
  const [search, setSearch] = useState('');
  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    user: DeveloperUserRow | null;
    confirmValue: string;
  }>({ open: false, user: null, confirmValue: '' });
  const { userId: currentUserId } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['developer', 'users'],
    queryFn: () => fetchDeveloperUsers(),
  });

  const rows = data?.rows ?? [];

  const deleteMutation = useMutation({
    mutationFn: (clerkUserId: string) => deleteUserSafely(clerkUserId),
    onSuccess: (result, clerkUserId) => {
      if (result.success) {
        toast({ title: 'User deleted', description: 'App records have been removed.' });
        queryClient.invalidateQueries({ queryKey: ['developer', 'users'] });
        setDeleteModal({ open: false, user: null, confirmValue: '' });
      } else {
        toast({
          title: 'Deletion blocked',
          description: result.reason ?? 'User could not be deleted.',
          variant: 'destructive',
        });
      }
    },
    onError: (err: Error) => {
      toast({
        title: 'Delete failed',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((u) => {
      const email = (u.email ?? '').toLowerCase();
      const resolvedName = resolveUserDisplayName({
        profileDisplayName: u.full_name,
        email: u.email,
      }).toLowerCase();
      const role = (u.role ?? '').toLowerCase();
      const company = (u.company_name ?? u.company?.company_name ?? '').toLowerCase();
      const userId = (u.user_id ?? '').toLowerCase();
      return (
        email.includes(term) ||
        resolvedName.includes(term) ||
        role.includes(term) ||
        company.includes(term) ||
        userId.includes(term)
      );
    });
  }, [rows, search]);

  return (
    <DeveloperPageShell
      title="Platform Users"
      description="All non-developer user accounts across FarmVault."
      isLoading={isLoading}
      isRefetching={isFetching}
      onRefresh={() => void refetch()}
      searchPlaceholder="Search by email, name, role, or company…"
      searchValue={search}
      onSearchChange={setSearch}
    >
      {error && (
        <div className="fv-card border-destructive/40 bg-destructive/5 text-destructive text-sm">
          {(error as Error).message || 'Failed to load users.'}
        </div>
      )}

      {!isLoading && !error && filtered.length === 0 && (
        <div className="fv-card text-sm text-muted-foreground">
          No users found. Once customers start inviting their teams, they will appear here.
        </div>
      )}

      {filtered.length > 0 && (
        <div className="fv-card overflow-x-visible md:overflow-x-auto">
          <table className="fv-table-mobile w-full min-w-0 text-sm md:min-w-[560px]">
            <thead className="border-b border-border/60 text-xs text-muted-foreground">
              <tr>
                <th className="py-2 text-left font-medium">User</th>
                <th className="py-2 text-left font-medium">Company</th>
                <th className="py-2 text-left font-medium">Role</th>
                <th className="py-2 text-left font-medium">Joined</th>
                <th className="py-2 text-right font-medium w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, idx) => {
                const name = resolveUserDisplayName({
                  profileDisplayName: u.full_name,
                  email: u.email,
                });
                const email = u.email || '—';
                const companyName = u.company_name || u.company?.company_name || 'No Company';
                const role = u.role || u.company?.role || '—';
                const createdAt = u.created_at || '—';
                const clerkUserId = (u as { user_id?: string; id?: string }).user_id ?? (u as { user_id?: string; id?: string }).id ?? '';
                const isCurrentUser = currentUserId != null && clerkUserId === currentUserId;
                const rowKey = `${clerkUserId}-${u.company_id ?? 'no-company'}-${idx}`;

                return (
                  <tr key={rowKey} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
                    <td className="max-md:items-start max-md:gap-2 py-2 pr-4" data-label="User">
                      <div className="font-medium text-foreground">{name}</div>
                      <div className="text-[11px] text-muted-foreground break-all">
                        {email} · {clerkUserId}
                      </div>
                    </td>
                    <td className="max-md:items-start py-2 pr-4 text-xs" data-label="Company">
                      <div>{companyName}</div>
                      <div className="text-[11px] text-muted-foreground">{u.company_id ?? u.company?.company_id ?? ''}</div>
                    </td>
                    <td className="py-2 pr-4" data-label="Role">
                      <UserTypeBadge userType={u.user_type} />
                    </td>
                    <td className="py-2 pr-4 text-xs" data-label="Joined">
                      {createdAt}
                    </td>
                    <td className="max-md:justify-end py-2 text-right" data-label="Actions">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        disabled={isCurrentUser}
                        onClick={() => setDeleteModal({ open: true, user: u, confirmValue: '' })}
                        title={isCurrentUser ? 'Cannot delete your own account' : 'Delete user'}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete User confirmation modal */}
      <Dialog
        open={deleteModal.open}
        onOpenChange={(open) => !deleteMutation.isPending && setDeleteModal((p) => ({ ...p, open }))}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete User
            </DialogTitle>
            <DialogDescription>
              This action is permanent. App records will be removed. External auth (Clerk) account deletion is separate.
            </DialogDescription>
          </DialogHeader>
          {deleteModal.user && (
            <div className="space-y-4 py-2">
              <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-sm space-y-1">
                <div><span className="text-muted-foreground">Email:</span> {deleteModal.user.email ?? '—'}</div>
                <div><span className="text-muted-foreground">User ID:</span> <code className="text-xs">{(deleteModal.user as { user_id?: string; id?: string }).user_id ?? (deleteModal.user as { user_id?: string; id?: string }).id ?? '—'}</code></div>
                <div><span className="text-muted-foreground">Company:</span> {deleteModal.user.company_name ?? deleteModal.user.company?.company_name ?? '—'}</div>
              </div>
              {Boolean((deleteModal.user.email ?? '').trim()) ? (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Type the exact email to confirm: <span className="font-mono text-foreground">{deleteModal.user.email ?? ''}</span>
                  </label>
                  <input
                    type="text"
                    className="fv-input w-full"
                    value={deleteModal.confirmValue}
                    onChange={(e) => setDeleteModal((p) => ({ ...p, confirmValue: e.target.value }))}
                    placeholder="Enter email to confirm"
                    autoComplete="off"
                  />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  This user does not have an email on file and looks incomplete or test-only. You can delete them directly.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setDeleteModal({ open: false, user: null, confirmValue: '' })}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const user = deleteModal.user;
                const clerkUserId = user ? ((user as { user_id?: string; id?: string }).user_id ?? (user as { user_id?: string; id?: string }).id) : null;
                const expectedEmail = (user?.email ?? '').trim();
                const typed = deleteModal.confirmValue.trim();
                const requireConfirm = Boolean(expectedEmail);
                if (clerkUserId && (!requireConfirm || typed === expectedEmail)) {
                  deleteMutation.mutate(clerkUserId);
                }
              }}
              disabled={
                deleteMutation.isPending ||
                !deleteModal.user ||
                (((deleteModal.user?.email ?? '').trim().length ?? 0) > 0 &&
                  deleteModal.confirmValue.trim() !== (deleteModal.user?.email ?? '').trim())
              }
              className="gap-2"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DeveloperPageShell>
  );
}

