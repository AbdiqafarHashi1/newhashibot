import ts from 'typescript';
import path from 'node:path';
// Check diagnostics on this feature's files only, following imports for their types.
const files=['src/lib/clientBacktestEngine.ts','src/lib/clientBacktestSources.ts','src/components/guards/StrictBacktestAdmin.tsx','src/pages/admin/BacktestLab.tsx','src/pages/admin/LegacyBacktestLab.tsx','src/pages/admin/backtest/BrowserLedgerLab.tsx','scripts/research/export-browser-ledger.ts','tests/clientBacktestEngine.test.ts'];
const selected=new Set(files.map(f=>path.resolve(f)));
const program=ts.createProgram(files,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,jsx:ts.JsxEmit.ReactJSX,strict:true,resolveJsonModule:true,allowImportingTsExtensions:true,esModuleInterop:true,skipLibCheck:true,noEmit:true});
const all=ts.getPreEmitDiagnostics(program),diagnostics=all.filter(d=>!d.file||selected.has(path.resolve(d.file.fileName)));
if(diagnostics.length)console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>process.cwd(),getCanonicalFileName:f=>f,getNewLine:()=> '\n'}));
console.log(`Browser lab typecheck: ${files.length} touched TS/TSX files, ${diagnostics.length} diagnostics. ${all.length-diagnostics.length} dependency diagnostics outside this scope.`);
process.exitCode=diagnostics.length?1:0;
