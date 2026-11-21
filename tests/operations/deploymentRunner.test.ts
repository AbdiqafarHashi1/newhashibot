import {test} from 'node:test';import assert from 'node:assert/strict';
// @ts-expect-error reviewed deployment helper is an ESM operator script.
import {validateReviewedRelease,assertDryRunMatches} from '../../scripts/phase-p/deploy-reviewed-release.mjs';
test('deployment refuses guessed history, another project, noncanonical paths and changed pending sets',()=>{
 assert.throws(()=>validateReviewedRelease({status:'REFUSED',pending:[]}));assert.throws(()=>validateReviewedRelease({status:'REVIEWABLE_DRY_RUN',projectRef:'another',pending:[]}));
 assert.throws(()=>validateReviewedRelease({status:'REVIEWABLE_DRY_RUN',projectRef:'uqiwbzfcntlcyyewawfc',pending:[{path:'../unknown.sql'}]}));
 const file='20261017014250_measured_execution_lineage.sql';assertDryRunMatches(`Would push these migrations:\n${file}`,[file]);assert.throws(()=>assertDryRunMatches('Unable to identify remote pending migrations',[file]));assert.throws(()=>assertDryRunMatches('20261016040740_account_authorization_and_outcome_evidence.sql',[file]));
});

// @ts-expect-error source inventory is an ESM operator script.
import {buildManifest} from '../../scripts/phase-p/deployment-manifest.mjs';
test('reviewed release binds function and workflow source even when no SQL is pending',()=>{
 const fingerprint=buildManifest().sourceFingerprint;
 const plan={status:'REVIEWABLE_DRY_RUN',blockers:[],projectRef:'uqiwbzfcntlcyyewawfc',pending:[],sourceFingerprint:fingerprint};
 assert.deepEqual(validateReviewedRelease(plan),[]);
 assert.throws(()=>validateReviewedRelease({...plan,sourceFingerprint:'older-function-code'}),/REVIEWED_RELEASE_SOURCE_CHANGED/);
 assert.throws(()=>validateReviewedRelease({...plan,sourceFingerprint:undefined}),/REVIEWED_RELEASE_SOURCE_CHANGED/);
});
