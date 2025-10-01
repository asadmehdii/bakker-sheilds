# RLS Debugging Guide

This document explains how to debug Row Level Security (RLS) issues in the CheckinAI application.

## Quick Start

When you load the application, two debug functions are automatically available in your browser console:

### 1. Quick Check
```javascript
quickCheckRLS()
```
Quickly verifies if RLS is working for your user profile.

**Output:**
- ✅ Success: "RLS is working - can read own profile"
- ❌ Failure: Error code and message
- ⚠️ Warning: "Not authenticated" or "No profile found"

### 2. Comprehensive Debug
```javascript
debugRLS()
```
Runs a comprehensive RLS debugging session with detailed checks.

**What it checks:**
1. **Authentication Status** - Verifies you're logged in
2. **Session Status** - Checks if your session is valid
3. **Query User Profile** - Tests if you can read your own profile
4. **Server-Side RLS Debug** - Runs server-side diagnostics

## Understanding RLS Policies

The `user_profiles` table has the following RLS policies:

### SELECT Policy
```sql
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);
```
**What it means:** Authenticated users can only SELECT their own profile where their `auth.uid()` matches the profile's `id`.

### INSERT Policy
```sql
CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);
```
**What it means:** Authenticated users can only INSERT a profile for themselves.

### UPDATE Policy
```sql
CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);
```
**What it means:** Authenticated users can only UPDATE their own profile.

### Service Role Policies
```sql
CREATE POLICY "Service role can manage all profiles"
  ON user_profiles FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```
**What it means:** The service role (backend functions) can do anything with any profile.

## Enhanced Logging

The application now includes comprehensive logging in the browser console:

### User Service Logs
When loading or updating profiles, you'll see detailed logs:

```
🔍 [User Service] getUserProfile() called
✅ [User Service] Authenticated user found: {...}
📋 [User Service] Session info: {...}
🔍 [User Service] Querying user_profiles table for user: ...
✅ [User Service] Retrieved existing user profile: {...}
```

### Error Codes
- **PGRST116**: No rows returned (profile doesn't exist)
- **PGRST301**: RLS policy violation (access denied)

## Common Issues & Solutions

### Issue: "RLS POLICY VIOLATION"
**Error Code:** PGRST301

**Cause:** The RLS policy is blocking your access.

**Solutions:**
1. Check that you're authenticated: `supabase.auth.getUser()`
2. Verify `auth.uid()` matches your user ID
3. Ensure the policy exists and is enabled
4. Check that the policy uses the `authenticated` role

### Issue: "No profile found"
**Error Code:** PGRST116

**Cause:** User profile doesn't exist in the database.

**Solutions:**
1. The application should auto-create profiles on first login
2. Check the trigger function `handle_new_user()`
3. Manually create a profile using the INSERT policy

### Issue: Session expired
**Symptoms:** Authentication works but queries fail

**Solutions:**
1. Refresh the page to get a new session
2. Sign out and sign back in
3. Check session expiry time

## Server-Side Debug Function

An Edge Function is available for server-side debugging:

```
POST https://[YOUR_PROJECT].supabase.co/functions/v1/debug-rls
Authorization: Bearer [YOUR_ACCESS_TOKEN]
```

This function:
- Tests reading your profile
- Attempts to create a profile if missing
- Checks RLS configuration
- Lists all policies

## Monitoring RLS in Supabase Dashboard

1. Go to **Database** → **Tables** → `user_profiles`
2. Click the **shield icon** to see RLS status
3. Click **View Policies** to see all policies
4. Use **Disable RLS** temporarily for testing (re-enable after!)

## Best Practices

1. **Always test RLS policies** after making database changes
2. **Use `maybeSingle()`** instead of `single()` for queries that might return zero rows
3. **Check authentication** before making queries
4. **Use service role carefully** - only in Edge Functions, never client-side
5. **Monitor console logs** during development for detailed diagnostics

## Quick Diagnostic Checklist

- [ ] User is authenticated (`auth.getUser()` returns user)
- [ ] Session is valid (not expired)
- [ ] Profile exists in `user_profiles` table
- [ ] RLS is enabled on `user_profiles` table
- [ ] Policies exist for SELECT, INSERT, UPDATE
- [ ] `auth.uid()` equals profile `id`
- [ ] All policies use `authenticated` role

## Need More Help?

Run `debugRLS()` in the console and share the output. It provides all the information needed to diagnose RLS issues.
