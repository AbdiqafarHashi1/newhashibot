import { supabase } from './supabase';
import type { CheckoutAttribution, CommerceProduct } from './commerce';

export interface MpesaManualRequest {
  userId: string;
  fullName: string;
  email: string;
  phone?: string;
  packageSlug: string;
  packageName: string;
  product: CommerceProduct;
  amountKes: number;
  transactionReference: string;
  paymentDate: string;
  telegramUsername?: string;
  notes?: string;
  attribution?: CheckoutAttribution;
}

/** Records evidence for review. It never verifies payment or grants entitlement. */
export async function submitManualMpesaRequest(request: MpesaManualRequest) {
  const attribution = request.attribution
    ? `\nCommerce attribution: ${JSON.stringify(request.attribution)}`
    : '';
  const { data, error } = await supabase.from('access_requests').insert({
    user_id: request.userId,
    full_name: request.fullName.trim(),
    email: request.email.trim().toLowerCase(),
    phone: request.phone?.trim() || null,
    product_slug: request.packageSlug,
    package_name: request.packageName,
    amount_kes: request.amountKes,
    expected_amount_kes: request.amountKes,
    payment_method: 'mpesa',
    payment_reference: request.transactionReference.trim().toUpperCase(),
    payment_date: request.paymentDate,
    telegram_username: request.telegramUsername?.trim() || null,
    notes: `${request.notes?.trim() || ''}${attribution}`.trim() || null,
    attribution: request.attribution || {},
    status: 'pending',
    created_at: new Date().toISOString(),
  }).select('public_reference').single();

  if (error || !data?.public_reference) throw new Error(error?.message || 'Payment evidence could not be saved. Nothing was registered.');
  return { publicReference: data.public_reference as string, status: 'PENDING_VERIFICATION' as const };
}
