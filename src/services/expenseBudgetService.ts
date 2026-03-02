import { doc, getDoc, getDocFromCache, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { decrementPoolRemaining } from './budgetPoolService';

/**
 * After creating an expense linked to a project, call this to deduct from
 * the project's budget or from its linked budget pool.
 * - If project.budgetPoolId is set: decrement budgetPools.remainingAmount.
 * - Else: decrement project.budget.
 * No-op if projectId is missing or project not found.
 */
export async function applyExpenseDeduction(
  companyId: string,
  projectId: string,
  amount: number
): Promise<void> {
  if (!projectId || !companyId || Number(amount) <= 0) return;

  const projectRef = doc(db, 'projects', projectId);
  let snap;
  try {
    snap = await getDoc(projectRef);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    const msg = String((err as Error)?.message ?? '');
    if (code === 'unavailable' || /offline|unavailable|failed to get/i.test(msg)) {
      try {
        snap = await getDocFromCache(projectRef);
      } catch {
        // Offline and no cached project document: skip budget deduction but don't block expense creation.
        return;
      }
    } else {
      throw err;
    }
  }
  if (!snap.exists()) return;
  const data = snap.data();
  if (data?.companyId !== companyId) return;

  const budgetPoolId = data.budgetPoolId ?? null;
  if (budgetPoolId) {
    await decrementPoolRemaining(budgetPoolId, amount);
    return;
  }

  const currentBudget = Number(data.budget ?? 0);
  const nextBudget = Math.max(0, currentBudget - amount);
  await updateDoc(projectRef, { budget: nextBudget });
}
