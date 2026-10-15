/** Read every evidence page or fail; never export a silently truncated ledger. */
export async function readEvidencePages<T>(page:(offset:number,size:number)=>Promise<T[]>, maximum=20000):Promise<T[]> {
 const out:T[]=[];const size=1000;
 for(let offset=0;offset<=maximum;offset+=size){const rows=await page(offset,size);if(out.length+rows.length>maximum)throw new Error('EVIDENCE_EXPORT_LIMIT_EXCEEDED');out.push(...rows);if(rows.length<size)return out;}
 throw new Error('EVIDENCE_EXPORT_LIMIT_EXCEEDED');
}
