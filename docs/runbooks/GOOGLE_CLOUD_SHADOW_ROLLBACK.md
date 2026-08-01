# Shadow rollback

Select one verified Cloud Run revision shared by the coordinated release and run `cloud/scripts/rollback-shadow.sh REVISION`. Then run `cloud/scripts/verify-shadow.sh`. Rollback changes demo traffic only and cannot enable mutations.
