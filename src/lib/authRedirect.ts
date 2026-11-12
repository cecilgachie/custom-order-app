import * as Linking from "expo-linking";

/**
 * Where the links in our emails (confirm sign-up, staff invitations, password
 * resets) send people back to. It adapts to where the app is running:
 *   web (dev)          http://localhost:8081/auth-callback
 *   Expo Go            exp://192.168.x.x:8081/--/auth-callback
 *   installed app      vaticancakeapp://auth-callback
 *
 * Every one of these must be listed under Supabase > Authentication >
 * URL Configuration > Redirect URLs, or Supabase ignores it and falls back
 * to the Site URL (which is how links ended up on localhost:3000).
 */
export const authCallbackUrl = () => Linking.createURL("auth-callback");