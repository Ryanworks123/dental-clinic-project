import { createClient } from '@supabase/supabase-js';
import { config, missingServerConfig } from './config.js';

export const supabase = missingServerConfig.length
  ? null
  : createClient(config.supabaseUrl, config.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
