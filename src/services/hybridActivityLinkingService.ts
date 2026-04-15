import {
  countUnlinkedFarmExpenses,
  linkFarmExpensesToProject,
} from '@/services/financeExpenseService';
import {
  countUnlinkedFarmWorkCards,
  linkFarmWorkCardsToProject,
} from '@/services/operationsWorkCardService';

export async function countUnlinkedFarmActivities(params: {
  companyId: string;
  farmId: string;
}): Promise<{ expenses: number; operations: number; total: number }> {
  const [expenses, operations] = await Promise.all([
    countUnlinkedFarmExpenses(params),
    countUnlinkedFarmWorkCards(params),
  ]);
  return { expenses, operations, total: expenses + operations };
}

export async function linkUnlinkedFarmActivitiesToProject(params: {
  companyId: string;
  farmId: string;
  projectId: string;
}): Promise<{ linkedExpenses: number; linkedOperations: number; totalLinked: number }> {
  const [linkedExpenses, linkedOperations] = await Promise.all([
    linkFarmExpensesToProject(params),
    linkFarmWorkCardsToProject(params),
  ]);
  return {
    linkedExpenses,
    linkedOperations,
    totalLinked: linkedExpenses + linkedOperations,
  };
}
