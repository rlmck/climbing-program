import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copy .env.example to .env and fill them in.',
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    // HashRouter on GitHub Pages: implicit flow keeps auth tokens in the hash,
    // which survives the Pages subpath without a server-side redirect handler.
    flowType: 'implicit',
    persistSession: true,
    autoRefreshToken: true,
  },
});
