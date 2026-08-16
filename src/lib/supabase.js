import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
// The login page processes verification links deliberately, so verified users
// return to the login form rather than being sent straight into the portal.
export const supabase = url && key ? createClient(url, key, {
  auth: {
    detectSessionInUrl: false,
    // Keep this clinic's session separate from malformed or legacy Supabase
    // tokens previously stored on localhost during development.
    storageKey: 'bright-smile-dental-auth'
  }
}) : null;
