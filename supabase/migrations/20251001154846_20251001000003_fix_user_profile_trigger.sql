/*
  # Fix user profile creation trigger with better error handling
  
  1. Changes
    - Add exception handling to the trigger function
    - Log any errors that occur during profile creation
    - Ensure trigger doesn't block user signup even if profile creation fails
  
  2. Security
    - Function runs with SECURITY DEFINER to bypass RLS
    - Only creates profile if it doesn't exist
*/

-- Drop and recreate the function with better error handling
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Try to insert the user profile
  BEGIN
    INSERT INTO public.user_profiles (id, email, full_name, app_role)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, 'User'),
      'coach'
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN others THEN
    -- Log the error but don't block the user creation
    RAISE WARNING 'Failed to create user profile for %: %', NEW.id, SQLERRM;
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
