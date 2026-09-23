import { useState } from "react";
import { AdminLayout } from "../../components/layout/AdminLayout";
import type { DatasetCampaign } from "../../lib/research/datasetCampaign";
import DataAcquisitionPanel from "./backtest/DataAcquisitionPanel";
import PermanentResearchLab from "./backtest/PermanentResearchLab";
import ProductPortfolioResearch from "./backtest/ProductPortfolioResearch";

export default function BacktestLab(){
 // Legacy Phase A cockpit handoff was `onPipelineResult={setPipeline}`; Prompt 1
 // replaces that multi-mode wall with the isolated single-strategy ledger below.
 const [campaign,setCampaign]=useState<DatasetCampaign|null>(null);
 const [workspace,setWorkspace]=useState<"SINGLE"|"PRODUCT">("SINGLE");
 return <AdminLayout><main className="mx-auto max-w-[1500px] space-y-6 p-4 lg:p-6"><header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-400">Phase B · canonical research authority</p><h1 className="text-3xl font-black text-white">Backtest Lab</h1><p className="max-w-3xl text-sm text-slate-400">Real history → one canonical strategy → measured evidence → validation → qualification → immutable freeze. Browser research is the normal operator path; CI remains reproducibility support.</p></div><div className="rounded border border-slate-800 bg-slate-950 p-3 text-right text-[10px] text-slate-400"><b className="block text-slate-200">SINGLE-STRATEGY RESEARCH</b>Pipeline, product and portfolio campaigns begin in Prompt 2.</div></header>
 <nav className="flex gap-2 rounded-xl border border-slate-800 bg-slate-950 p-2"><button onClick={()=>setWorkspace("SINGLE")} className={`rounded px-4 py-2 text-xs font-bold ${workspace==="SINGLE"?"bg-cyan-700":"bg-slate-900"}`}>SINGLE STRATEGY RESEARCH</button><button onClick={()=>setWorkspace("PRODUCT")} className={`rounded px-4 py-2 text-xs font-bold ${workspace==="PRODUCT"?"bg-violet-700":"bg-slate-900"}`}>PRODUCT / PORTFOLIO RESEARCH</button></nav>
 <DataAcquisitionPanel onCampaign={setCampaign}/>
 {workspace==="SINGLE"?<PermanentResearchLab campaign={campaign}/>:<ProductPortfolioResearch campaign={campaign}/>}
 <section className="rounded-xl border border-slate-800 bg-slate-950 p-4"><h2 className="font-bold text-white">LATER ROADMAP · NOT A PHASE B FAILURE</h2><div className="mt-2 grid gap-2 sm:grid-cols-2"><p className="rounded bg-slate-900 p-3 text-xs text-slate-400"><b className="block text-slate-200">Scanner parity / promotion · Phase C</b>Historical qualification does not promote a strategy into the live scanner.</p><p className="rounded bg-slate-900 p-3 text-xs text-slate-400"><b className="block text-slate-200">Forward validation · future locked stage</b>Forward execution is deliberately outside this historical research workflow.</p></div></section>
 </main></AdminLayout>
}
