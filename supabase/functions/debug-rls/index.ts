import { createClient } from 'npm:@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    // Create client with user's token
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Get the authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Authentication failed', details: userError }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const debugInfo: any = {
      timestamp: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        aud: user.aud,
      },
      tests: {},
    };

    // Test 1: Check if we can query user_profiles
    console.log('🔍 Test 1: Attempting to query user_profiles for user:', user.id);
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    debugInfo.tests.query_own_profile = {
      success: !profileError,
      error: profileError ? {
        code: profileError.code,
        message: profileError.message,
        details: profileError.details,
        hint: profileError.hint,
      } : null,
      hasData: !!profile,
      profileData: profile ? {
        id: profile.id,
        email: profile.email,
        app_role: profile.app_role,
      } : null,
    };

    // Test 2: Try to insert if not exists (will fail if INSERT policy blocks)
    if (!profile) {
      console.log('⚠️ Test 2: Profile does not exist, attempting to insert...');
      const { data: newProfile, error: insertError } = await supabase
        .from('user_profiles')
        .insert({
          id: user.id,
          email: user.email || '',
          full_name: user.email || '',
          app_role: 'user',
        })
        .select()
        .maybeSingle();

      debugInfo.tests.insert_profile = {
        success: !insertError,
        error: insertError ? {
          code: insertError.code,
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint,
        } : null,
        created: !!newProfile,
      };
    } else {
      debugInfo.tests.insert_profile = {
        skipped: true,
        reason: 'Profile already exists',
      };
    }

    // Test 3: Check RLS policies using service role
    const supabaseServiceRole = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    console.log('🔍 Test 3: Checking RLS configuration with service role...');
    const { data: rlsInfo, error: rlsError } = await supabaseServiceRole.rpc(
      'debug_user_profile_access',
      { target_user_id: user.id }
    );

    debugInfo.tests.rls_configuration = {
      success: !rlsError,
      error: rlsError ? {
        code: rlsError.code,
        message: rlsError.message,
      } : null,
      checks: rlsInfo || [],
    };

    // Test 4: List all policies
    console.log('🔍 Test 4: Listing all RLS policies...');
    const { data: policies, error: policiesError } = await supabaseServiceRole
      .from('pg_policies')
      .select('policyname, cmd, qual, with_check')
      .eq('tablename', 'user_profiles');

    debugInfo.tests.policies = {
      success: !policiesError,
      error: policiesError,
      count: policies?.length || 0,
      policies: policies || [],
    };

    // Summary
    debugInfo.summary = {
      can_read_own_profile: debugInfo.tests.query_own_profile.success && debugInfo.tests.query_own_profile.hasData,
      profile_exists: !!debugInfo.tests.query_own_profile.hasData,
      rls_enabled: true, // We know it's enabled from earlier check
      policy_count: debugInfo.tests.policies.count,
    };

    console.log('✅ Debug complete:', JSON.stringify(debugInfo, null, 2));

    return new Response(
      JSON.stringify(debugInfo, null, 2),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('❌ Error in debug-rls function:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});