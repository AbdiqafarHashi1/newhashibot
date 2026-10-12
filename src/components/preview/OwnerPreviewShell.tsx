import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { previewStore } from '../../lib/ownerPreview/adapter';
import { previewCustomers } from '../../lib/ownerPreview/fixtures';
import { ownerPreviewRoutes } from '../../lib/ownerPreview/routes';
import { demonstrationLabel, exitOwnerPreview, isOwnerPreview, resetOwnerPreview } from '../../lib/ownerPreview/state';

export function OwnerPreviewShell() {
  const location = useLocation();
  const controls = useRef<HTMLElement>(null);
  const routeMenu = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if (routeMenu.current) routeMenu.current.open = false; }, [location.pathname]);
  const revision = useSyncExternalStore(previewStore.subscribe, previewStore.snapshot);
  const active = isOwnerPreview();
  previewStore.setView(location.pathname.startsWith('/app/') ? 'customer' : 'admin', /^\/app\/(crypto-execution|mt5-personal|mt5-prop|bot-setup|bridge|visual-bridge)$/.test(location.pathname));
  useEffect(() => {
    if (!active) return;
    document.documentElement.classList.add('owner-preview');
    const size = new ResizeObserver(() => { if (controls.current) document.documentElement.style.setProperty('--owner-preview-height', `${controls.current.getBoundingClientRect().height}px`); });
    if (controls.current) size.observe(controls.current);
    const protect = () => {
      document.querySelectorAll<HTMLInputElement>('input, textarea').forEach(input => {
        const label = input.closest('label')?.textContent ?? input.parentElement?.querySelector('label')?.textContent ?? '';
        const description = `${input.name} ${input.id} ${input.placeholder} ${input.getAttribute('aria-label')} ${label}`;
        if (input.type === 'password' || input.type === 'file' || /api.?key|api.?secret|password|passphrase|access.?token|service.?role|bot.?token|private.?key|credential|account.?number|trader.?login/i.test(description)) {
          input.disabled = true;
          input.value = '';
          input.placeholder = 'Credentials disabled in Owner Preview';
          input.title = 'Do not enter real credentials. Owner Preview uses fixtures only.';
          input.setAttribute('data-preview-credential', 'disabled');
        }
      });
      // Labels travel with each results table, evidence inspector and screen section.
      document.querySelectorAll('main table, main pre, main section').forEach(element => {
        if (element.previousElementSibling?.hasAttribute('data-preview-evidence')) return;
        const label = document.createElement('p');
        label.setAttribute('data-preview-evidence', 'true');
        label.className = 'text-[10px] text-amber-300 my-2';
        label.textContent = demonstrationLabel;
        element.before(label);
      });
    };
    protect();
    const observer = new MutationObserver(protect);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); size.disconnect(); document.documentElement.classList.remove('owner-preview'); };
  }, [active, location.pathname, revision]);
  if (!active) return null;
  return <>
    <style>{`.owner-preview #root{padding-top:var(--owner-preview-height,160px);max-width:100vw;overflow-x:clip}.owner-preview aside.fixed:not([aria-label="Owner Preview controls"]){top:var(--owner-preview-height,160px)}.owner-preview header.sticky{top:var(--owner-preview-height,160px)}`}</style>
    <aside ref={controls} aria-label="Owner Preview controls" className="fixed inset-x-0 top-0 z-[100] border-b border-amber-400/40 bg-zinc-950 px-3 py-2 text-amber-200" style={{top:0}}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <strong>OWNER PREVIEW — simulated data; no real actions.</strong>
        <div className="flex gap-3"><Link to="/admin/mission-control">Admin journey</Link><Link to="/app/onboarding">Customer journey</Link><button onClick={resetOwnerPreview}>Reset demonstration data</button><button onClick={exitOwnerPreview}>Exit preview</button></div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <label>Customer <select aria-label="Preview customer" className="max-w-48 rounded bg-zinc-800 p-1" value={previewStore.customer().id} onChange={e => previewStore.selectCustomer(e.target.value)}>{previewCustomers.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}</select></label>
        <label>Account <select aria-label="Preview account" className="max-w-48 rounded bg-zinc-800 p-1" value={previewStore.account().id} onChange={e => previewStore.selectAccount(e.target.value)}>{previewStore.accounts().map(a => <option key={a.id} value={a.id}>{a.display_label}</option>)}</select></label>
        <span>Risk {previewStore.account().risk_percent}% · {previewStore.account().status} · fixtures do not prove database isolation.</span>
        <details ref={routeMenu} className="relative"><summary className="cursor-pointer">All implemented routes</summary><nav aria-label="Preview route inventory" className="fixed right-3 top-[var(--owner-preview-height)] max-h-[65vh] w-72 overflow-auto rounded border border-amber-500/30 bg-zinc-950 p-3 shadow-xl">{ownerPreviewRoutes.map(path => <Link key={path} to={path} className="block py-2 text-xs">{path}</Link>)}<p className="mt-3 text-amber-400">Support is in customer Readiness. Incidents are in Operations Center / Recovery. Live certification, signed bridge pairing, AI, payment, membership delivery, remote workers and real provider actions are unavailable here; fixtures are not verification.</p></nav></details>
      </div>
      <p className="mt-1 text-[10px]">All performance, payment, membership and certification results are demonstration evidence. Real backtests and forward testing require authenticated backend configuration.</p>
    </aside>
    {/* Remount existing page subtree on customer/account change, retaining adapter state. */}
    <span hidden data-preview-revision={revision} />
  </>;
}
