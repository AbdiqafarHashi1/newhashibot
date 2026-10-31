/** Read-only research assessment. This never grants release, publication or execution authority. */
export type CoverageRole='BULL_TREND'|'BEAR_TREND'|'RANGE';
export interface CoverageEvidence {familyKey:string;strategyId:string;role:CoverageRole;period:string;configurationHash:string;resolved:number;netPF:number|null;stressPF:number|null;meanNetR:number|null;observedRegime:boolean}
export function assessStrategyComplementarity(input:{configurationHash:string;periods:readonly string[];evidence:readonly CoverageEvidence[];entriesPerDay:number;activeDayFraction:number}){
 const roles:CoverageRole[]=['BULL_TREND','BEAR_TREND','RANGE'],reasons:string[]=[];
 if(input.evidence.some(e=>e.configurationHash!==input.configurationHash))throw Error('COVERAGE_LINEAGE_MISMATCH');
 const proven=input.evidence.filter(e=>e.observedRegime&&e.resolved>=30&&e.netPF!==null&&e.netPF>=1.2&&e.stressPF!==null&&e.stressPF>1&&e.meanNetR!==null&&e.meanNetR>0);
 const families=[...new Set(proven.map(e=>e.familyKey))].filter(f=>input.periods.every(p=>proven.some(e=>e.familyKey===f&&e.period===p)));
 const missing=roles.filter(r=>!families.some(f=>input.periods.every(p=>proven.some(e=>e.familyKey===f&&e.role===r&&e.period===p))));
 if(families.length<4)reasons.push('FOUR_INDEPENDENT_FAMILIES_NOT_ESTABLISHED');if(missing.length)reasons.push('REGIME_COVERAGE_INCOMPLETE');if(!(input.entriesPerDay>=1))reasons.push('PARTICIPATION_BELOW_TARGET');if(!(input.activeDayFraction>=.7))reasons.push('ACTIVE_DAY_COVERAGE_BELOW_TARGET');
 return {classification:'READ_ONLY_RESEARCH_COVERAGE' as const,status:reasons.length?'INCOMPLETE':'SUPPORTED_IN_RESEARCH',qualifyingFamilyCount:families.length,missingRoles:missing,reasons,publication:false,execution:false};
}
