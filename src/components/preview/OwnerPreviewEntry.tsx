import { enterAdminWorkspace } from '../../lib/ownerPreview/state';
export function OwnerPreviewEntry() {
  return <button type="button" onClick={()=>enterAdminWorkspace()} className="rounded-lg border border-blue-400/40 bg-blue-400/10 px-3 py-2 text-xs font-bold text-blue-300">Admin workspace</button>;
}
