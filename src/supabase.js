import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.\n" +
    "Create a .env file in the app folder with those two lines, then restart npm run dev."
  );
}

// This is the PUBLIC key. It is meant to ship in the browser bundle.
// Row Level Security in the database is what protects your data,
// not the secrecy of this key. Never put the service role or secret
// key in here.
export const supabase = createClient(url, key);
