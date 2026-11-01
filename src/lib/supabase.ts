import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config, isBackendConfigured } from './config';

export const supabase: SupabaseClient | null = isBackendConfigured
  ? createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
    })
  : null;
