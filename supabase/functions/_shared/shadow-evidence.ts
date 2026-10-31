const stable=(x:unknown):string=>x===null||typeof x!=='object'?JSON.stringify(x):Array.isArray(x)?`[${x.map(stable)}]`:`{${Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
export const sameShadowEvidence=(a:unknown,b:unknown)=>stable(JSON.parse(JSON.stringify(a)))===stable(JSON.parse(JSON.stringify(b)));
