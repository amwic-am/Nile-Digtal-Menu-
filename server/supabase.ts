import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required for staff authentication.');
}
const configuredUrl = url;

export const supabaseAuth = createClient(configuredUrl, anonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for staff account administration.');
  }

  if (!adminClient) {
    adminClient = createClient(configuredUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }
  return adminClient;
}

export async function findAuthUser(email: string, staffId?: number, authUserId?: string): Promise<User | null> {
  const client = getSupabaseAdmin();
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((candidate) =>
      candidate.email?.toLowerCase() === email.toLowerCase()
      || (staffId !== undefined && String(candidate.user_metadata?.staff_id) === String(staffId))
      || (authUserId !== undefined && candidate.id === authUserId));
    if (user) return user;
    if (data.users.length < 1000) return null;
  }
  throw new Error('Could not locate the Supabase Auth user after 100 pages.');
}
