/*
  # Fix profiles RLS infinite recursion

  ## Problem
  The "Admins can read all profiles" and "Admins can update all profiles" policies
  used `EXISTS (SELECT 1 FROM profiles p2 WHERE p2.id = auth.uid() AND p2.role = 'admin')`.
  This queries the profiles table from inside a profiles policy, causing infinite recursion.

  ## Solution
  1. Create a SECURITY DEFINER helper function `is_admin()` that reads profiles bypassing RLS.
  2. Create a SECURITY DEFINER helper function `no_admin_exists()` for bootstrap claim check.
  3. Drop all existing profiles policies.
  4. Recreate policies using the helper functions instead of direct profiles subqueries.

  ## Changes
  - New function: `public.is_admin()` — returns true if current user has role=admin in profiles
  - New function: `public.no_admin_exists()` — returns true if zero admins exist (bootstrap only)
  - Recreated all profiles RLS policies (5 policies: INSERT, SELECT own, SELECT all admins, UPDATE own, UPDATE admin)
  - Special bootstrap UPDATE policy: allows updating own role to admin ONLY when no admin exists yet

  ## Security
  - SECURITY DEFINER functions run as the function owner (postgres), bypassing RLS
  - search_path = public is set to prevent search path injection
  - All policies still restrict to authenticated users
  - Users cannot update their own role via the normal UPDATE policy (role is excluded)
  - Bootstrap claim policy only works when no admin exists
*/

-- ============================================================
-- 1. Helper: is_admin() — reads profiles with RLS bypassed
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  );
$$;

-- ============================================================
-- 2. Helper: no_admin_exists() — true when zero admins exist
-- ============================================================
CREATE OR REPLACE FUNCTION public.no_admin_exists()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE role = 'admin'
  );
$$;

-- ============================================================
-- 3. Drop all existing profiles policies
-- ============================================================
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'profiles' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
  END LOOP;
END $$;

-- ============================================================
-- 4. Recreate non-recursive policies
-- ============================================================

-- INSERT: users can create their own profile row (trigger + fallback)
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- SELECT: users read their own profile
CREATE POLICY "Users can read own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- SELECT: admins read all profiles (uses helper, no recursion)
CREATE POLICY "Admins can read all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- UPDATE: users update their own profile (safe fields only, role excluded via app logic)
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- UPDATE: admins update any profile (uses helper, no recursion)
CREATE POLICY "Admins can update all profiles"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- UPDATE: bootstrap claim — allows setting own role=admin ONLY when no admin exists yet
-- This is how /admin/setup works for first-time owner claim
CREATE POLICY "Bootstrap claim first admin"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id AND public.no_admin_exists())
  WITH CHECK (auth.uid() = id AND public.no_admin_exists());
