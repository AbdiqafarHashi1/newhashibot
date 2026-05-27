/*
  # Fix signal_updates table column compatibility

  1. Problem
     - evaluate-signal-outcomes function writes 'previous_status' column
     - But the table has 'old_status' column
     - This causes silent failures when the outcome evaluator runs

  2. Fix
     - Add 'previous_status' as an alias column if not already present
     - Keep 'old_status' for backward compatibility

  3. Also adds
     - telegram_sent boolean to track Telegram outcome notifications
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signal_updates' AND column_name = 'previous_status'
  ) THEN
    ALTER TABLE signal_updates ADD COLUMN previous_status text;
    -- Backfill from old_status if it has data
    UPDATE signal_updates SET previous_status = old_status WHERE previous_status IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signal_updates' AND column_name = 'telegram_sent'
  ) THEN
    ALTER TABLE signal_updates ADD COLUMN telegram_sent boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signal_updates' AND column_name = 'reason'
  ) THEN
    ALTER TABLE signal_updates ADD COLUMN reason text DEFAULT '';
  END IF;
END $$;
