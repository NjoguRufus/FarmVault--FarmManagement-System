import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCompanyRecordCrops,
  createCompanyRecordCrop,
  getCropRecords,
  getCropRecordDetail,
  createCompanyCropRecord,
  updateCropRecord,
  addCropRecordAttachment,
  getDeveloperCropRecords,
  sendDeveloperCropRecordToCompany,
  sendDeveloperCropRecordToCompanyWithAttachments,
  createDeveloperCropRecordTemplate,
  getCropIntelligence,
  getCropRecordInsights,
  resolveRecordCrop,
  type ResolvedRecordCrop,
  upsertCropKnowledgeProfile,
  addCropKnowledgeChallenge,
  addCropKnowledgePractice,
  addCropKnowledgeChemical,
  addCropKnowledgeTimingWindow,
  listRecentCompanyNotebookRecords,
  type DeveloperRecordsFilter,
  type CropIntelligenceResponse,
  type CropRecordInsightsResponse,
  type CropKnowledgeProfileForm,
  type CropKnowledgeChallengeForm,
  type CropKnowledgePracticeForm,
  type CropKnowledgeChemicalForm,
  type CropKnowledgeTimingWindowForm,
} from '@/services/recordsService';
import {
  listFarmNotebookAdminNotes,
  sendFarmNotebookAdminNote,
  type NotebookNoteTargetType,
} from '@/services/notebookAdminNotesService';
import { supabase } from '@/lib/supabase';
import { useCompanyScope, NO_COMPANY } from '@/hooks/useCompanyScope';
import { useAuth } from '@/contexts/AuthContext';

export function useCompanyRecordCrops() {
  const scope = useCompanyScope();
  const { user } = useAuth();
  const { companyId, error: scopeError } = scope;

  const trimmedCompanyId = (companyId ?? '').trim();
  const userReady = Boolean(user?.id && String(user.id).trim() !== '');
  const companyReady =
    trimmedCompanyId.length > 0 && scopeError == null && userReady;

  const query = useQuery({
    queryKey: ['records', 'company-crops', trimmedCompanyId || 'pending', user?.id ?? 'anon'],
    queryFn: () => getCompanyRecordCrops(trimmedCompanyId),
    enabled: companyReady,
    retry: (failureCount, err) => {
      const msg = err instanceof Error ? err.message.toLowerCase() : '';
      if (msg.includes('not authorized') || msg.includes('permission denied')) return false;
      return failureCount < 2;
    },
  });

  return {
    ...query,
    scopeError,
    needsCompany: scopeError === NO_COMPANY,
    companyReady,
  };
}

export function useRecentCompanyNotebookRecords(limit = 50) {
  const { companyId, error } = useCompanyScope();
  const { user } = useAuth();
  const trimmedCompanyId = (companyId ?? '').trim();
  const userReady = Boolean(user?.id && String(user.id).trim() !== '');

  return useQuery({
    queryKey: ['records', 'recent-notes', trimmedCompanyId || 'pending', user?.id ?? 'anon', limit],
    queryFn: () => listRecentCompanyNotebookRecords(trimmedCompanyId, limit),
    enabled: trimmedCompanyId.length > 0 && !error && userReady,
  });
}

export function useFarmNotebookAdminNotes() {
  const queryClient = useQueryClient();
  const { companyId, error } = useCompanyScope();
  const { user } = useAuth();
  const trimmedCompanyId = (companyId ?? '').trim();
  const userReady = Boolean(user?.id && String(user.id).trim() !== '');

  const query = useQuery({
    queryKey: ['records', 'farm-notebook-admin-notes', trimmedCompanyId || 'pending', user?.id ?? 'anon'],
    queryFn: () => listFarmNotebookAdminNotes(trimmedCompanyId),
    enabled: trimmedCompanyId.length > 0 && !error && userReady,
  });

  useEffect(() => {
    if (!trimmedCompanyId || error || !userReady) return undefined;

    const channel = supabase
      .channel(`farm-notebook-admin-notes:${trimmedCompanyId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'farm_notebook_admin_notes' },
        () => {
          void queryClient.invalidateQueries({
            queryKey: ['records', 'farm-notebook-admin-notes', trimmedCompanyId],
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [trimmedCompanyId, error, userReady, queryClient]);

  return query;
}

export function useSendFarmNotebookAdminNote() {
  const queryClient = useQueryClient();
  const { companyId } = useCompanyScope();
  const trimmedCompanyId = (companyId ?? '').trim();

  return useMutation({
    mutationFn: (input: {
      targetType: NotebookNoteTargetType;
      title: string;
      content: string;
      companyId?: string | null;
      cropId?: string | null;
      targetUserId?: string | null;
    }) => sendFarmNotebookAdminNote(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['records', 'farm-notebook-admin-notes'] });
    },
  });
}

export function useResolveCompanyRecordCrop(cropIdOrName: string | undefined) {
  const { companyId, error } = useCompanyScope();
  const { user } = useAuth();
  const raw = (cropIdOrName ?? '').trim();
  const likelySlug = raw !== '' && raw === raw.toLowerCase() && !/\s/.test(raw);

  const trimmedCompanyId = (companyId ?? '').trim();
  const userReady = Boolean(user?.id && String(user.id).trim() !== '');

  return useQuery<ResolvedRecordCrop | null>({
    queryKey: ['records', 'resolve-crop', trimmedCompanyId || 'pending', user?.id ?? 'anon', raw],
    queryFn: () => resolveRecordCrop(trimmedCompanyId, raw),
    // Only resolve when it doesn't look like a crop_id already.
    // This prevents an extra RPC call and avoids blocking the page if crop resolver data isn't available.
    enabled: trimmedCompanyId.length > 0 && !!raw && !likelySlug && !error && userReady,
    staleTime: 60_000,
  });
}

export function useCropRecords(cropId: string, page: number, pageSize: number) {
  const { companyId, error } = useCompanyScope();
  const { user } = useAuth();
  const offset = (page - 1) * pageSize;

  const trimmedCompanyId = (companyId ?? '').trim();
  const userReady = Boolean(user?.id && String(user.id).trim() !== '');

  return useQuery({
    queryKey: [
      'records',
      'crop-records',
      trimmedCompanyId || 'pending',
      user?.id ?? 'anon',
      cropId,
      page,
      pageSize,
    ],
    queryFn: () => getCropRecords(trimmedCompanyId, cropId, pageSize, offset),
    enabled: trimmedCompanyId.length > 0 && !!cropId && !error && userReady,
    keepPreviousData: true,
  });
}

export function useCropRecordDetail(recordId: string | undefined) {
  return useQuery({
    queryKey: ['records', 'record-detail', recordId],
    queryFn: () => getCropRecordDetail(recordId!),
    enabled: !!recordId,
  });
}

export function useCreateCompanyRecordCrop() {
  const queryClient = useQueryClient();
  const { companyId } = useCompanyScope();
  const trimmedCompanyId = (companyId ?? '').trim();

  return useMutation({
    mutationFn: (name: string) => {
      if (!trimmedCompanyId) {
        throw new Error('Company workspace is required.');
      }
      return createCompanyRecordCrop(trimmedCompanyId, name);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['records', 'company-crops', trimmedCompanyId] });
    },
  });
}

export function useCreateCompanyCropRecord(cropId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useCompanyScope();
  const trimmedCompanyId = (companyId ?? '').trim();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (input: { title: string; content: string }) => {
      const clerkId = user?.id != null ? String(user.id).trim() : '';
      if (!clerkId) {
        throw new Error('Not authenticated');
      }
      if (!trimmedCompanyId) {
        throw new Error('Company workspace is required.');
      }
      return createCompanyCropRecord(
        clerkId,
        cropId,
        input.title,
        input.content,
        trimmedCompanyId || null,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['records', 'crop-records'] });
    },
  });
}

export function useUpdateCropRecord(recordId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { title?: string; content?: string }) =>
      updateCropRecord(recordId, input.title, input.content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['records', 'record-detail', recordId] });
    },
  });
}

export function useAddCropRecordAttachment(recordId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { fileUrl: string; fileName?: string; fileType?: string }) =>
      addCropRecordAttachment(recordId, input.fileUrl, input.fileName, input.fileType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['records', 'record-detail', recordId] });
    },
  });
}

export function useDeveloperCropRecords(filters: DeveloperRecordsFilter) {
  const { companyId, isDeveloper } = useCompanyScope();

  const effectiveFilters: DeveloperRecordsFilter = {
    ...filters,
    companyId: filters.companyId ?? null,
  };

  return useQuery({
    queryKey: ['developer', 'records', effectiveFilters],
    queryFn: () => getDeveloperCropRecords(effectiveFilters),
    enabled: isDeveloper,
    retry: (failureCount, err) => {
      const msg = err instanceof Error ? err.message.toLowerCase() : '';
      if (msg.includes('not authorized') || msg.includes('permission denied')) return false;
      return failureCount < 2;
    },
    placeholderData: (prev) => prev,
  });
}

/** Developer Control Center crop grid: same RPC as company admin, but `null` = all companies. */
export function useDeveloperCompanyRecordCrops(companyId: string | null) {
  const { isDeveloper } = useCompanyScope();

  return useQuery({
    queryKey: ['developer', 'company-crops', companyId ?? 'all'],
    queryFn: () => getCompanyRecordCrops(companyId),
    enabled: isDeveloper,
    retry: (failureCount, err) => {
      const msg = err instanceof Error ? err.message.toLowerCase() : '';
      if (msg.includes('not authorized') || msg.includes('permission denied')) return false;
      return failureCount < 2;
    },
  });
}

export function useSendDeveloperCropRecord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { companyId: string; cropId: string; title: string; content: string }) =>
      sendDeveloperCropRecordToCompany(input.companyId, input.cropId, input.title, input.content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['developer', 'records'] });
      queryClient.invalidateQueries({ queryKey: ['developer', 'company-crops'] });
    },
  });
}

export function useCreateDeveloperCropRecordTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { cropId: string; title: string; content: string }) =>
      createDeveloperCropRecordTemplate(input.cropId, input.title, input.content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['developer', 'records'] });
      queryClient.invalidateQueries({ queryKey: ['developer', 'company-crops'] });
    },
  });
}

export function useSendDeveloperCropRecordWithAttachments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      companyId: string;
      cropId: string;
      title: string;
      content: string;
      files: File[];
    }) =>
      sendDeveloperCropRecordToCompanyWithAttachments(
        input.companyId,
        input.cropId,
        input.title,
        input.content,
        input.files,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['developer', 'records'] });
      queryClient.invalidateQueries({ queryKey: ['developer', 'company-crops'] });
    },
  });
}

export function useCropIntelligence(cropId: string | undefined) {
  return useQuery<CropIntelligenceResponse | null>({
    queryKey: ['records', 'crop-intelligence', cropId],
    queryFn: () => getCropIntelligence(cropId!),
    enabled: !!cropId,
  });
}

export function useCropRecordInsights(cropId: string | undefined) {
  return useQuery<CropRecordInsightsResponse | null>({
    queryKey: ['records', 'crop-intelligence-insights', cropId],
    queryFn: () => getCropRecordInsights(cropId!),
    enabled: !!cropId,
  });
}

export function useUpsertCropKnowledgeProfile(cropId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (form: CropKnowledgeProfileForm) => upsertCropKnowledgeProfile(cropId!, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['records', 'crop-intelligence', cropId] });
      queryClient.invalidateQueries({ queryKey: ['records', 'crop-intelligence-insights', cropId] });
    },
  });
}

export function useAddCropKnowledgeChallenge(cropId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (form: CropKnowledgeChallengeForm) => addCropKnowledgeChallenge(cropId!, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['records', 'crop-intelligence', cropId] });
      queryClient.invalidateQueries({ queryKey: ['records', 'crop-intelligence-insights', cropId] });
    },
  });
}

export function useAddCropKnowledgePractice(cropId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (form: CropKnowledgePracticeForm) => addCropKnowledgePractice(cropId!, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['records', 'crop-intelligence', cropId] });
      queryClient.invalidateQueries({ queryKey: ['records', 'crop-intelligence-insights', cropId] });
    },
  });
}

export function useAddCropKnowledgeChemical(cropId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (form: CropKnowledgeChemicalForm) => addCropKnowledgeChemical(cropId!, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['records', 'crop-intelligence', cropId] });
      queryClient.invalidateQueries({ queryKey: ['records', 'crop-intelligence-insights', cropId] });
    },
  });
}

export function useAddCropKnowledgeTimingWindow(cropId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (form: CropKnowledgeTimingWindowForm) => addCropKnowledgeTimingWindow(cropId!, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['records', 'crop-intelligence', cropId] });
      queryClient.invalidateQueries({ queryKey: ['records', 'crop-intelligence-insights', cropId] });
    },
  });
}

