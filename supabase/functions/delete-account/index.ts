// Deletes the authenticated caller's account and all their data.
//
// The anon client can't remove an auth user, so this runs with the service-role key
// (auto-injected by Supabase). `public.users.id → auth.users(id)` cascades, so deleting
// the Auth user removes all app data in the same database operation.
//
// Storage is the exception: an object in the `avatars` bucket is not a row and cascades from
// nothing, so the caller's own folder there is emptied by hand first. It is best-effort — a
// stranded image in a bucket nobody can read (the policies key on a uid that will never be
// issued again) must not be the reason an account deletion fails.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing authorization header' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Resolve the caller from their JWT.
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: authError,
  } = await caller.auth.getUser();
  if (authError || !user) return json({ error: 'Invalid or expired session' }, 401);

  const admin = createClient(supabaseUrl, serviceKey);

  // The account photo, which lives under `<uid>/` in the private `avatars` bucket.
  try {
    const { data: files } = await admin.storage.from('avatars').list(user.id);
    const paths = (files ?? []).map((file: { name: string }) => `${user.id}/${file.name}`);
    if (paths.length > 0) await admin.storage.from('avatars').remove(paths);
  } catch {
    // See the note at the top: never block the deletion on this.
  }

  // The public user and all owned app data cascade from this single Auth deletion.
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) return json({ error: deleteError.message }, 500);

  return json({ success: true });
});
