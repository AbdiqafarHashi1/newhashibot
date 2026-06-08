/*
  HASHIBOT B6.5 — Bot pause state separate from scanner and kill switch

  Adds bot_paused to execution_settings so operators can pause new trade entries
  while the 1-minute monitor continues managing open positions.

  bot_paused = true  → no new entries, existing positions managed normally
  kill_switch_enabled = true → hard stop: no new entries (monitor skips but
                               does not close positions by itself — use the
                               close_position action for that)

  Scanner, Signal Mode, Telegram delivery, and outcome tracking are NOT affected
  by either flag. They are controlled by scanner_config.is_enabled and
  scanner_config.schedule_enabled only.
*/

ALTER TABLE public.execution_settings
  ADD COLUMN IF NOT EXISTS bot_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bot_paused_reason text;

UPDATE public.execution_settings
SET bot_paused = false
WHERE id = 1 AND bot_paused IS NULL;
