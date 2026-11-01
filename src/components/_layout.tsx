import { useEffect, useState } from "react";
import { Slot, useRouter, useSegments } from "expo-router";
import { supabase } from "../lib/supabase"; 
import { Session } from "@supabase/supabase-js";
// Ensure this path exactly matches where your context file is saved!
import { ToastProvider } from "../context/ToastContext"; 

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

      
    useEffect(() => {
  if (loading) return;

  // Checks if the user's active viewport segment path sits inside the auth tree
  const inAuthGroup = segments[0] === "(auth)";

  if (!session && !inAuthGroup) {
    router.replace("/(auth)/login");
  } else if (session && inAuthGroup) {
    router.replace("/(tabs)");
  }
}, [session, segments, loading]);




  if (loading) return null; 

  return (
    <ToastProvider>
      <Slot />
    </ToastProvider>
  );
}
