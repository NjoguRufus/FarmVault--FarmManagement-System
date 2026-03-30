/**
 * Single source of truth for season challenges per project.
 * Used by: Project Details, Plan Season, Season Challenges page.
 * All read/write goes through this service so challenges stay in sync.
 */
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import type { SeasonChallenge } from '@/types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Returns true if the value is a non-empty, valid UUID string. */
export function isValidUuid(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed === '') return false;
  return UUID_REGEX.test(trimmed);
}

/** Normalize a potential UUID: trim, lowercase, return null if empty/invalid. */
function normalizeUuidParam(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (trimmed === '') return null;
  return trimmed;
}

type DbRow = {
  id: string;
  company_id: string;
  project_id: string;
  crop_type: string;
  title: string;
  description: string;
  saved_as_reusable?: boolean | null;
  challenge_type: string | null;
  stage_index: number | null;
  stage_name: string | null;
  severity: string;
  status: string;
  date_identified: string;
  date_resolved: string | null;
  what_was_done: string | null;
  items_used: unknown;
  plan2_if_fails: string | null;
  source: string | null;
  source_plan_challenge_id: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
};

export type DeveloperSeasonChallengeRecord = {
  id: string;
  companyId: string;
  projectId: string;
  projectName: string | null;
  cropType: string;
  title: string;
  description: string;
  challengeType: string | null;
  severity: string;
  status: string;
  stageName: string | null;
  stageIndex: number | null;
  dateIdentified: string | null;
  createdAt: string | null;
  createdBy: string | null;
};

/** PostgREST may return jsonb as a parsed array or JSON string. */
function parseJsonbRpcArray(data: unknown): Record<string, unknown>[] {
  if (data == null) return [];
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (typeof data === 'string') {
    try {
      const p = JSON.parse(data) as unknown;
      return Array.isArray(p) ? (p as Record<string, unknown>[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function developerRpcRowToRecord(row: Record<string, unknown>): DeveloperSeasonChallengeRecord {
  const di = row.date_identified;
  const ca = row.created_at;
  const si = row.stage_index;
  return {
    id: String(row.id ?? ''),
    companyId: String(row.company_id ?? ''),
    projectId: String(row.project_id ?? ''),
    projectName: row.project_name == null || row.project_name === '' ? null : String(row.project_name),
    cropType: String(row.crop_type ?? ''),
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
    challengeType: row.challenge_type == null ? null : String(row.challenge_type),
    severity: String(row.severity ?? 'medium'),
    status: String(row.status ?? 'identified'),
    stageName: row.stage_name == null ? null : String(row.stage_name),
    stageIndex: si == null || si === '' ? null : Number(si),
    dateIdentified: di == null ? null : String(di).slice(0, 10),
    createdAt: ca == null ? null : String(ca),
    createdBy: row.created_by == null ? null : String(row.created_by),
  };
}

/** Parse rows returned by developer season-challenge RPCs (snake_case JSON array). */
export function seasonChallengesFromDeveloperRpcJson(data: unknown): SeasonChallenge[] {
  if (!Array.isArray(data)) return [];
  const out: SeasonChallenge[] = [];
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (r.id == null || String(r.id).trim() === '') continue;
    const stageRaw = r.stage_index;
    let stageIndex: number | null = null;
    if (stageRaw != null && stageRaw !== '') {
      const n = Number(stageRaw);
      if (Number.isFinite(n)) stageIndex = n;
    }
    try {
      out.push(
        toChallenge({
          id: String(r.id),
          company_id: String(r.company_id ?? ''),
          project_id: String(r.project_id ?? ''),
          crop_type: String(r.crop_type ?? ''),
          title: String(r.title ?? ''),
          description: String(r.description ?? ''),
          challenge_type: r.challenge_type == null ? null : String(r.challenge_type),
          stage_index: stageIndex,
          stage_name: r.stage_name == null ? null : String(r.stage_name),
          severity: String(r.severity ?? 'medium'),
          status: String(r.status ?? 'identified'),
          date_identified: String(r.date_identified ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10),
          date_resolved: r.date_resolved == null || r.date_resolved === '' ? null : String(r.date_resolved),
          what_was_done: r.what_was_done == null ? null : String(r.what_was_done),
          items_used: r.items_used,
          plan2_if_fails: r.plan2_if_fails == null ? null : String(r.plan2_if_fails),
          source: r.source == null ? null : String(r.source),
          source_plan_challenge_id:
            r.source_plan_challenge_id == null ? null : String(r.source_plan_challenge_id),
          created_by: r.created_by == null ? null : String(r.created_by),
          created_by_name: r.created_by_name == null ? null : String(r.created_by_name),
          created_at: String(r.created_at ?? new Date().toISOString()),
          updated_at: String(r.updated_at ?? new Date().toISOString()),
        }),
      );
    } catch {
      /* skip malformed row */
    }
  }
  return out;
}

/**
 * Developer Console: list all season challenges for a tenant company.
 *
 * Important: direct `supabase.from('season_challenges')` is subject to RLS
 * (`row_company_matches_user(company_id)`), so developers browsing another company often get 0 rows.
 * This uses SECURITY DEFINER RPCs (`admin.is_developer()` gate) — the supported cross-tenant read path.
 */
export async function fetchDeveloperCompanySeasonChallenges(companyId: string): Promise<DeveloperSeasonChallengeRecord[]> {
  const id = normalizeUuidParam(companyId);
  if (!id) {
    if (import.meta.env.DEV) {
      console.warn('[devSeasonChallenges] skipped: empty companyId');
    }
    return [];
  }

  // Try RPCs in order. PostgREST may still resolve older function names to a stale (uuid) overload
  // and throw 22P02 for "". The `fv_developer_company_season_challenges(text)` name is unique (see migrations).
  type RpcErr = { message?: string; code?: string } | null;
  const attempts: Array<{
    name: string;
    fn: () => ReturnType<typeof supabase.rpc>;
  }> = [
    {
      name: 'fv_developer_company_season_challenges',
      fn: () => supabase.rpc('fv_developer_company_season_challenges', { p_company_key: id }),
    },
    {
      name: 'developer_season_challenges_for_company_json',
      fn: () =>
        supabase.rpc('developer_season_challenges_for_company_json', {
          p_payload: { company_id: id },
        }),
    },
  ];

  let lastMsg = '';
  for (const { name, fn } of attempts) {
    const { data, error } = await fn();
    const err = error as RpcErr;
    if (!err) {
      const rows = parseJsonbRpcArray(data);
      if (import.meta.env.DEV) {
        console.log('[devSeasonChallenges] RPC ok', { rpc: name, selectedCompanyId: id, rawLen: rows.length });
      }
      return rows.map(developerRpcRowToRecord).filter((r) => r.id !== '');
    }
    const msg = String(err.message ?? '');
    const code = String((err as { code?: string }).code ?? '');
    lastMsg = msg;
    const missing =
      /not find|schema cache|does not exist|42883|PGRST202|Could not find the function/i.test(msg);
    const uuidBind =
      code === '22P02' || /invalid input syntax for type uuid/i.test(msg);
    if (import.meta.env.DEV) {
      console.warn('[devSeasonChallenges] RPC failed', { rpc: name, message: msg });
    }
    if (missing || uuidBind) {
      continue;
    }
    throw new Error(msg || 'Failed to load season challenges');
  }

  throw new Error(
    lastMsg ||
      'Failed to load season challenges. Ensure Supabase developer RPCs are applied (fv_developer_company_season_challenges and developer_season_challenges_for_company_json).',
  );
}

/**
 * Developer Console: fetch full raw rows (snake_case) for deep inspection drawers.
 * Uses the same hardened RPC fallback strategy as `fetchDeveloperCompanySeasonChallenges`.
 */
export async function fetchDeveloperCompanySeasonChallengesRaw(companyId: string): Promise<Record<string, unknown>[]> {
  const id = normalizeUuidParam(companyId);
  if (!id) {
    if (import.meta.env.DEV) {
      console.warn('[devSeasonChallengesRaw] skipped: empty companyId');
    }
    return [];
  }

  type RpcErr = { message?: string; code?: string } | null;
  const attempts: Array<{
    name: string;
    fn: () => ReturnType<typeof supabase.rpc>;
  }> = [
    {
      name: 'fv_developer_company_season_challenges',
      fn: () => supabase.rpc('fv_developer_company_season_challenges', { p_company_key: id }),
    },
    {
      name: 'developer_season_challenges_for_company_json',
      fn: () =>
        supabase.rpc('developer_season_challenges_for_company_json', {
          p_payload: { company_id: id },
        }),
    },
    {
      name: 'developer_get_season_challenges_for_company',
      fn: () => supabase.rpc('developer_get_season_challenges_for_company', { p_tenant_key: id }),
    },
    {
      name: 'developer_fetch_company_season_challenges',
      fn: () => supabase.rpc('developer_fetch_company_season_challenges', { p_tenant_key: id }),
    },
  ];

  let lastMsg = '';
  let sawMissing = false;
  for (const { name, fn } of attempts) {
    const { data, error } = await fn();
    const err = error as RpcErr;
    if (!err) {
      const rows = parseJsonbRpcArray(data);
      if (import.meta.env.DEV) {
        console.log('[devSeasonChallengesRaw] RPC ok', { rpc: name, selectedCompanyId: id, rawLen: rows.length });
      }
      return rows;
    }
    const msg = String(err.message ?? '');
    const code = String((err as { code?: string }).code ?? '');
    lastMsg = msg;
    const missing =
      /not find|schema cache|does not exist|42883|PGRST202|Could not find the function/i.test(msg);
    const uuidBind =
      code === '22P02' || /invalid input syntax for type uuid/i.test(msg);
    if (missing) sawMissing = true;
    if (import.meta.env.DEV) {
      console.warn('[devSeasonChallengesRaw] RPC failed', { rpc: name, message: msg });
    }
    if (missing || uuidBind) {
      continue;
    }
    throw new Error(msg || 'Failed to load season challenges');
  }

  if (sawMissing) {
    throw new Error(
      [
        'Developer Season Challenges RPCs are not available in this Supabase environment (PostgREST schema cache missing function).',
        'Apply the Developer Console RPC SQL and reload the schema.',
        'SQL: docs/migrations/apply_developer_console_rpcs.sql',
        lastMsg ? `Last error: ${lastMsg}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  throw new Error(
    lastMsg ||
      'Failed to load season challenges. Ensure Supabase developer RPCs are applied (fv_developer_company_season_challenges, developer_season_challenges_for_company_json).',
  );
}

function toChallenge(row: DbRow): SeasonChallenge {
  return {
    id: row.id,
    projectId: row.project_id,
    companyId: row.company_id,
    cropType: row.crop_type as SeasonChallenge['cropType'],
    title: row.title,
    description: row.description,
    isReusable: Boolean(row.saved_as_reusable),
    challengeType: (row.challenge_type as SeasonChallenge['challengeType']) ?? undefined,
    stageIndex: row.stage_index ?? undefined,
    stageName: row.stage_name ?? undefined,
    severity: (row.severity as SeasonChallenge['severity']) || 'medium',
    status: (row.status as SeasonChallenge['status']) || 'identified',
    dateIdentified: new Date(row.date_identified) as unknown as Date,
    dateResolved: row.date_resolved ? (new Date(row.date_resolved) as unknown as Date) : undefined,
    whatWasDone: row.what_was_done ?? undefined,
    itemsUsed: Array.isArray(row.items_used) ? (row.items_used as SeasonChallenge['itemsUsed']) : undefined,
    plan2IfFails: row.plan2_if_fails ?? undefined,
    source: row.source ?? undefined,
    sourcePlanChallengeId: row.source_plan_challenge_id ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdByName: row.created_by_name ?? undefined,
    createdAt: new Date(row.created_at) as unknown as Date,
    updatedAt: new Date(row.updated_at) as unknown as Date,
  };
}

const TABLE = 'season_challenges';

/**
 * `season_challenges.company_id` is TEXT; tenants may store UUID with/without dashes or mixed case.
 * Developer URLs use `core.companies.id`. Match all likely variants so lists and dev tools see the same rows.
 */
export function expandCompanyIdCandidates(raw: string): string[] {
  const s = String(raw ?? '').trim();
  if (!s) return [];
  const out = new Set<string>();
  out.add(s);
  out.add(s.toLowerCase());
  out.add(s.toUpperCase());
  const compact = s.replace(/-/g, '');
  if (/^[0-9a-fA-F]{32}$/.test(compact)) {
    const lc = compact.toLowerCase();
    out.add(lc);
    const dashed = `${lc.slice(0, 8)}-${lc.slice(8, 12)}-${lc.slice(12, 16)}-${lc.slice(16, 20)}-${lc.slice(20, 32)}`;
    out.add(dashed);
    out.add(dashed.toUpperCase());
  }
  return [...out];
}

/**
 * List season challenges for a company, optionally scoped to one project.
 * Project-specific: pass projectId so Project Details and Plan Season only see that project.
 * Company-wide: omit projectId so Season Challenges page can show all or filter client-side.
 */
export async function listSeasonChallenges(
  companyId: string,
  projectId?: string | null
): Promise<SeasonChallenge[]> {
  // Normalize companyId - never send empty string to DB
  const normalizedCompanyId = normalizeUuidParam(companyId);
  if (!normalizedCompanyId) {
    if (import.meta.env?.DEV) {
      console.warn('[seasonChallenges] listSeasonChallenges skipped: empty/invalid companyId');
    }
    return [];
  }

  // Normalize projectId - null if empty, skip filter if null
  const normalizedProjectId = normalizeUuidParam(projectId);

  if (import.meta.env?.DEV) {
    console.log('[seasonChallenges] listSeasonChallenges', {
      companyId: normalizedCompanyId,
      projectId: normalizedProjectId ?? 'all',
      schema: 'public',
      table: TABLE,
    });
  }
  try {
    let idCandidates = expandCompanyIdCandidates(normalizedCompanyId);
    if (idCandidates.length === 0) {
      return [];
    }

    // If the caller provided a real UUID, avoid sending non-UUID candidates (like 32-char compact)
    // because some deployments have season_challenges.company_id as UUID, and invalid UUID strings
    // inside an `.in(...)` filter will cause PostgREST to error (and this function would otherwise return []).
    if (isValidUuid(normalizedCompanyId)) {
      const uuidCandidates = idCandidates.filter((c) => isValidUuid(c));
      if (uuidCandidates.length > 0) {
        idCandidates = uuidCandidates;
      } else {
        idCandidates = [normalizedCompanyId];
      }
    }

    let query = supabase
      .from(TABLE)
      .select('*')
      .in('company_id', idCandidates)
      .order('created_at', { ascending: false });

    // Only add project filter if we have a valid non-empty project ID
    if (normalizedProjectId) {
      query = query.eq('project_id', normalizedProjectId);
    }

    const { data, error } = await query;

    if (import.meta.env?.DEV) {
      console.log('[seasonChallenges] listSeasonChallenges response', {
        table: TABLE,
        schema: 'public',
        error,
        rows: Array.isArray(data) ? data.length : null,
      });
    }

    if (error) {
      if (import.meta.env?.DEV) {
        console.warn('[seasonChallenges] listSeasonChallenges error', {
          companyId,
          projectId,
          error: error.message,
        });
      }
      return [];
    }

    const list = (data ?? []).map((row) => toChallenge(row as DbRow));
    if (import.meta.env?.DEV) {
      console.log('[seasonChallenges] listSeasonChallenges result', {
        companyId,
        projectId: projectId ?? 'all',
        count: list.length,
      });
    }
    return list;
  } catch (err) {
    if (import.meta.env?.DEV) {
      console.warn('[seasonChallenges] listSeasonChallenges exception', err);
    }
    return [];
  }
}

export interface CreateSeasonChallengeInput {
  companyId: string;
  projectId: string;
  cropType: string;
  title: string;
  description: string;
  challengeType?: string;
  severity?: 'low' | 'medium' | 'high';
  status?: 'identified' | 'mitigating' | 'resolved';
  stageIndex?: number;
  stageName?: string;
  source?: string;
  sourcePlanChallengeId?: string;
  createdBy?: string;
  createdByName?: string;
  savedAsReusable?: boolean;
}

export async function createSeasonChallenge(
  input: CreateSeasonChallengeInput
): Promise<SeasonChallenge | null> {
  if (import.meta.env?.DEV) {
    console.log('[seasonChallenges] createSeasonChallenge', {
      projectId: input.projectId,
      title: input.title,
      schema: 'public',
      table: TABLE,
    });
  }
  try {
    const dateIdentified = new Date().toISOString().slice(0, 10);

    // Harden drift: if project_id exists, derive company_id from the canonical project company.
    let resolvedCompanyId = input.companyId;
    try {
      const { data: projectRow, error: projectErr } = await db.projects()
        .from('projects')
        .select('company_id')
        .eq('id', input.projectId)
        .maybeSingle();
      if (!projectErr && projectRow?.company_id) {
        resolvedCompanyId = String(projectRow.company_id);
      }
    } catch {
      // Best-effort: fall back to input.companyId (DB trigger/constraints should prevent drift).
    }

    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        company_id: resolvedCompanyId,
        project_id: input.projectId,
        crop_type: input.cropType,
        title: input.title,
        description: input.description || '',
        saved_as_reusable: Boolean(input.savedAsReusable),
        challenge_type: input.challengeType ?? null,
        severity: input.severity ?? 'medium',
        status: input.status ?? 'identified',
        stage_index: input.stageIndex ?? null,
        stage_name: input.stageName ?? null,
        date_identified: dateIdentified,
        source: input.source ?? null,
        source_plan_challenge_id: input.sourcePlanChallengeId ?? null,
        created_by: input.createdBy ?? null,
        created_by_name: input.createdByName ?? null,
      })
      .select('*')
      .single();

    if (import.meta.env?.DEV) {
      console.log('[seasonChallenges] createSeasonChallenge response', {
        table: TABLE,
        schema: 'public',
        error,
        data,
      });
    }

    if (error) {
      if (import.meta.env?.DEV) {
        console.warn('[seasonChallenges] createSeasonChallenge error', error.message);
      }
      throw error;
    }
    if (import.meta.env?.DEV) {
      console.log('[seasonChallenges] createSeasonChallenge success', (data as DbRow)?.id);
    }
    return data ? toChallenge(data as DbRow) : null;
  } catch (err) {
    if (import.meta.env?.DEV) {
      console.warn('[seasonChallenges] createSeasonChallenge exception', err);
    }
    throw err;
  }
}

export async function updateSeasonChallenge(
  id: string,
  updates: Partial<{
    title: string;
    description: string;
    challengeType: string;
    severity: string;
    status: string;
    whatWasDone: string;
    plan2IfFails: string;
    itemsUsed: unknown;
    dateResolved: string | null;
    isReusable: boolean;
  }>
): Promise<void> {
  if (import.meta.env?.DEV) {
    console.log('[seasonChallenges] updateSeasonChallenge', { id });
  }
  const row: Record<string, unknown> = {};
  if (updates.title != null) row.title = updates.title;
  if (updates.description != null) row.description = updates.description;
  if (updates.challengeType != null) row.challenge_type = updates.challengeType;
  if (updates.severity != null) row.severity = updates.severity;
  if (updates.status != null) row.status = updates.status;
  if (updates.whatWasDone != null) row.what_was_done = updates.whatWasDone;
  if (updates.plan2IfFails != null) row.plan2_if_fails = updates.plan2IfFails;
  if (updates.itemsUsed != null) row.items_used = updates.itemsUsed;
  if (updates.dateResolved !== undefined) row.date_resolved = updates.dateResolved;
  if (updates.isReusable !== undefined) row.saved_as_reusable = updates.isReusable;

  if (Object.keys(row).length === 0) return;
  const { data, error } = await supabase.from(TABLE).update(row).eq('id', id).select('*');
  if (import.meta.env?.DEV) {
    console.log('[seasonChallenges] updateSeasonChallenge response', {
      table: TABLE,
      schema: 'public',
      error,
      data,
    });
  }
  if (error) {
    if (import.meta.env?.DEV) {
      console.warn('[seasonChallenges] updateSeasonChallenge error', error.message);
    }
    throw error;
  }
  if (import.meta.env?.DEV) {
    console.log('[seasonChallenges] updateSeasonChallenge success');
  }
}

export async function deleteSeasonChallenge(id: string): Promise<void> {
  if (import.meta.env?.DEV) {
    console.log('[seasonChallenges] deleteSeasonChallenge', { id });
  }
  const { data, error } = await supabase.from(TABLE).delete().eq('id', id).select('*');
  if (import.meta.env?.DEV) {
    console.log('[seasonChallenges] deleteSeasonChallenge response', {
      table: TABLE,
      schema: 'public',
      error,
      data,
    });
  }
  if (error) {
    if (import.meta.env?.DEV) {
      console.warn('[seasonChallenges] deleteSeasonChallenge error', error.message);
    }
    throw error;
  }
  if (import.meta.env?.DEV) {
    console.log('[seasonChallenges] deleteSeasonChallenge success');
  }
}
