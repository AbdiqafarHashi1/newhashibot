-- INSPECTION_ONLY. Run separately from migrations after verified project binding.
-- Aggregate counts only; no customer rows or secret values are returned.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='30s';
SELECT 'quarantine_provider_symbol_duplicates' AS blocker, count(*) AS groups
FROM (SELECT provider,symbol FROM public.problem_symbol_quarantine GROUP BY provider,symbol HAVING count(*)>1) duplicates;
SELECT 'trade_truth_execution_order_duplicates' AS blocker, count(*) AS groups
FROM (SELECT execution_order_id FROM public.trade_management_truth WHERE execution_order_id IS NOT NULL GROUP BY execution_order_id HAVING count(*)>1) duplicates;
SELECT 'unowned_legacy_trade_truth' AS review_required, count(*) AS rows
FROM public.trade_management_truth WHERE customer_id IS NULL OR account_id IS NULL OR execution_scope_key IS NULL;
COMMIT;
