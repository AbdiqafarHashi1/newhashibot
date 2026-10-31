import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
try{
 await db.exec("CREATE TABLE validation_outcomes(strategy_id text NOT NULL,timeframe text NOT NULL,status text NOT NULL CHECK(status IN ('TARGET','STOP','OPEN','AMBIGUOUS','EXCLUDED')),exit_time timestamptz,exit_price numeric,net_r numeric)");
 await db.exec(readFileSync('supabase/migrations/20261028120000_target_free_replay_outcomes.sql','utf8'));
 await db.exec("INSERT INTO validation_outcomes VALUES('crypto.daily-ema-trend','1d','REGIME_EXIT','2026-01-01',100,1),('legacy','15m','TIMEOUT','2026-01-01',100,-1)");
 await assert.rejects(db.exec("INSERT INTO validation_outcomes VALUES('legacy','15m','REGIME_EXIT','2026-01-01',100,1)"),/validation_regime_exit_scope_check/);
 await assert.rejects(db.exec("INSERT INTO validation_outcomes VALUES('crypto.daily-ema-trend','1d','REGIME_EXIT',null,100,1)"),/validation_regime_exit_scope_check/);
 await assert.rejects(db.exec("INSERT INTO validation_outcomes VALUES('legacy','15m','MADE_UP',null,null,null)"),/validation_outcomes_status_check/);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM validation_outcomes')).rows[0].n,2);
 console.log('PASS actual embedded PostgreSQL migration and outcome constraints; not full Auth/PostgREST/RLS or concurrency proof');
}finally{await db.close();}
