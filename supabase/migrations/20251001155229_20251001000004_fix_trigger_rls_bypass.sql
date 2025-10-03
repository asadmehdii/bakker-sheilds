/*
  # Fix trigger to properly bypass RLS when creating user profiles
  
  1. Changes
    - Grant the trigger function proper permissions to bypass RLS
    - Use SET statement to ensure RLS is bypassed
    - Ensure the function can insert into user_profiles regardless of RLS policies
  
  2. Security
    - Function runs as postgres user to bypass RLS
    - Only creates profiles for newly registered users
    - Cannot be called directly by users
*/

-- Drop the existing trigger first
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Recreate the function with explicit RLS bypass
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

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Grant execute permission to the service role
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
