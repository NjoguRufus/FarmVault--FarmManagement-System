export type MpesaPaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export type MpesaBillingCycle = 'monthly' | 'seasonal' | 'annual';

export interface MpesaPaymentRow {
  id: string;
  checkout_request_id: string | null;
  company_id: string | null;
  billing_reference: string | null;
  plan: string | null;
  billing_cycle: string | null;
  amount: number | string | null;
  mpesa_receipt: string | null;
  result_code: number | null;
  result_desc: string | null;
  phone: string | null;
  status: string;
  paid_at: string | null;
  subscription_activated: boolean;
  created_at: string;
}

export interface InitiateStkPushParams {
  phone: string;
  /** KES integer from selected plan/cycle. */
  amount: number;
  company_id: string;
  billing_reference: string;
  plan: string;
  billing_cycle: MpesaBillingCycle;
}
