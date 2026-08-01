# Trade Protection Failure

Mark the filled trade recovery-required, record observed SL/TP evidence, and issue only bounded idempotent repair requests. Reconcile before each attempt. After the configured attempt budget, request emergency close and operator intervention; never silently continue normal management. Provider-native protection remains mandatory where supported. Telegram failure must not block this workflow.
