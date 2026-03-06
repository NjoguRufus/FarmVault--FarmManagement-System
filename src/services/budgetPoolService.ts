import {
  addDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  doc,
  updateDoc,
  increment,
} from '@/lib/firestore-stub';
import { db } from '@/lib/firebase';
import type { BudgetPool } from '@/types';

const COLLECTION = 'budgetPools';

export interface CreateBudgetPoolInput {
  companyId: string;
  name: string;
  totalAmount: number;
}

export async function createBudgetPool(input: CreateBudgetPoolInput): Promise<string> {
  const amount = Number(input.totalAmount) || 0;
  const ref = await addDoc(collection(db, COLLECTION), {
    companyId: input.companyId,
    name: input.name.trim(),
    totalAmount: amount,
    remainingAmount: amount,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getBudgetPoolsByCompany(companyId: string): Promise<BudgetPool[]> {
  const q = query(
    collection(db, COLLECTION),
    where('companyId', '==', companyId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    createdAt: d.data().createdAt,
  })) as BudgetPool[];
}

export async function decrementPoolRemaining(poolId: string, amount: number): Promise<void> {
  const ref = doc(db, COLLECTION, poolId);
  await updateDoc(ref, {
    remainingAmount: increment(-Number(amount)),
  });
}
