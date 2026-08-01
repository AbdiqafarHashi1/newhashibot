# Demo deployment

Run `npm ci`, `npm run test:cloud-deployment`, `cloud/scripts/security-audit.sh`, and `cloud/scripts/phase13-preflight.sh`. Review `terraform-plan-demo.sh`; then invoke the manually approved `hashibot-shadow-deploy` trigger with `_DEPLOY_APPROVED=true`. Add secret versions manually before deployment. Verify the generated certification shows all five services as demo/shadow/mutation-false. A plan or build is not proof of deployment.
