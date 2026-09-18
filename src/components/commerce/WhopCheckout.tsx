import { ExternalLink, ShieldCheck } from 'lucide-react';
import { getWhopCheckout, type CommerceProduct } from '../../lib/commerce';

export function WhopCheckout({ product, compact = false }: { product: CommerceProduct; compact?: boolean }) {
  const checkout = getWhopCheckout(product);
  if (!checkout.configured) {
    return (
      <div className="rounded-xl border border-zinc-700 bg-zinc-900/70 p-4 text-sm text-zinc-300" role="status">
        <strong className="text-white">Card checkout is temporarily unavailable.</strong>
        <p className="mt-1 text-xs text-zinc-400">Please try again shortly or choose another available payment option.</p>
      </div>
    );
  }

  if (compact) {
    return <a href={checkout.checkoutUrl} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-xs font-bold text-white hover:bg-blue-500">Pay securely with Whop <ExternalLink size={14} /></a>;
  }

  return <div className="rounded-2xl border border-blue-500/30 bg-zinc-950 p-7 text-center shadow-2xl"><ShieldCheck className="mx-auto text-blue-400"/><h3 className="mt-3 font-bold text-white">Card / International</h3><p className="mx-auto mt-2 max-w-lg text-xs leading-6 text-zinc-400">Continue to the exact Whop-hosted checkout URL configured for this HashiBot product. Whop remains authoritative for billing and membership lifecycle.</p><a href={checkout.checkoutUrl} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white hover:bg-blue-500">Continue to Whop <ExternalLink size={14}/></a></div>;
}
