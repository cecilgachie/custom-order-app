import { supabase } from "./supabase";

export type SystemRole = "System_Admin" | "Staff_Admin" | "Customer" | string;

export const normalizeRole = (value?: string | null) =>
  (value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

export const isAdminRole = (value?: string | null) => {
  const key = normalizeRole(value);
  return key === "system_admin" || key === "staff_admin";
};

export const isSystemAdminRole = (value?: string | null) =>
  normalizeRole(value) === "system_admin";

export async function getCurrentUserRole() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("system_role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;
  return (data?.system_role || "Customer") as SystemRole;
}
