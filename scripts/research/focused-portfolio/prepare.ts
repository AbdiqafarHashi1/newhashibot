import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {EXECUTION_CANONICAL_REVIEWS} from '../../../supabase/functions/_shared/execution-canonical-reviews.ts';
/** Restore normalized data from committed evidence only; never runs activation or acquisition. */
export function savedLedgerData(){mkdirSync('.tmp',{recursive:true});writeFileSync('.tmp/part1-reviews.json',JSON.stringify(EXECUTION_CANONICAL_REVIEWS));execFileSync('python3',['scripts/part1/extract-ledgers.py'],{stdio:'pipe'});return readFileSync('.tmp/part1-ledgers.json','utf8');}
