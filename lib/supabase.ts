import "react-native-url-polyfill/auto";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// With no backend configured the whole app runs against lib/mock.ts.
export const DEMO = !SUPABASE_URL || !SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null = DEMO
  ? null
  : createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: {
        // Not expo-secure-store: it caps values at 2048 bytes and a Supabase
        // session is larger, so the session wouldn't reliably persist.
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
