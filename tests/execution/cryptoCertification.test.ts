import assert from 'node:assert/strict';
import { CryptoCertification } from '../../src/lib/exchange/CryptoCertification.js';

async function run() {
  console.log('--- Starting Crypto Certification & Chaos Test Suite ---');
  const results = await CryptoCertification.runAllScenarios();

  const scenarioNames = Object.keys(results);
  assert.equal(scenarioNames.length, 25, 'All 25 chaos scenarios must be executed and evaluated');

  console.log(`Executed ${scenarioNames.length} scenarios:`);

  let passCount = 0;
  let warningCount = 0;
  let failCount = 0;

  for (const [name, result] of Object.entries(results)) {
    console.log(` - Scenario: ${name.padEnd(40)} | Result: ${result.category} | Self-Healed: ${result.selfHealed ? 'YES' : 'NO '} | Latency: ${result.latencyMs}ms`);
    
    if (result.category === 'PASS') {
      passCount++;
    } else if (result.category === 'WARNING') {
      warningCount++;
    } else {
      failCount++;
    }

    // Verify timelines exist
    assert.ok(result.executionTimeline.length > 0, `Scenario ${name} must have an execution timeline`);
    assert.ok(result.supervisorTimeline.length > 0, `Scenario ${name} must have a supervisor timeline`);
    assert.ok(result.certificationId.startsWith('cert_'), `Scenario ${name} must have a valid Certification ID`);
  }

  console.log(`\nCertification Summary:`);
  console.log(` - PASS:    ${passCount}`);
  console.log(` - WARNING: ${warningCount}`);
  console.log(` - FAIL:    ${failCount}`);

  assert.equal(failCount, 0, 'No certification scenario must fail');
  assert.ok(passCount >= 22, 'At least 22 core scenarios must fully pass with active self-healing');

  console.log('--- Crypto Certification & Chaos Test Suite Completed Successfully ---');
}

run().catch((err) => {
  console.error('Crypto Certification failed:', err);
  process.exit(1);
});
