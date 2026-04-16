import { createClient } from '@supabase/supabase-js';

// Create admin client with service role key (bypasses RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  try {
    const { email, fullName } = await req.json();

    if (!email) {
      return Response.json({ error: 'Email is required' }, { status: 400 });
    }

    // Check if user already exists
    const { data: existingUser, error: selectError } = await supabaseAdmin
      .from('app_users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      // User already exists, return it
      const { data: fullUser } = await supabaseAdmin
        .from('app_users')
        .select('*')
        .eq('id', existingUser.id)
        .single();
      
      return Response.json(fullUser);
    }

    // Create auth user first (this will create the user in auth.users)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: Math.random().toString(36).slice(-12), // Random password
      email_confirm: true, // Skip email confirmation for test users
      user_metadata: {
        full_name: fullName || email.split('@')[0],
        role: 'admin'
      }
    });

    if (authError) {
      // If user already exists in auth, try to get them
      if (authError.message.includes('already exists')) {
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
        const existingAuthUser = users.find(u => u.email === email);
        
        if (existingAuthUser) {
          // Create app_users record for existing auth user
          const { data: appUser, error: insertError } = await supabaseAdmin
            .from('app_users')
            .insert([{
              id: existingAuthUser.id,
              email: email,
              full_name: fullName || email.split('@')[0],
              role: 'admin'
            }])
            .select()
            .single();

          if (insertError && !insertError.message.includes('duplicate')) {
            throw insertError;
          }

          if (appUser) {
            return Response.json(appUser);
          }
          
          // If insert failed due to duplicate, fetch existing
          const { data: existing } = await supabaseAdmin
            .from('app_users')
            .select('*')
            .eq('id', existingAuthUser.id)
            .single();
          
          return Response.json(existing);
        }
      }
      throw authError;
    }

    // Now create app_users record with the auth user's ID
    const { data: appUser, error: insertError } = await supabaseAdmin
      .from('app_users')
      .insert([{
        id: authData.user.id,
        email: email,
        full_name: fullName || email.split('@')[0],
        role: 'admin'
      }])
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    return Response.json(appUser);
  } catch (error) {
    console.error('API error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

