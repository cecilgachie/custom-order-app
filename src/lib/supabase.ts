import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import "react-native-url-polyfill/auto";

const supabaseStorage = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(key),
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Fail loudly early on if variables are completely missing during development
if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes("your-project")) {
  console.error(
    "⚠️ Supabase environment variables are missing! " +
    "Please check your .env file and restart your Expo server with: npx expo start --clear"
  );
}

export const isSupabaseConfigured =
  !!supabaseUrl &&
  !!supabaseAnonKey &&
  /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(supabaseUrl);

export const supabaseConfigError =
  "Supabase is not configured correctly. Set EXPO_PUBLIC_SUPABASE_URL to your full project URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to your public anon key.";

// Fallback to empty strings safely to prevent app crashing before the error log renders
export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "", {
  auth: {
    storage: supabaseStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
