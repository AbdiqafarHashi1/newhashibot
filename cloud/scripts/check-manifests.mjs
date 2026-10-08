import {existsSync,readFileSync,readdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const root='cloud/infrastructure/terraform/portable-worker';
for(const file of ['cloud/worker/index.ts','cloud/Dockerfile','cloud/tsconfig.json',`${root}/main.tf`,`${root}/terraform.tfvars.example`])assert.ok(existsSync(file),file);
const packageJson=JSON.parse(readFileSync('package.json','utf8'));
for(const file of readdirSync('cloud/scripts').filter(x=>x.endsWith('.sh'))){
 const text=readFileSync(`cloud/scripts/${file}`,'utf8');
 for(const match of text.matchAll(/npm run ([a-zA-Z0-9:-]+)/g))assert.ok(packageJson.scripts[match[1]],`${file}: absent command ${match[1]}`);
 for(const match of text.matchAll(/(?:bash |node |-f )(cloud\/[a-zA-Z0-9/._-]+)/g))assert.ok(existsSync(match[1]),`${file}: absent file ${match[1]}`);
 assert.ok(!/gcloud |docker push|terraform .*apply|terraform .*destroy/.test(text),`${file}: remote mutation`);
}
const tf=readFileSync(`${root}/main.tf`,'utf8');
assert.ok(tf.includes('parallelism = 1')&&tf.includes('max_retries     = 0'));
assert.ok(!tf.includes('allUsers')&&!tf.includes('google_cloud_scheduler'));
assert.ok(readFileSync(`${root}/terraform.tfvars.example`,'utf8').includes('deployment_enabled     = false'));
console.log('Cloud entry points, commands, disabled actions and deployment limits verified');
