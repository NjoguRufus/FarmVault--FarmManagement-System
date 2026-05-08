import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  Bell,
  CheckCircle2,
  Clock,
  FlaskConical,
  Loader2,
  Moon,
  Radio,
  RefreshCw,
  Search,
  Send,
  Sun,
  Users,
  Zap,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { useUser } from '@clerk/react';
import { DeveloperPageShell } from '@/components/developer/DeveloperPageShell';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { invokeSendFarmVaultEmail } from '@/lib/email';
import { supabase } from '@/lib/supabase';
import { fetchCompanyWorkspaceNotifyPayload, listCompanies } from '@/services/developerAdminService';
import { renderBannerVariant, type BannerVariantKey } from '@/components/companion/banners/BannerVariants';
import '@/components/companion/banners/banner-tokens.css';
import {
  buildCompanionMorningEmail,
  buildCompanionEveningEmail,
  buildCompanionInactivityEmail,
  buildCompanionWeeklySummaryEmail,
  paragraphsToHtml,
} from '@/emails/companion/buildCompanionEmail';

// ─── Types ────────────────────────────────────────────────────────────────────

type NotificationType = 'morning' | 'evening' | 'inactivity' | 'weekly';
type InactivityTier = '2d' | '5d' | '7d' | '14d';
type SendStatus = 'pending' | 'sent' | 'failed';

interface TestLogRow {
  id: string;
  notification_type: NotificationType;
  inactivity_tier: InactivityTier | null;
  recipient_email: string;
  company_name: string | null;
  email_subject: string | null;
  send_status: SendStatus;
  error_message: string | null;
  sent_by: string;
  created_at: string;
}

type BroadcastMode = 'all' | 'selected';
type BroadcastDeliveryStatus = 'pending' | 'sending' | 'completed' | 'failed';

interface BroadcastLogRow {
  id: string;
  mode: BroadcastMode;
  notification_type: NotificationType;
  inactivity_tier: InactivityTier | null;
  recipient_count: number;
  success_count: number;
  failed_count: number;
  recipient_ids: string[] | null;
  email_subject: string | null;
  triggered_by: string;
  delivery_status: BroadcastDeliveryStatus;
  created_at: string;
}

interface BroadcastProgress {
  sent: number;
  failed: number;
  skipped: number;
  total: number;
}

interface DetectedContext {
  type: NotificationType;
  tier: InactivityTier | null;
  reason: string;
  timeLabel: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const NOTIFICATION_TYPES: { value: NotificationType; label: string; icon: React.ReactNode; accent: string; description: string }[] = [
  {
    value: 'morning',
    label: 'Morning',
    icon: <Sun className="h-4 w-4" />,
    accent: 'border-amber-500/40 bg-amber-500/[0.06] text-amber-900 dark:text-amber-200 data-[active=true]:bg-amber-500/15 data-[active=true]:border-amber-500/60',
    description: 'Daily check-in sent at 6:30 AM EAT',
  },
  {
    value: 'evening',
    label: 'Evening',
    icon: <Moon className="h-4 w-4" />,
    accent: 'border-violet-500/40 bg-violet-500/[0.06] text-violet-900 dark:text-violet-200 data-[active=true]:bg-violet-500/15 data-[active=true]:border-violet-500/60',
    description: 'Reflection sent Mon–Sat at 7 PM EAT',
  },
  {
    value: 'inactivity',
    label: 'Inactivity',
    icon: <Zap className="h-4 w-4" />,
    accent: 'border-orange-500/40 bg-orange-500/[0.06] text-orange-900 dark:text-orange-200 data-[active=true]:bg-orange-500/15 data-[active=true]:border-orange-500/60',
    description: 'Nudge sent when a user is inactive 2–14 days',
  },
  {
    value: 'weekly',
    label: 'Weekly Summary',
    icon: <BarChart3 className="h-4 w-4" />,
    accent: 'border-emerald-500/40 bg-emerald-500/[0.06] text-emerald-900 dark:text-emerald-200 data-[active=true]:bg-emerald-500/15 data-[active=true]:border-emerald-500/60',
    description: 'Sent every Sunday evening with farm stats',
  },
];

const INACTIVITY_TIERS: { value: InactivityTier; label: string; description: string }[] = [
  { value: '2d', label: '2-day nudge', description: 'Gentle — you just missed us' },
  { value: '5d', label: '5-day nudge', description: 'Warmer — hope all is well on the farm' },
  { value: '7d', label: '7-day nudge', description: 'Heartfelt — a week without farming feels long' },
  { value: '14d', label: '14-day nudge', description: 'Deeply personal — we genuinely miss you' },
];

// Sample messages for the live preview
const SAMPLE_MESSAGES: Record<NotificationType, Record<string, { subject: string; greeting: string; body: string; cta: string }[]>> = {
  morning: {
    default: [
      {
        subject: '☀️ Good morning, {name}! Your farm is waiting for you',
        greeting: 'Good morning, {name}! ☀️',
        body: 'A new farming day begins. Check in on your crops, review any pending operations, and log today\'s progress in FarmVault. Small steps every day lead to a great harvest.',
        cta: 'Open my farm dashboard',
      },
      {
        subject: '☀️ Good morning, {name} — start your farming day with intention',
        greeting: 'Rise and shine, {name}!',
        body: 'Your farm doesn\'t wait — and neither should you. Take a moment this morning to review your project stages, check inventory levels, and plan today\'s operations. You\'ve got this.',
        cta: 'View today\'s tasks',
      },
    ],
  },
  evening: {
    default: [
      {
        subject: '🌙 Good evening, {name} — how did the farm do today?',
        greeting: 'Good evening, {name}.',
        body: 'Another day on the farm done. Take a moment to log any work completed, update your harvest records, or note what needs attention tomorrow. Consistent tracking is what separates good farms from great ones.',
        cta: 'Log today\'s progress',
      },
      {
        subject: '🌙 Well done today, {name} — your farm records are waiting',
        greeting: 'Evening, {name}.',
        body: 'The sun is setting on another farming day. Whether today was productive or challenging, logging your progress in FarmVault helps you see the bigger picture across seasons.',
        cta: 'Update my records',
      },
    ],
  },
  inactivity: {
    '2d': [
      {
        subject: '🌿 {name}, we noticed you\'ve been away — your farm misses you',
        greeting: 'Hey {name},',
        body: 'It\'s been a couple of days since you last checked in on FarmVault. Your crops, expenses, and operations are waiting. Even a quick 5-minute log-in helps you stay on top of your farm.',
        cta: 'Check in on my farm',
      },
    ],
    '5d': [
      {
        subject: '🌿 {name}, five days away — everything is still here for you',
        greeting: 'Hello {name},',
        body: 'We\'ve missed you this week. Farming is busy, and we understand — but FarmVault is here to make it easier, not harder. Come back and see what\'s changed on your farm.',
        cta: 'Return to FarmVault',
      },
    ],
    '7d': [
      {
        subject: '🌿 {name}, a week has passed — your farm is waiting',
        greeting: 'Dear {name},',
        body: 'A whole week without FarmVault. We haven\'t forgotten about you, and your farm data is safe and waiting. Whenever you\'re ready, we\'re here to help you track every harvest, expense, and milestone.',
        cta: 'Come back to my farm',
      },
    ],
    '14d': [
      {
        subject: '🌿 {name}, two weeks — we genuinely miss you on FarmVault',
        greeting: 'Dear {name},',
        body: 'Two weeks is a long time away. We\'ve been thinking about you and your farm. Life gets busy, seasons change, and challenges come — but FarmVault is here through all of it. Come back at your own pace.',
        cta: 'I\'m ready to return',
      },
    ],
  },
  weekly: {
    default: [
      {
        subject: '📊 {name}, your weekly farm summary is ready',
        greeting: 'Hello {name},',
        body: 'Here\'s what happened on your farm this week:\n\n• Operations logged: —\n• Harvest records: —\n• Expenses tracked: —\n• Inventory updates: —\n\nKeep up the great work. Every record you log makes next season\'s planning easier.',
        cta: 'View my full summary',
      },
    ],
  },
};

function getSampleMessage(type: NotificationType, tier: InactivityTier | null, seed: number) {
  const pool =
    type === 'inactivity' && tier
      ? (SAMPLE_MESSAGES.inactivity[tier] ?? SAMPLE_MESSAGES.inactivity['2d'])
      : (SAMPLE_MESSAGES[type]?.default ?? SAMPLE_MESSAGES.morning.default);
  return pool[seed % pool.length];
}

function buildEmailSubject(type: NotificationType, tier: InactivityTier | null, farmName: string, recipientName: string) {
  const sample = getSampleMessage(type, tier, 0);
  return sample.subject.replace(/\{name\}/g, recipientName || farmName || 'Farmer');
}

// Per-type hero gradient and accent colour for the email body fragment.
const TYPE_HERO_STYLE: Record<NotificationType, { gradient: string; fallback: string; cardBg: string; cardBorder: string }> = {
  morning:    { gradient: 'linear-gradient(135deg,#f59e0b 0%,#d97706 42%,#1f6f43 100%)', fallback: '#d97706', cardBg: '#fffdf0', cardBorder: '#f59e0b' },
  evening:    { gradient: 'linear-gradient(135deg,#1a2e3d 0%,#2e3f72 52%,#4a2d6e 100%)', fallback: '#2e3f72', cardBg: '#f0f1fa', cardBorder: '#6366f1' },
  inactivity: { gradient: 'linear-gradient(135deg,#1f6f43 0%,#2d8a57 55%,#0e7490 100%)', fallback: '#1f6f43', cardBg: '#f0f9f4', cardBorder: '#1f6f43' },
  weekly:     { gradient: 'linear-gradient(135deg,#14532d 0%,#1f6f43 55%,#2d8a57 100%)', fallback: '#1f6f43', cardBg: '#f0f7f2', cardBorder: '#c8a24d' },
};

// Inactivity tier overrides the hero gradient.
const TIER_HERO: Record<InactivityTier, { gradient: string; fallback: string; cardBg: string; cardBorder: string }> = {
  '2d':  { gradient: 'linear-gradient(135deg,#1f6f43 0%,#2d8a57 55%,#0e7490 100%)', fallback: '#1f6f43', cardBg: '#f0f9f4', cardBorder: '#1f6f43' },
  '5d':  { gradient: 'linear-gradient(135deg,#0369a1 0%,#0891b2 55%,#1f6f43 100%)', fallback: '#0369a1', cardBg: '#f0f9ff', cardBorder: '#0891b2' },
  '7d':  { gradient: 'linear-gradient(135deg,#4338ca 0%,#6366f1 55%,#0891b2 100%)', fallback: '#4338ca', cardBg: '#f0f1fa', cardBorder: '#6366f1' },
  '14d': { gradient: 'linear-gradient(135deg,#5b21b6 0%,#7c3aed 55%,#4338ca 100%)', fallback: '#5b21b6', cardBg: '#f5f3ff', cardBorder: '#7c3aed' },
};

const TYPE_FOOTER_TAGLINE: Record<NotificationType, string> = {
  morning:    'Every farming day brings new growth.',
  evening:    'Rest well. Your farm story continues tomorrow.',
  inactivity: "We're still here with you, always.",
  weekly:     'Your farm story, written week by week.',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function statusBadgeClass(status: SendStatus): string {
  if (status === 'sent') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300';
  if (status === 'failed') return 'border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-300';
  return 'border-amber-500/40 bg-amber-500/12 text-amber-900 dark:text-amber-200';
}

const tierLabel: Record<InactivityTier, string> = {
  '2d': '2-day',
  '5d': '5-day',
  '7d': '7-day',
  '14d': '14-day',
};

// ─── Service ─────────────────────────────────────────────────────────────────

async function fetchTestLogs(sentBy: string): Promise<TestLogRow[]> {
  const { data, error } = await supabase
    .from('notification_test_logs')
    .select('*')
    .eq('sent_by', sentBy)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as TestLogRow[];
}

async function insertTestLog(row: Omit<TestLogRow, 'id' | 'created_at'>): Promise<void> {
  const { error } = await supabase
    .from('notification_test_logs')
    .insert(row);
  if (error) throw new Error(error.message);
}

// ─── Auto context detection ───────────────────────────────────────────────────

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function detectCurrentContext(): DetectedContext {
  const now = new Date();
  const hourEAT = (now.getUTCHours() + 3) % 24;
  const minuteEAT = now.getUTCMinutes();
  const dayOfWeek = now.getUTCDay();
  const ampm = hourEAT < 12 ? 'AM' : 'PM';
  const h12 = hourEAT % 12 || 12;
  const timeLabel = `${h12}:${String(minuteEAT).padStart(2, '0')} ${ampm} EAT — ${DAY_NAMES[dayOfWeek]}`;

  if (dayOfWeek === 0 && hourEAT >= 18 && hourEAT < 22) {
    return { type: 'weekly', tier: null, reason: 'Sunday evening — weekly summary window', timeLabel };
  }
  if (hourEAT >= 6 && hourEAT < 11) {
    return { type: 'morning', tier: null, reason: 'Morning window (6–11 AM EAT)', timeLabel };
  }
  if (hourEAT >= 18 && hourEAT < 21 && dayOfWeek !== 0) {
    return { type: 'evening', tier: null, reason: 'Evening window (6–9 PM EAT, Mon–Sat)', timeLabel };
  }
  return { type: 'morning', tier: null, reason: `Outside scheduled windows — defaulting to Morning`, timeLabel };
}

// ─── Broadcast service ────────────────────────────────────────────────────────

async function insertBroadcastLog(row: Omit<BroadcastLogRow, 'id' | 'created_at'>): Promise<void> {
  const { error } = await supabase
    .from('notification_broadcast_logs')
    .insert({ ...row, recipient_ids: row.recipient_ids ? JSON.stringify(row.recipient_ids) : null });
  if (error) throw new Error(error.message);
}

async function fetchBroadcastLogs(triggeredBy: string): Promise<BroadcastLogRow[]> {
  const { data, error } = await supabase
    .from('notification_broadcast_logs')
    .select('*')
    .eq('triggered_by', triggeredBy)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  return (data ?? []) as BroadcastLogRow[];
}

// ─── Banner preview helpers ───────────────────────────────────────────────────

function notifTypeToBannerKey(type: NotificationType, tier: InactivityTier | null): BannerVariantKey {
  if (type === 'weekly') return 'weekly';
  if (type === 'inactivity') return tier === '14d' ? 'missyou' : 'inactive';
  if (type === 'evening') return 'evening';
  return 'morning'; // morning type always shows morning banner in the test preview
}

function ScaledBannerPreview({ variantKey, name, farmName, messageText }: {
  variantKey: BannerVariantKey;
  name: string;
  farmName: string;
  messageText: string;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const update = (w: number) => setScale(w / 1600);
    update(el.getBoundingClientRect().width);
    const obs = new ResizeObserver(([entry]) => update(entry.contentRect.width));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const outerHeight = scale !== null ? Math.round(500 * scale) : 0;

  return (
    <div
      ref={outerRef}
      className="fv-banner-root"
      style={{
        width: '100%',
        height: outerHeight,
        overflow: 'hidden',
        position: 'relative',
        borderRadius: 12,
        visibility: scale !== null ? 'visible' : 'hidden',
      }}
    >
      {scale !== null && (
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: 1600, height: 500 }}>
          {renderBannerVariant(variantKey, { name, farmName, messageText: messageText || undefined })}
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DeveloperNotificationTestingPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user: clerkUser } = useUser();

  const clerkUserId = clerkUser?.id ?? '';

  const [tab, setTab] = useState<'send' | 'logs' | 'broadcast'>('send');
  const [notifType, setNotifType] = useState<NotificationType>('morning');
  const [inactivityTier, setInactivityTier] = useState<InactivityTier>('2d');
  // Context company (for preview)
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('__none__');
  // Recipient company (for send — resolves owner email)
  const [recipientCompanyId, setRecipientCompanyId] = useState<string>('__none__');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [previewSeed, setPreviewSeed] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<'email' | 'banner'>('banner');

  // ── Broadcast state ─────────────────────────────────────────────────────────
  const detectedContext = useMemo(() => detectCurrentContext(), []);
  const [broadcastMode, setBroadcastMode] = useState<BroadcastMode>('all');
  const [broadcastTypeOverride, setBroadcastTypeOverride] = useState(false);
  const [broadcastType, setBroadcastType] = useState<NotificationType>(detectedContext.type);
  const [broadcastTier, setBroadcastTier] = useState<InactivityTier>('2d');
  const [broadcastPreviewSeed, setBroadcastPreviewSeed] = useState(0);
  const [companySearch, setCompanySearch] = useState('');
  const [selectedBroadcastIds, setSelectedBroadcastIds] = useState<Set<string>>(new Set());
  const [broadcastConfirmOpen, setBroadcastConfirmOpen] = useState(false);
  const [broadcastProgress, setBroadcastProgress] = useState<BroadcastProgress | null>(null);
  const broadcastProgressRef = useRef<BroadcastProgress | null>(null);

  const effectiveTier = notifType === 'inactivity' ? inactivityTier : null;

  // Load companies
  const { data: companiesData, isLoading: companiesLoading } = useQuery({
    queryKey: ['developer', 'companies-for-testing'],
    queryFn: () => listCompanies({ limit: 200 }),
  });

  const companies = companiesData?.items ?? [];

  const selectedCompany = useMemo(
    () =>
      selectedCompanyId === '__none__'
        ? undefined
        : companies.find((c) => (c.company_id ?? c.id) === selectedCompanyId),
    [companies, selectedCompanyId],
  );

  const resolvedFarmName = selectedCompany?.company_name || selectedCompany?.name || '';

  // Resolve recipient company owner email
  const { data: resolvedRecipient, isFetching: recipientResolving } = useQuery({
    queryKey: ['developer', 'recipient-email-resolve', recipientCompanyId],
    queryFn: () => fetchCompanyWorkspaceNotifyPayload(recipientCompanyId),
    enabled: recipientCompanyId !== '__none__',
    staleTime: 5 * 60 * 1000,
  });

  // Auto-fill email + name when recipient company resolves
  useEffect(() => {
    if (recipientCompanyId === '__none__') {
      setRecipientEmail('');
      setRecipientName('');
      return;
    }
    if (resolvedRecipient?.ok && resolvedRecipient.to) {
      setRecipientEmail(resolvedRecipient.to);
    } else if (resolvedRecipient && !resolvedRecipient.ok) {
      setRecipientEmail('');
    }
    const co = companies.find((c) => (c.company_id ?? c.id) === recipientCompanyId);
    setRecipientName(co?.company_name ?? co?.name ?? '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipientCompanyId, resolvedRecipient]);

  // Preview message
  const preview = useMemo(
    () => getSampleMessage(notifType, effectiveTier, previewSeed),
    [notifType, effectiveTier, previewSeed],
  );

  // Compile the actual email HTML via React Email render() — async.
  // This is the same HTML that gets sent, so preview === sent email.
  const [emailHtml, setEmailHtml] = useState<string>('');
  useEffect(() => {
    let cancelled = false;
    const displayName = recipientName.trim() || resolvedFarmName || 'Farmer';
    const farmName    = resolvedFarmName || '';
    const messageText = preview.body;

    const promise =
      notifType === 'evening'    ? buildCompanionEveningEmail({ displayName, farmName, messageText }) :
      notifType === 'inactivity' ? buildCompanionInactivityEmail({ displayName, farmName, tier: effectiveTier ?? '2d', messageText }) :
      notifType === 'weekly'     ? buildCompanionWeeklySummaryEmail({ displayName, farmName, messageText }) :
                                   buildCompanionMorningEmail({ displayName, farmName, messageText });

    promise.then(({ html }) => { if (!cancelled) setEmailHtml(html); }).catch(console.error);
    return () => { cancelled = true; };
  }, [notifType, effectiveTier, recipientName, resolvedFarmName, preview.body]);

  // Preview HTML — same as email HTML but mascot loaded from local public folder
  // so we can see it while developing without needing the frontend deployed.
  const previewEmailHtml = useMemo(() =>
    emailHtml.replace(
      'https://app.farmvault.africa/mascot/mascot%201.png',
      '/mascot/mascot%201.png',
    ),
  [emailHtml]);
  // Test logs
  const {
    data: logs,
    isLoading: logsLoading,
    isFetching: logsFetching,
    refetch: refetchLogs,
  } = useQuery({
    queryKey: ['developer', 'notification-test-logs', clerkUserId],
    queryFn: () => fetchTestLogs(clerkUserId),
    enabled: !!clerkUserId,
  });

  // ── Broadcast derived values ─────────────────────────────────────────────────
  const effectiveBroadcastTier = broadcastType === 'inactivity' ? broadcastTier : null;

  const filteredCompanies = useMemo(() => {
    const q = companySearch.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => {
      const name = (c.company_name ?? c.name ?? '').toLowerCase();
      return name.includes(q);
    });
  }, [companies, companySearch]);

  const broadcastTargets = useMemo(() => {
    if (broadcastMode === 'all') return companies;
    return companies.filter((c) => selectedBroadcastIds.has(c.company_id ?? c.id ?? ''));
  }, [broadcastMode, companies, selectedBroadcastIds]);

  const broadcastPreview = useMemo(
    () => getSampleMessage(broadcastType, effectiveBroadcastTier, broadcastPreviewSeed),
    [broadcastType, effectiveBroadcastTier, broadcastPreviewSeed],
  );

  // Sync auto-detected type unless user overrode
  useEffect(() => {
    if (!broadcastTypeOverride) {
      setBroadcastType(detectedContext.type);
    }
  }, [broadcastTypeOverride, detectedContext.type]);

  // Broadcast logs query
  const {
    data: broadcastLogs,
    isLoading: broadcastLogsLoading,
    refetch: refetchBroadcastLogs,
  } = useQuery({
    queryKey: ['developer', 'broadcast-logs', clerkUserId],
    queryFn: () => fetchBroadcastLogs(clerkUserId),
    enabled: !!clerkUserId,
  });

  // Broadcast mutation
  const broadcastMutation = useMutation({
    mutationFn: async () => {
      if (!clerkUserId) throw new Error('Not signed in.');
      const targets = broadcastTargets;
      if (targets.length === 0) throw new Error('No recipients selected.');

      const progress: BroadcastProgress = { sent: 0, failed: 0, skipped: 0, total: targets.length };
      broadcastProgressRef.current = progress;
      setBroadcastProgress({ ...progress });

      const recipientIds: string[] = [];

      for (const company of targets) {
        const companyId = company.company_id ?? company.id ?? '';
        const companyName = company.company_name ?? company.name ?? '';

        try {
          const resolved = await fetchCompanyWorkspaceNotifyPayload(companyId);
          if (!resolved.ok || !resolved.to) {
            progress.skipped++;
            broadcastProgressRef.current = { ...progress };
            setBroadcastProgress({ ...progress });
            continue;
          }

          const bSample = getSampleMessage(broadcastType, effectiveBroadcastTier, broadcastPreviewSeed);
          const subject = buildEmailSubject(broadcastType, effectiveBroadcastTier, companyName, companyName);
          const messageText = bSample.body;
          const messageHtml = paragraphsToHtml(messageText);

          const result = await invokeSendFarmVaultEmail({
            emailType: 'custom_manual',
            to: resolved.to,
            subject,
            data: { subject, body: messageText, showQrCode: false, category: 'companion_broadcast' },
            metadata: {
              companionType: broadcastType,
              ...(effectiveBroadcastTier ? { companionTier: effectiveBroadcastTier } : {}),
              displayName: companyName,
              farmName: companyName,
              messageText,
              messageHtml,
              messageSubject: subject,
            },
            companyName,
            triggeredBy: 'developer_broadcast',
          });

          if (result.ok) {
            progress.sent++;
            recipientIds.push(companyId);
          } else {
            progress.failed++;
          }
        } catch {
          progress.failed++;
        }

        broadcastProgressRef.current = { ...progress };
        setBroadcastProgress({ ...progress });
      }

      const subject = buildEmailSubject(broadcastType, effectiveBroadcastTier, 'Farmers', 'Farmers');
      await insertBroadcastLog({
        mode: broadcastMode,
        notification_type: broadcastType,
        inactivity_tier: effectiveBroadcastTier,
        recipient_count: targets.length,
        success_count: progress.sent,
        failed_count: progress.failed,
        recipient_ids: recipientIds,
        email_subject: subject,
        triggered_by: clerkUserId,
        delivery_status: progress.sent === 0 ? 'failed' : 'completed',
      });

      return progress;
    },
    onSuccess: (progress) => {
      void queryClient.invalidateQueries({ queryKey: ['developer', 'broadcast-logs'] });
      setBroadcastConfirmOpen(false);
      toast({
        title: 'Broadcast complete',
        description: `Sent to ${progress.sent} companies. ${progress.failed > 0 ? `${progress.failed} failed.` : ''} ${progress.skipped > 0 ? `${progress.skipped} skipped (no email).` : ''}`.trim(),
      });
    },
    onError: (err: unknown) => {
      setBroadcastConfirmOpen(false);
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: 'Broadcast failed', description: message, variant: 'destructive' });
    },
  });

  // Send mutation
  const sendMutation = useMutation({
    mutationFn: async () => {
      const email = recipientEmail.trim();
      if (!email) throw new Error('Recipient email is required.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid email address.');
      if (!clerkUserId) throw new Error('Not signed in.');

      const sample = getSampleMessage(notifType, effectiveTier, previewSeed);
      const displayName = recipientName.trim() || resolvedFarmName || 'Farmer';
      const subject = buildEmailSubject(notifType, effectiveTier, resolvedFarmName, displayName);
      const messageText = sample.body;
      const messageHtml = paragraphsToHtml(messageText);

      const result = await invokeSendFarmVaultEmail({
        emailType: 'custom_manual',
        to: email,
        subject,
        data: { subject, body: messageText, showQrCode: false, category: 'companion_test' },
        metadata: {
          companionType: notifType,
          ...(effectiveTier ? { companionTier: effectiveTier } : {}),
          displayName,
          farmName: resolvedFarmName || '',
          messageText,
          messageHtml,
          messageSubject: subject,
        },
        ...(resolvedFarmName ? { companyName: resolvedFarmName } : {}),
        triggeredBy: 'developer_notification_test',
      });

      await insertTestLog({
        notification_type: notifType,
        inactivity_tier: effectiveTier,
        recipient_email: email,
        company_id: recipientCompanyId === '__none__' ? null : recipientCompanyId || null,
        company_name: recipientName || resolvedFarmName || null,
        email_subject: `[TEST] ${subject}`,
        send_status: result.ok ? 'sent' : 'failed',
        error_message: result.ok ? null : (result.error ?? result.detail ?? 'Unknown error'),
        sent_by: clerkUserId,
      });

      if (!result.ok) {
        throw new Error(result.error ?? result.detail ?? 'Send failed.');
      }

      return result;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['developer', 'notification-test-logs'] });
      toast({
        title: 'Test sent',
        description: `A ${notifType} notification test was delivered to ${recipientEmail.trim()}.`,
      });
      setConfirmOpen(false);
    },
    onError: (err: unknown) => {
      void queryClient.invalidateQueries({ queryKey: ['developer', 'notification-test-logs'] });
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: 'Send failed', description: message, variant: 'destructive' });
      setConfirmOpen(false);
    },
  });

  const canSend =
    recipientCompanyId !== '__none__' &&
    !recipientResolving &&
    recipientEmail.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim());

  const typeConfig = NOTIFICATION_TYPES.find((t) => t.value === notifType)!;
  const previewAccentColor =
    notifType === 'morning'
      ? 'bg-amber-500'
      : notifType === 'evening'
        ? 'bg-violet-500'
        : notifType === 'inactivity'
          ? 'bg-orange-500'
          : 'bg-emerald-500';

  return (
    <DeveloperPageShell
      title="Notification Testing"
      description="Safely test FarmVault Smart Companion Notifications without affecting live users. All test sends go to the address you specify — never to production users."
      isLoading={tab === 'logs' ? logsLoading : false}
      isRefetching={tab === 'logs' ? logsFetching : false}
      onRefresh={tab === 'logs' ? () => void refetchLogs() : undefined}
    >
      {/* Safety banner */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="text-sm text-amber-900 dark:text-amber-200 leading-relaxed">
          <span className="font-semibold">Test mode is isolated.</span> Emails go only to the address you specify below.
          The production companion cron runs separately on its own schedule and is not affected by tests here.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'send' | 'logs' | 'broadcast')} className="space-y-6">
        <TabsList className="grid h-11 w-full max-w-xl grid-cols-3 p-1 rounded-xl bg-muted/70 ring-1 ring-border/60">
          <TabsTrigger value="send" className="gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <FlaskConical className="h-3.5 w-3.5" />
            Send test
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Bell className="h-3.5 w-3.5" />
            Test logs
          </TabsTrigger>
          <TabsTrigger value="broadcast" className="gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Radio className="h-3.5 w-3.5" />
            Broadcast
          </TabsTrigger>
        </TabsList>

        {/* ── SEND TAB ─────────────────────────────────────────────────── */}
        <TabsContent value="send" className="mt-0 space-y-5 outline-none">

          {/* 1. Notification type */}
          <div className="fv-card space-y-4">
            <div className="space-y-1">
              <h2 className="text-base font-semibold tracking-tight text-foreground">Notification type</h2>
              <p className="text-sm text-muted-foreground">Choose which companion notification to preview and send.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {NOTIFICATION_TYPES.map((nt) => (
                <button
                  key={nt.value}
                  type="button"
                  data-active={notifType === nt.value}
                  onClick={() => setNotifType(nt.value)}
                  className={`flex flex-col items-start gap-1.5 rounded-xl border px-3 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${nt.accent}`}
                >
                  <span className="flex items-center gap-1.5 font-medium text-sm">
                    {nt.icon}
                    {nt.label}
                  </span>
                  <span className="text-[11px] leading-snug opacity-70">{nt.description}</span>
                </button>
              ))}
            </div>

            {notifType === 'inactivity' && (
              <div className="space-y-2 pt-1">
                <Label className="text-sm font-medium text-foreground">Inactivity tier</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {INACTIVITY_TIERS.map((tier) => (
                    <button
                      key={tier.value}
                      type="button"
                      onClick={() => setInactivityTier(tier.value)}
                      className={`rounded-lg border px-3 py-2.5 text-left text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        inactivityTier === tier.value
                          ? 'border-orange-500/60 bg-orange-500/15 text-orange-900 dark:text-orange-200 font-medium'
                          : 'border-border/60 bg-background text-muted-foreground hover:border-border'
                      }`}
                    >
                      <p className="font-medium">{tier.label}</p>
                      <p className="text-[11px] mt-0.5 opacity-70">{tier.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 2. Company context */}
          <div className="fv-card space-y-4">
            <div className="space-y-1">
              <h2 className="text-base font-semibold tracking-tight text-foreground">Preview context</h2>
              <p className="text-sm text-muted-foreground">Select a company to use as context for the live preview below.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="nt-company">Company</Label>
              <Select
                value={selectedCompanyId}
                onValueChange={setSelectedCompanyId}
                disabled={companiesLoading}
              >
                <SelectTrigger id="nt-company" className="h-10">
                  <SelectValue placeholder={companiesLoading ? 'Loading…' : 'Select a company (optional)'} />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="__none__">No company</SelectItem>
                  {companies.map((c) => {
                    const id = c.company_id ?? c.id ?? '';
                    const name = c.company_name ?? c.name ?? id;
                    return (
                      <SelectItem key={id} value={id}>
                        {name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 3. Preview panel */}
          <div className="fv-card space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-base font-semibold tracking-tight text-foreground">Live preview</h2>
                <p className="text-sm text-muted-foreground">
                  {previewMode === 'banner' ? 'In-app banner — exactly what users see on the dashboard.' : 'Approximation of what the companion email will look like.'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex rounded-lg border border-border/60 overflow-hidden text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setPreviewMode('banner')}
                    className={`px-3 py-1.5 transition-colors ${previewMode === 'banner' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted/50'}`}
                  >
                    Banner
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode('email')}
                    className={`px-3 py-1.5 border-l border-border/60 transition-colors ${previewMode === 'email' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted/50'}`}
                  >
                    Email
                  </button>
                </div>
                {previewMode === 'email' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5"
                    onClick={() => setPreviewSeed((s) => s + 1)}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Regenerate
                  </Button>
                )}
              </div>
            </div>

            {/* In-app banner preview */}
            {previewMode === 'banner' && (
              <ScaledBannerPreview
                variantKey={notifTypeToBannerKey(notifType, effectiveTier)}
                name={recipientName.trim() || resolvedFarmName || 'Farmer'}
                farmName={resolvedFarmName || recipientName.trim() || ''}
                messageText={preview.body}
              />
            )}

            {/* Email preview — React Email compiled HTML in a sandboxed iframe */}
            {previewMode === 'email' && (
              <div style={{ maxWidth: 640, margin: '0 auto' }}>
                {previewEmailHtml ? (
                  <iframe
                    srcDoc={previewEmailHtml}
                    title="Email preview"
                    sandbox="allow-same-origin allow-scripts"
                    style={{ width: '100%', height: 720, border: 'none', borderRadius: 12, display: 'block' }}
                  />
                ) : (
                  <div className="flex items-center justify-center rounded-xl bg-muted/30" style={{ height: 720 }}>
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 4. Send settings */}
          <div className="fv-card space-y-4">
            <div className="space-y-1">
              <h2 className="text-base font-semibold tracking-tight text-foreground">Send settings</h2>
              <p className="text-sm text-muted-foreground">The test email will go to this address only. It will NOT affect live users.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Recipient company — auto-resolves owner email */}
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="nt-recipient-company">Send to company</Label>
                <Select
                  value={recipientCompanyId}
                  onValueChange={setRecipientCompanyId}
                  disabled={companiesLoading}
                >
                  <SelectTrigger id="nt-recipient-company" className="h-10">
                    <SelectValue placeholder={companiesLoading ? 'Loading…' : 'Select recipient company'} />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value="__none__">Select a company…</SelectItem>
                    {companies.map((c) => {
                      const id = c.company_id ?? c.id ?? '';
                      const name = c.company_name ?? c.name ?? id;
                      return (
                        <SelectItem key={id} value={id}>
                          {name}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {/* Resolution status */}
                {recipientCompanyId !== '__none__' && !recipientResolving && resolvedRecipient && !resolvedRecipient.ok && (
                  <p className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    No owner email found for this company — enter one manually below.
                  </p>
                )}
              </div>

              {/* Resolved email */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="nt-recipient-email">Owner email</Label>
                  {recipientResolving && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  )}
                  {!recipientResolving && resolvedRecipient?.ok && recipientEmail && (
                    <Badge variant="outline" className="gap-1 border-emerald-400/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 text-[10px]">
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      resolved
                    </Badge>
                  )}
                </div>
                <Input
                  id="nt-recipient-email"
                  type="email"
                  placeholder={
                    recipientCompanyId === '__none__'
                      ? 'Select a company above'
                      : recipientResolving
                        ? 'Resolving…'
                        : 'No email found — enter manually'
                  }
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  disabled={recipientResolving}
                  className="h-10"
                />
              </div>

              {/* Recipient name (auto-filled) */}
              <div className="space-y-2">
                <Label htmlFor="nt-recipient-name">Recipient name</Label>
                <Input
                  id="nt-recipient-name"
                  placeholder="Auto-filled from company name"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="h-10"
                />
              </div>
            </div>

            <Separator className="bg-border/70" />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                disabled={!canSend || sendMutation.isPending}
                onClick={() => setConfirmOpen(true)}
                className="gap-2 min-w-[160px]"
              >
                {sendMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send test notification
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground max-w-sm sm:text-right">
                Uses the same Resend pipeline as production. Logged in Test Logs tab.
                Developer role required on the server.
              </p>
            </div>
          </div>
        </TabsContent>

        {/* ── LOGS TAB ─────────────────────────────────────────────────── */}
        <TabsContent value="logs" className="mt-0 space-y-5 outline-none">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-foreground">Test send history</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Your last 50 notification test sends, newest first.</p>
          </div>

          {logsLoading && (
            <div className="fv-card space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/30" />
              ))}
            </div>
          )}

          {!logsLoading && (logs ?? []).length === 0 && (
            <div className="fv-card flex flex-col items-center justify-center py-16 px-6 text-center border-dashed border-2 border-border/60 bg-muted/5">
              <div className="rounded-full bg-primary/10 p-4 mb-4">
                <Bell className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-base font-semibold text-foreground">No test sends yet</h3>
              <p className="mt-2 text-sm text-muted-foreground max-w-sm">
                Send a test notification from the Send test tab — every attempt is recorded here.
              </p>
            </div>
          )}

          {!logsLoading && (logs ?? []).length > 0 && (
            <div className="fv-card overflow-x-visible p-0 md:overflow-x-auto">
              <table className="fv-table-mobile w-full min-w-0 text-sm md:min-w-[640px]">
                <thead className="border-b border-border/60 bg-muted/20 text-xs text-muted-foreground">
                  <tr>
                    <th className="py-3 pl-4 pr-2 text-left font-medium">When</th>
                    <th className="py-3 px-2 text-left font-medium">Type</th>
                    <th className="py-3 px-2 text-left font-medium">Company</th>
                    <th className="py-3 px-2 text-left font-medium">Recipient</th>
                    <th className="py-3 px-2 text-left font-medium">Subject</th>
                    <th className="py-3 pr-4 pl-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(logs ?? []).map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="max-md:items-start py-2.5 pl-4 pr-2 text-xs text-muted-foreground md:whitespace-nowrap" data-label="When">
                        {formatWhen(row.created_at)}
                      </td>
                      <td className="py-2.5 px-2" data-label="Type">
                        <span className="text-xs font-medium capitalize">
                          {row.notification_type}
                          {row.inactivity_tier ? ` (${tierLabel[row.inactivity_tier]})` : ''}
                        </span>
                      </td>
                      <td className="max-md:items-start py-2.5 px-2 text-xs text-muted-foreground" data-label="Company">
                        {row.company_name ?? '—'}
                      </td>
                      <td
                        className="max-md:items-start py-2.5 px-2 text-xs font-medium text-foreground md:max-w-[200px] md:truncate"
                        data-label="Recipient"
                      >
                        <span className="break-all md:truncate">{row.recipient_email}</span>
                      </td>
                      <td
                        className="max-md:items-start py-2.5 px-2 text-xs text-muted-foreground md:max-w-[220px] md:truncate"
                        data-label="Subject"
                        title={row.email_subject ?? undefined}
                      >
                        {row.email_subject ?? '—'}
                      </td>
                      <td className="py-2.5 pr-4 pl-2" data-label="Status">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className={statusBadgeClass(row.send_status)}>
                            {row.send_status}
                          </Badge>
                          {row.send_status === 'sent' && (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          )}
                          {row.send_status === 'failed' && (
                            <AlertCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400 shrink-0" title={row.error_message ?? undefined} />
                          )}
                        </div>
                        {row.send_status === 'failed' && row.error_message ? (
                          <p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5 max-w-[200px] truncate" title={row.error_message}>
                            {row.error_message}
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-muted-foreground px-4 py-2 border-t border-border/50">
                Showing your {(logs ?? []).length} most recent test sends. Test logs do not affect production analytics.
              </p>
            </div>
          )}
        </TabsContent>

        {/* ── BROADCAST TAB ────────────────────────────────────────────── */}
        <TabsContent value="broadcast" className="mt-0 space-y-5 outline-none">

          {/* Safety banner */}
          <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/[0.05] px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            <p className="text-sm text-red-900 dark:text-red-200 leading-relaxed">
              <span className="font-semibold">Real emails to real users.</span> Broadcast sends a companion notification
              to every selected company's owner via Resend — the same pipeline as production. Confirm carefully.
            </p>
          </div>

          {/* 1. Broadcast mode */}
          <div className="fv-card space-y-4">
            <div className="space-y-1">
              <h2 className="text-base font-semibold tracking-tight text-foreground">Broadcast mode</h2>
              <p className="text-sm text-muted-foreground">Choose who receives this notification.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setBroadcastMode('all')}
                className={`flex flex-col items-start gap-1 rounded-xl border px-4 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  broadcastMode === 'all'
                    ? 'border-primary/60 bg-primary/[0.07] text-foreground'
                    : 'border-border/60 bg-background text-muted-foreground hover:border-border'
                }`}
              >
                <span className="flex items-center gap-2 font-semibold text-sm">
                  <Users className="h-4 w-4" />
                  All companies
                </span>
                <span className="text-[11px] leading-snug opacity-70">
                  {companiesLoading ? 'Loading…' : `${companies.length} companies in FarmVault`}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setBroadcastMode('selected')}
                className={`flex flex-col items-start gap-1 rounded-xl border px-4 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  broadcastMode === 'selected'
                    ? 'border-primary/60 bg-primary/[0.07] text-foreground'
                    : 'border-border/60 bg-background text-muted-foreground hover:border-border'
                }`}
              >
                <span className="flex items-center gap-2 font-semibold text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  Selected companies
                </span>
                <span className="text-[11px] leading-snug opacity-70">
                  {selectedBroadcastIds.size > 0 ? `${selectedBroadcastIds.size} selected` : 'Choose below'}
                </span>
              </button>
            </div>
          </div>

          {/* 2. Auto context detection */}
          <div className="fv-card space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-base font-semibold tracking-tight text-foreground">Auto context</h2>
                <p className="text-sm text-muted-foreground">
                  Notification type auto-detected from current time. Override if needed.
                </p>
              </div>
              <Button
                type="button"
                variant={broadcastTypeOverride ? 'default' : 'outline'}
                size="sm"
                className="h-9 shrink-0"
                onClick={() => setBroadcastTypeOverride((v) => !v)}
              >
                {broadcastTypeOverride ? 'Using override' : 'Override type'}
              </Button>
            </div>

            {/* Detected context display */}
            <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">{detectedContext.timeLabel}</p>
                <p className="text-xs text-muted-foreground">{detectedContext.reason}</p>
                {!broadcastTypeOverride && (
                  <p className="text-xs font-semibold text-primary mt-1">
                    Auto-selected: {NOTIFICATION_TYPES.find((t) => t.value === broadcastType)?.label} notification
                  </p>
                )}
              </div>
            </div>

            {/* Manual override */}
            {broadcastTypeOverride && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {NOTIFICATION_TYPES.map((nt) => (
                    <button
                      key={nt.value}
                      type="button"
                      data-active={broadcastType === nt.value}
                      onClick={() => setBroadcastType(nt.value)}
                      className={`flex flex-col items-start gap-1.5 rounded-xl border px-3 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${nt.accent}`}
                    >
                      <span className="flex items-center gap-1.5 font-medium text-sm">{nt.icon}{nt.label}</span>
                      <span className="text-[11px] leading-snug opacity-70">{nt.description}</span>
                    </button>
                  ))}
                </div>
                {broadcastType === 'inactivity' && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {INACTIVITY_TIERS.map((tier) => (
                      <button
                        key={tier.value}
                        type="button"
                        onClick={() => setBroadcastTier(tier.value)}
                        className={`rounded-lg border px-3 py-2 text-left text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          broadcastTier === tier.value
                            ? 'border-orange-500/60 bg-orange-500/15 text-orange-900 dark:text-orange-200 font-medium'
                            : 'border-border/60 bg-background text-muted-foreground hover:border-border'
                        }`}
                      >
                        <p className="font-medium text-xs">{tier.label}</p>
                        <p className="text-[10px] mt-0.5 opacity-70">{tier.description}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3. Recipient selection (only for 'selected' mode) */}
          {broadcastMode === 'selected' && (
            <div className="fv-card space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <h2 className="text-base font-semibold tracking-tight text-foreground">Select recipients</h2>
                  <p className="text-sm text-muted-foreground">
                    {selectedBroadcastIds.size === 0
                      ? 'No companies selected yet.'
                      : `${selectedBroadcastIds.size} of ${companies.length} companies selected.`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setSelectedBroadcastIds(new Set(companies.map((c) => c.company_id ?? c.id ?? '')))}
                  >
                    Select all
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setSelectedBroadcastIds(new Set())}
                  >
                    Clear
                  </Button>
                </div>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search companies…"
                  value={companySearch}
                  onChange={(e) => setCompanySearch(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Checklist */}
              <div className="max-h-64 overflow-y-auto rounded-xl border border-border/60 divide-y divide-border/40">
                {filteredCompanies.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">No companies match your search.</p>
                )}
                {filteredCompanies.map((c) => {
                  const id = c.company_id ?? c.id ?? '';
                  const name = c.company_name ?? c.name ?? id;
                  const checked = selectedBroadcastIds.has(id);
                  return (
                    <label
                      key={id}
                      className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) =>
                          setSelectedBroadcastIds((prev) => {
                            const next = new Set(prev);
                            if (v) next.add(id); else next.delete(id);
                            return next;
                          })
                        }
                      />
                      <span className="min-w-0 flex-1 text-sm font-medium text-foreground truncate">{name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. Preview */}
          <div className="fv-card space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-base font-semibold tracking-tight text-foreground">Message preview</h2>
                <p className="text-sm text-muted-foreground">
                  Sample of what recipients will receive. Each company gets a personalized version.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 shrink-0"
                onClick={() => setBroadcastPreviewSeed((s) => s + 1)}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Regenerate
              </Button>
            </div>

            <div className="rounded-xl border border-border/60 bg-white dark:bg-zinc-950 overflow-hidden shadow-sm">
              {/* Subject bar */}
              <div className="border-b border-border/40 px-5 py-3 bg-muted/30">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">Subject line</p>
                <p className="text-sm font-medium text-foreground">
                  {broadcastPreview.subject.replace(/\{name\}/g, '[Company Name]')}
                </p>
              </div>
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border/30 px-5 py-3 bg-white dark:bg-zinc-950">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-base" aria-label="FarmVault mascot">
                    🌱
                  </div>
                  <span className="text-[11px] text-muted-foreground font-medium">FarmVault Companion</span>
                </div>
                <img src="/Logo/fv.png" alt="FarmVault" className="h-6 w-auto object-contain opacity-90" />
              </div>
              {/* Hero gradient */}
              <div
                style={{
                  background: broadcastType === 'inactivity' && effectiveBroadcastTier
                    ? TIER_HERO[effectiveBroadcastTier].gradient
                    : TYPE_HERO_STYLE[broadcastType].gradient,
                }}
                className="px-6 py-6 text-center"
              >
                <p className="text-lg font-bold text-white leading-snug mb-1">
                  {broadcastType === 'morning' ? '☀️' : broadcastType === 'evening' ? '🌙' : broadcastType === 'weekly' ? '🏆' : '🌿'}{' '}
                  {broadcastPreview.greeting.replace(/\{name\}/g, '[Company Name]')}
                </p>
                <p className="text-[13px] text-white/85 leading-relaxed">
                  {broadcastType === 'morning'
                    ? 'A new farming day begins — your farm is ready for you.'
                    : broadcastType === 'evening'
                      ? 'Another farming day complete. Your farm, you showed up.'
                      : broadcastType === 'weekly'
                        ? 'Here is what your farm accomplished this week.'
                        : "Your farm is still here. We're still here with you."}
                </p>
              </div>
              {/* Body */}
              <div className="p-5 sm:p-6 space-y-4 bg-white dark:bg-zinc-950">
                <div
                  style={{
                    backgroundColor: broadcastType === 'inactivity' && effectiveBroadcastTier
                      ? TIER_HERO[effectiveBroadcastTier].cardBg
                      : TYPE_HERO_STYLE[broadcastType].cardBg,
                    borderLeftColor: broadcastType === 'inactivity' && effectiveBroadcastTier
                      ? TIER_HERO[effectiveBroadcastTier].cardBorder
                      : TYPE_HERO_STYLE[broadcastType].cardBorder,
                  }}
                  className="border-l-4 rounded-r-xl px-4 py-3.5"
                >
                  <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300 whitespace-pre-line">{broadcastPreview.body}</p>
                </div>
                <div>
                  <span style={{ backgroundColor: '#1f6f43' }} className="inline-block rounded-xl px-5 py-2.5 text-sm font-semibold text-white">
                    {broadcastPreview.cta}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground italic">{TYPE_FOOTER_TAGLINE[broadcastType]}</p>
                <Separator className="bg-border/40" />
                <p className="text-[11px] text-muted-foreground">
                  <strong>Broadcast</strong> — sent to all selected companies via the FarmVault Companion pipeline.
                  Each company receives a personalized version of this message.
                </p>
              </div>
            </div>
          </div>

          {/* 5. Send action */}
          <div className="fv-card space-y-4">
            <div className="space-y-1">
              <h2 className="text-base font-semibold tracking-tight text-foreground">Send broadcast</h2>
              <p className="text-sm text-muted-foreground">
                {broadcastMode === 'all'
                  ? `This will notify all ${companies.length} companies.`
                  : selectedBroadcastIds.size === 0
                    ? 'Select at least one company above.'
                    : `This will notify ${selectedBroadcastIds.size} selected ${selectedBroadcastIds.size === 1 ? 'company' : 'companies'}.`}
              </p>
            </div>

            {/* Progress bar (visible while sending) */}
            {broadcastMutation.isPending && broadcastProgress && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Sending… {broadcastProgress.sent + broadcastProgress.failed + broadcastProgress.skipped} / {broadcastProgress.total}</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">{broadcastProgress.sent} sent</span>
                </div>
                <Progress
                  value={Math.round(((broadcastProgress.sent + broadcastProgress.failed + broadcastProgress.skipped) / broadcastProgress.total) * 100)}
                  className="h-2"
                />
                {broadcastProgress.failed > 0 && (
                  <p className="text-xs text-red-600 dark:text-red-400">{broadcastProgress.failed} failed</p>
                )}
              </div>
            )}

            <Separator className="bg-border/70" />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                disabled={
                  broadcastMutation.isPending ||
                  companiesLoading ||
                  (broadcastMode === 'selected' && selectedBroadcastIds.size === 0)
                }
                onClick={() => setBroadcastConfirmOpen(true)}
                className="gap-2 min-w-[180px] bg-primary hover:bg-primary/90"
              >
                {broadcastMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Broadcasting…
                  </>
                ) : (
                  <>
                    <Radio className="h-4 w-4" />
                    Send broadcast now
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground max-w-sm sm:text-right">
                Emails are sent sequentially via Resend. Each company gets a personalized message. All sends are logged below.
              </p>
            </div>
          </div>

          {/* 6. Broadcast logs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold tracking-tight text-foreground">Broadcast history</h2>
              <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => void refetchBroadcastLogs()}>
                <RefreshCw className="h-3 w-3" />
                Refresh
              </Button>
            </div>

            {broadcastLogsLoading && (
              <div className="fv-card space-y-2">
                {[1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/30" />)}
              </div>
            )}

            {!broadcastLogsLoading && (broadcastLogs ?? []).length === 0 && (
              <div className="fv-card flex flex-col items-center justify-center py-10 text-center border-dashed border-2 border-border/60 bg-muted/5">
                <Radio className="h-7 w-7 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-foreground">No broadcasts yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Your broadcast history will appear here.</p>
              </div>
            )}

            {!broadcastLogsLoading && (broadcastLogs ?? []).length > 0 && (
              <div className="fv-card overflow-x-visible p-0 md:overflow-x-auto">
                <table className="fv-table-mobile w-full min-w-0 text-sm md:min-w-[600px]">
                  <thead className="border-b border-border/60 bg-muted/20 text-xs text-muted-foreground">
                    <tr>
                      <th className="py-3 pl-4 pr-2 text-left font-medium">When</th>
                      <th className="py-3 px-2 text-left font-medium">Type</th>
                      <th className="py-3 px-2 text-left font-medium">Mode</th>
                      <th className="py-3 px-2 text-left font-medium">Recipients</th>
                      <th className="py-3 px-2 text-left font-medium">Sent</th>
                      <th className="py-3 pr-4 pl-2 text-left font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(broadcastLogs ?? []).map((row) => (
                      <tr key={row.id} className="border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 pl-4 pr-2 text-xs text-muted-foreground md:whitespace-nowrap" data-label="When">
                          {formatWhen(row.created_at)}
                        </td>
                        <td className="py-2.5 px-2 text-xs font-medium capitalize" data-label="Type">
                          {row.notification_type}{row.inactivity_tier ? ` (${row.inactivity_tier})` : ''}
                        </td>
                        <td className="py-2.5 px-2 text-xs capitalize text-muted-foreground" data-label="Mode">
                          {row.mode}
                        </td>
                        <td className="py-2.5 px-2 text-xs tabular-nums" data-label="Recipients">
                          {row.recipient_count}
                        </td>
                        <td className="py-2.5 px-2" data-label="Sent">
                          <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">{row.success_count}</span>
                          {row.failed_count > 0 && (
                            <span className="text-xs text-red-600 dark:text-red-400 ml-1">/ {row.failed_count} failed</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 pl-2" data-label="Status">
                          <Badge
                            variant="outline"
                            className={statusBadgeClass(row.delivery_status === 'completed' ? 'sent' : row.delivery_status === 'failed' ? 'failed' : 'pending')}
                          >
                            {row.delivery_status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Broadcast confirmation dialog */}
      <AlertDialog open={broadcastConfirmOpen} onOpenChange={setBroadcastConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send broadcast notification?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  This will send a real <strong className="text-foreground">{NOTIFICATION_TYPES.find((t) => t.value === broadcastType)?.label}</strong> companion
                  notification to the companies listed below via Resend. This affects real users.
                </p>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-1.5 text-foreground">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Type</span>
                    <span className="font-medium capitalize">
                      {broadcastType}{effectiveBroadcastTier ? ` (${effectiveBroadcastTier})` : ''}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Mode</span>
                    <span className="font-medium capitalize">{broadcastMode}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Recipients</span>
                    <span className="font-semibold text-primary">
                      {broadcastMode === 'all' ? companies.length : selectedBroadcastIds.size} {broadcastMode === 'all' ? 'companies' : `selected ${selectedBroadcastIds.size === 1 ? 'company' : 'companies'}`}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                  This action cannot be undone. Companies with no owner email on file will be skipped automatically.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={broadcastMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={broadcastMutation.isPending}
              onClick={() => broadcastMutation.mutate()}
              className="bg-primary hover:bg-primary/90"
            >
              {broadcastMutation.isPending ? 'Sending…' : `Send to ${broadcastMode === 'all' ? companies.length : selectedBroadcastIds.size} companies`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Test send confirmation dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send test notification?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>A real email will be delivered via Resend to the address below. This is isolated from the production companion cron and will not affect any live users.</p>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-1.5 text-foreground">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Type</span>
                    <span className="font-medium capitalize">
                      {notifType}{effectiveTier ? ` (${effectiveTier})` : ''}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">To</span>
                    <span className="font-medium break-all">{recipientEmail.trim()}</span>
                  </div>
                  {recipientName && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Name</span>
                      <span className="font-medium">{recipientName}</span>
                    </div>
                  )}
                  {(recipientName || resolvedFarmName) && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Company</span>
                      <span className="font-medium">{recipientName || resolvedFarmName}</span>
                    </div>
                  )}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sendMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={sendMutation.isPending}
              onClick={() => sendMutation.mutate()}
            >
              {sendMutation.isPending ? 'Sending…' : 'Send test'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DeveloperPageShell>
  );
}
