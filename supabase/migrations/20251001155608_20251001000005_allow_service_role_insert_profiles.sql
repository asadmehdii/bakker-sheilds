/*
  # Allow service role to insert user profiles
  
  1. Changes
    - Add RLS policy to allow service_role to insert profiles
    - This enables the trigger function to create profiles during signup
  
  2. Security
    - Only service_role (used by triggers and backend functions) can insert
    - Regular users still need auth.uid() = id to insert their own profile
    - Maintains security while allowing automated profile creation
*/

-- Add policy for service_role to insert profiles
CREATE POLICY "Service role can insert profiles"
  ON public.user_profiles
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Add policy for service_role to bypass all operations (needed for trigger)
CREATE POLICY "Service role can manage all profiles"
  ON public.user_profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
