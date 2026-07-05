import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const source=readFileSync(join(process.cwd(),'services/hashicore/index.ts'),'utf8');
test('hashicore has no Supabase, Telegram, frontend, or direct provider adapter imports',()=>{ assert.equal(/supabase/i.test(source),false); assert.equal(/telegram/i.test(source),false); assert.equal(/apps\//i.test(source),false); assert.equal(/adapters\/(binance|bybit|mt5)/i.test(source),false); assert.equal(/openPosition\(|createOrder\(|placeOrder\(/i.test(source),false); });
