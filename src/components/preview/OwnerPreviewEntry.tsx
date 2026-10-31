import { enterOwnerPreview } from '../../lib/ownerPreview/state';
export function OwnerPreviewEntry() {
  return <button type="button" onClick={()=>enterOwnerPreview()} className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-300">Owner Preview</button>;
}
