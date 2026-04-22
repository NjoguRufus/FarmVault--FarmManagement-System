export type CreateHarvestCollectionParams = {
  companyId: string;
  projectId: string;
  harvestedOn?: Date | string;
  harvestDate?: Date | string;
  cropType?: string;
  notes?: string | null;
  name?: string | null;
  pricePerKg?: number;
  pricePerKgPicker?: number;
};
