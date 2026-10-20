import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const publishableKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  ''
).trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && publishableKey);
// Used to namespace local caches so switching Supabase projects never shows another project's catalogue.
export const supabaseProjectKey = supabaseUrl.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();

// The browser may use only the Supabase publishable/anon key. Never place a
// service_role or other secret key in a VITE_ environment variable.
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
  : null;

export async function getAccountRole(user) {
  if (!supabase || !user?.id) return { role: 'guest', error: null };

  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return { role: 'user', error };
  return { role: data?.role === 'admin' ? 'admin' : 'user', error: null };
}
