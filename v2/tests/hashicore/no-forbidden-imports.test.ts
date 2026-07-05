import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const source=readFileSync(join(process.cwd(),'services/hashicore/index.ts'),'utf8');
test('hashicore has no Supabase, execution, or Telegram imports',()=>{ assert.equal(/supabase/i.test(source),false); assert.equal(/execution\//i.test(source),false); assert.equal(/telegram/i.test(source),false); });
