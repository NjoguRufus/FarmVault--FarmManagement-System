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
  getCropIntelligence,
  getCropRecordInsights,
  resolveRecordCrop,
  type ResolvedRecordCrop,
  upsertCropKnowledgeProfile,
  addCropKnowledgeChallenge,
  addCropKnowledgePractice,
  addCropKnowledgeChemical,
  addCropKnowledgeTimingWindow,
  type DeveloperRecordsFilter,
  type CropIntelligenceResponse,
  type CropRecordInsightsResponse,
  type CropKnowledgeProfileForm,
  type CropKnowledgeChallengeForm,
  type CropKnowledgePracticeForm,
  type CropKnowledgeChemicalForm,
  type CropKnowledgeTimingWindowForm,
} from '@/services/recordsService';
import { useCompanyScope } from '@/hooks/useCompanyScope';

export function useCompanyRecordCrops() {
  const { companyId, error } = useCompanyScope();

  return useQuery({
    queryKey: ['records', 'company-crops', companyId],
    queryFn: () => getCompanyRecordCrops(companyId!),
    enabled: !!companyId && !error,
  });
}

export function useResolveCompanyRecordCrop(cropIdOrName: string | undefined) {
  const { companyId, error } = useCompanyScope();
  const raw = (cropIdOrName ?? '').trim();
  const likelySlug = raw !== '' && raw === raw.toLowerCase() && !/\s/.test(raw);

  return useQuery<ResolvedRecordCrop | null>({
    queryKey: ['records', 'resolve-crop', companyId, raw],
    queryFn: () => resolveRecordCrop(companyId!, raw),
    // Only resolve when it doesn't look like a crop_id already.
    // This prevents an extra RPC call and avoids blocking the page if crop resolver data isn't available.
    enabled: !!companyId && !!raw && !likelySlug && !error,
    staleTime: 60_000,
  });
}

export function useCropRecords(cropId: string, page: number, pageSize: number) {
  const { companyId, error } = useCompanyScope();
  const offset = (page - 1) * pageSize;

  return useQuery({
    queryKey: ['records', 'crop-records', companyId, cropId, page, pageSize],
    queryFn: () => getCropRecords(companyId!, cropId, pageSize, offset),
    enabled: !!companyId && !!cropId && !error,
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

  return useMutation({
    mutationFn: (name: string) => createCompanyRecordCrop(companyId!, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['records', 'company-crops', companyId] });
    },
  });
}

export function useCreateCompanyCropRecord(cropId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useCompanyScope();

  return useMutation({
    mutationFn: (input: { title: string; content: string }) =>
      createCompanyCropRecord(companyId!, cropId, input.title, input.content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['records', 'crop-records', companyId, cropId] });
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
    keepPreviousData: true,
  });
}

export function useSendDeveloperCropRecord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { companyId: string; cropId: string; title: string; content: string }) =>
      sendDeveloperCropRecordToCompany(input.companyId, input.cropId, input.title, input.content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['developer', 'records'] });
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

