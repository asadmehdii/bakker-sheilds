/*
  # Fix Missing Auth Trigger
  
  1. Problem
    - The trigger on auth.users to auto-create user profiles is missing
    - This causes 500 errors during signup
  
  2. Solution
    - Recreate the trigger that auto-creates user profiles
    - Use SECURITY DEFINER to bypass RLS
    - Add error handling to prevent signup failures
  
  3. Security
    - Function runs with elevated privileges to bypass RLS
    - Only triggers on new user creation
    - Cannot be called directly by users
*/

-- Ensure the function exists with proper permissions
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert the user profile with RLS bypassed via SECURITY DEFINER
  INSERT INTO public.user_profiles (id, email, full_name, app_role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, 'User'),
    'coach'
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
EXCEPTION WHEN others THEN
  -- Log error but don't block user creation
  RAISE WARNING 'Failed to create user profile for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop the trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Grant execute permission to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres;
