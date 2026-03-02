import React, { useState } from 'react';
import { MessageSquare, Filter, Star, Loader2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, orderBy, query, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format } from 'date-fns';
import { useCollection } from '@/hooks/useCollection';
import { Company } from '@/types';
import { useAuth } from '@/contexts/AuthContext';

const FEEDBACK_TYPES = [
  { value: 'all', label: 'All' },
  { value: 'general', label: 'General' },
  { value: 'bug', label: 'Bug Report' },
  { value: 'feature', label: 'Feature Request' },
  { value: 'improvement', label: 'Improvement' },
];

interface FeedbackDoc {
  id: string;
  type?: string;
  message?: string;
  rating?: number;
  companyId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  userRoleLabel?: string | null;
  userRole?: string | null;
  createdAt?: { toDate?: () => Date; seconds?: number } | null;
  replyText?: string | null;
  replyByName?: string | null;
  replyByRole?: string | null;
  replyAt?: { toDate?: () => Date; seconds?: number } | null;
}

export default function AdminFeedbackPage() {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: companies = [] } = useCollection<Company>('admin-feedback-companies', 'companies', {
    companyScoped: false,
    isDeveloper: true,
  });
  const getCompanyName = (companyId: string | null | undefined) =>
    companyId ? (companies.find((c) => c.id === companyId)?.name ?? companyId) : '—';

  const { data: feedbackList = [], isLoading } = useQuery({
    queryKey: ['admin-feedback'],
    queryFn: async () => {
      const q = query(
        collection(db, 'feedback'),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as FeedbackDoc[];
    },
  });

  const filtered = typeFilter === 'all'
    ? feedbackList
    : feedbackList.filter((f) => f.type === typeFilter);

  const formatDate = (d: FeedbackDoc['createdAt']) => {
    if (!d) return '—';
    const t = d as { toDate?: () => Date; seconds?: number };
    if (typeof t.toDate === 'function') return format(t.toDate(), 'PPp');
    if (typeof t.seconds === 'number') return format(new Date(t.seconds * 1000), 'PPp');
    return '—';
  };

  const handleSendReply = async (feedbackId: string) => {
    const text = (replyDrafts[feedbackId] ?? '').trim();
    if (!text) return;
    setSendingId(feedbackId);
    setError(null);
    try {
      const ref = doc(db, 'feedback', feedbackId);
      await updateDoc(ref, {
        replyText: text,
        replyByUserId: user?.id ?? null,
        replyByName: user?.name ?? null,
        replyByRole: user?.role ?? null,
        replyAt: serverTimestamp(),
      });
      setReplyDrafts((prev) => ({ ...prev, [feedbackId]: '' }));
      queryClient.invalidateQueries({ queryKey: ['admin-feedback'] });
    } catch (e: any) {
      setError(e?.message || 'Failed to send reply');
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in w-full min-w-0 px-2 sm:px-0">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground flex flex-wrap items-center gap-2">
          <MessageSquare className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
          Feedback inbox
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          All feedback from companies. Filter by type or browse all.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
        {FEEDBACK_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTypeFilter(t.value)}
            className={`fv-btn text-sm ${typeFilter === t.value ? 'fv-btn--primary' : 'fv-btn--ghost'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="fv-card py-12 text-center text-muted-foreground">
          <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No feedback{typeFilter !== 'all' ? ` for ${FEEDBACK_TYPES.find((t) => t.value === typeFilter)?.label}` : ''} yet.</p>
        </div>
      ) : (
        <div className="space-y-3 overflow-x-hidden">
          {filtered.map((f) => (
            <div key={f.id} className="fv-card p-3 sm:p-4 min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <span className="fv-badge capitalize shrink-0">{f.type ?? 'general'}</span>
                  {f.userRoleLabel && (
                    <span className="fv-badge fv-badge--secondary text-xs shrink-0">
                      {f.userRoleLabel}
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{formatDate(f.createdAt)}</span>
              </div>
              {f.rating != null && f.rating > 0 && (
                <div className="flex items-center gap-1 mb-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`h-4 w-4 ${star <= (f.rating ?? 0) ? 'text-fv-gold fill-fv-gold' : 'text-muted'}`}
                    />
                  ))}
                </div>
              )}
              <p className="text-sm text-foreground whitespace-pre-wrap break-words">{f.message ?? '—'}</p>
              <p className="text-xs text-muted-foreground mt-2 flex flex-wrap gap-x-2 gap-y-1">
                <span>{f.userName ?? f.userEmail ?? 'Anonymous'}</span>
                <span>·</span>
                <span>Company: {getCompanyName(f.companyId)}</span>
              </p>
              <div className="mt-3 border-t pt-3 space-y-2">
                {f.replyText && (
                  <div className="rounded-md bg-muted/60 px-3 py-2 text-sm">
                    <p className="font-medium text-foreground mb-1">Reply</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap break-words">
                      {f.replyText}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {f.replyByName ?? 'Developer'}
                      {f.replyAt ? ` · ${formatDate(f.replyAt)}` : null}
                    </p>
                  </div>
                )}
                <div className="flex flex-col sm:flex-row gap-2">
                  <textarea
                    className="fv-input text-sm flex-1 min-h-[60px]"
                    placeholder={f.replyText ? 'Update reply…' : 'Write a reply to this feedback…'}
                    value={replyDrafts[f.id] ?? ''}
                    onChange={(e) =>
                      setReplyDrafts((prev) => ({ ...prev, [f.id]: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    className="fv-btn fv-btn--primary sm:self-end"
                    disabled={sendingId === f.id || !(replyDrafts[f.id]?.trim())}
                    onClick={() => handleSendReply(f.id)}
                  >
                    {sendingId === f.id ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="ml-1">Sending…</span>
                      </>
                    ) : (
                      'Send reply'
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
