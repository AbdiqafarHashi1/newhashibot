/*
  # Add access_requests table and update telegram_links

  ## New Tables
  - `access_requests` — Customer signal access requests
    - id, user_id, product_slug, full_name, email, phone, telegram_username,
      telegram_chat_id, payment_method, notes, status, admin_note,
      created_at, updated_at

  ## Modified Tables
  - `telegram_links` — Add phone column if missing

  ## Security
  - RLS enabled on access_requests
  - Users can insert/read their own requests
  - Admins can read/update all requests
*/

-- access_requests table
CREATE TABLE IF NOT EXISTS access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_slug text NOT NULL DEFAULT 'signal_mode',
  full_name text DEFAULT '',
  email text DEFAULT '',
  phone text DEFAULT '',
  telegram_username text DEFAULT '',
  telegram_chat_id text DEFAULT '',
  payment_method text DEFAULT 'manual',
  notes text DEFAULT '',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'converted_to_access')),
  admin_note text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own access requests"
  ON access_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own access requests"
  ON access_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all access requests"
  ON access_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update all access requests"
  ON access_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE INDEX IF NOT EXISTS idx_access_requests_user_id ON access_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status);

-- Add phone column to telegram_links if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'telegram_links' AND column_name = 'phone'
  ) THEN
    ALTER TABLE telegram_links ADD COLUMN phone text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'telegram_links' AND column_name = 'admin_note'
  ) THEN
    ALTER TABLE telegram_links ADD COLUMN admin_note text DEFAULT '';
  END IF;
END $$;
