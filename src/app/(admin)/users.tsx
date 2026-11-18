import { useFocusEffect } from "expo-router";
import { ShieldAlert, ShieldCheck, UserCheck, UserX } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import CreateStaffCard from "../../components/CreateStaffCard";
import { Colors } from "../../constants/Colors";
import { useAppToast } from "../../context/ToastContext";
import {
  getCurrentUserRole,
  isAdminRole,
  isSystemAdminRole,
  normalizeRole,
  type SystemRole,
} from "../../lib/adminAuth";
import { displayName } from "../../lib/displayName";
import { supabase } from "../../lib/supabase";

type RoleFilter = "All" | "System_Admin" | "Staff_Admin" | "Customer";

type ProfileRow = {
  id: string;
  full_name?: string | null;
  username?: string | null;
  system_role?: string | null;
  warning_flag?: boolean | null;
  warning_count?: number | null;
  is_suspended?: boolean | null;
  suspended_at?: string | null;
};

const FILTERS: RoleFilter[] = ["All", "System_Admin", "Staff_Admin", "Customer"];

const prettyRole = (value?: string | null) => (value || "Customer").replace(/_/g, " ");

export default function AdminUsersScreen() {
  const { showToast } = useAppToast();

  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [role, setRole] = useState<SystemRole>("Customer");
  const [myId, setMyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<RoleFilter>("All");

  const [warnModalUser, setWarnModalUser] = useState<ProfileRow | null>(null);
  const [warnNote, setWarnNote] = useState("");
  const [suspendModalUser, setSuspendModalUser] = useState<ProfileRow | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  // Toasts appear BEHIND a popup, so errors from the popups are shown inside them
  const [modalError, setModalError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      setLoading(!isRefresh);
      try {
        const currentRole = await getCurrentUserRole();
        if (!isAdminRole(currentRole)) {
          showToast("You are not allowed to access this section.", { type: "error" });
          setRows([]);
          return;
        }
        setRole(currentRole || "Customer");

        const {
          data: { user },
        } = await supabase.auth.getUser();
        setMyId(user?.id ?? null);

        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(500);

        if (error) throw error;
        setRows((data as ProfileRow[]) || []);
      } catch (e: any) {
        showToast(e?.message || "Could not load users.", { type: "error" });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [showToast],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const visibleRows = useMemo(() => {
    if (filter === "All") return rows;
    return rows.filter((r) => normalizeRole(r.system_role) === normalizeRole(filter));
  }, [rows, filter]);

  /** Runs an action. Errors go to `onFail` (used inside popups) or to a toast. */
  const runUserAction = async (userId: string, work: () => Promise<void>, onFail?: (message: string) => void) => {
    if (busyUserId) return;
    const fail = (message: string) => (onFail ? onFail(message) : showToast(message, { type: "error" }));

    if (!isAdminRole(role)) {
      fail("Only admins can run moderation actions.");
      return;
    }

    setBusyUserId(userId);
    try {
      await work();
      await load(true);
    } catch (e: any) {
      fail(e?.message || "Action failed.");
    } finally {
      setBusyUserId(null);
    }
  };

  const openWarn = (user: ProfileRow) => {
    setModalError(null);
    setWarnNote("");
    setWarnModalUser(user);
  };
  const openSuspend = (user: ProfileRow) => {
    setModalError(null);
    setSuspendReason("");
    setSuspendModalUser(user);
  };

  const warnUser = async () => {
    const target = warnModalUser;
    if (!target) return;
    setModalError(null);

    await runUserAction(
      target.id,
      async () => {
        const { error } = await supabase.rpc("admin_warn_user", {
          p_user_id: target.id,
          p_note: warnNote.trim() || null,
        });
        if (error) throw error;
        showToast("Warning logged for user.", { type: "success" });
        setWarnModalUser(null);
        setWarnNote("");
      },
      setModalError,
    );
  };

  const toggleSuspend = async (target: ProfileRow, fromPopup = false) => {
    if (fromPopup) setModalError(null);

    await runUserAction(
      target.id,
      async () => {
        const nextSuspension = !target.is_suspended;
        const { error } = await supabase.rpc("admin_set_user_suspension", {
          p_user_id: target.id,
          p_suspend: nextSuspension,
          p_reason: nextSuspension ? suspendReason.trim() || null : null,
        });
        if (error) throw error;

        showToast(nextSuspension ? "User suspended." : "User reactivated.", { type: "success" });
        setSuspendModalUser(null);
        setSuspendReason("");
      },
      fromPopup ? setModalError : undefined,
    );
  };

  const renderUser = ({ item }: { item: ProfileRow }) => {
    const busy = busyUserId === item.id;
    const suspended = Boolean(item.is_suspended);
    const warned = Boolean(item.warning_flag || (item.warning_count || 0) > 0);

    const isMe = item.id === myId;
    const targetIsStaff = item.system_role === "System_Admin" || item.system_role === "Staff_Admin";
    // Convenience only: the database functions must also enforce this (see the security review)
    const canModerate = !isMe && (!targetIsStaff || isSystemAdminRole(role));

    return (
      <View style={styles.userCard}>
        <View style={styles.userTopRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{displayName(item, "Unnamed account")}</Text>
            <Text style={styles.userMeta}>{item.username ? `@${item.username}` : item.id.slice(0, 8)}</Text>
          </View>
          <View style={[styles.roleBadge, suspended && styles.roleBadgeSuspended]}>
            <Text style={[styles.roleBadgeText, suspended && styles.roleBadgeTextSuspended]}>{prettyRole(item.system_role)}</Text>
          </View>
        </View>

        <View style={styles.flagRow}>
          {warned ? (
            <View style={styles.flagChipWarn}>
              <ShieldAlert size={12} color="#A66A00" />
              <Text style={styles.flagChipWarnText}>Warned ({item.warning_count || 1})</Text>
            </View>
          ) : (
            <View style={styles.flagChipOk}>
              <ShieldCheck size={12} color={Colors.successGreen} />
              <Text style={styles.flagChipOkText}>Clean</Text>
            </View>
          )}

          {suspended ? (
            <View style={styles.flagChipSuspended}>
              <UserX size={12} color={Colors.danger} />
              <Text style={styles.flagChipSuspendedText}>Suspended</Text>
            </View>
          ) : (
            <View style={styles.flagChipOk}>
              <UserCheck size={12} color={Colors.successGreen} />
              <Text style={styles.flagChipOkText}>Active</Text>
            </View>
          )}
        </View>

        {canModerate ? (
          <View style={styles.actionsRow}>
            <Pressable style={[styles.actionBtn, busy && styles.btnDisabled]} onPress={() => openWarn(item)} disabled={busy}>
              <Text style={styles.actionBtnText}>Warn user</Text>
            </Pressable>

            <Pressable
              style={[styles.actionBtn, suspended ? styles.actionBtnSuccess : styles.actionBtnDanger, busy && styles.btnDisabled]}
              onPress={() => {
                if (suspended) {
                  void toggleSuspend(item);
                  return;
                }
                openSuspend(item);
              }}
              disabled={busy}
            >
              {busy ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.actionBtnText}>{suspended ? "Unsuspend" : "Suspend"}</Text>}
            </Pressable>
          </View>
        ) : (
          <Text style={styles.noActions}>{isMe ? "This is your account." : "Staff account. Only a System Admin can moderate staff."}</Text>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.gold} />
        <Text style={styles.loadingText}>Loading user ledger...</Text>
      </View>
    );
  }

  const warnBusy = !!warnModalUser && busyUserId === warnModalUser.id;
  const suspendBusy = !!suspendModalUser && busyUserId === suspendModalUser.id;

  return (
    <View style={styles.container}>
      <FlatList
        data={visibleRows}
        keyExtractor={(item) => item.id}
        renderItem={renderUser}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={Colors.gold} colors={[Colors.gold]} />
        }
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <Text style={styles.title}>User Management</Text>
            <Text style={styles.subtitle}>Moderation controls and role-based account review</Text>

            <FlatList
              horizontal
              data={FILTERS}
              keyExtractor={(f) => f}
              contentContainerStyle={styles.filterRow}
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => {
                const active = item === filter;
                return (
                  <Pressable onPress={() => setFilter(item)} style={[styles.filterChip, active && styles.filterChipActive]}>
                    <Text style={[styles.filterText, active && styles.filterTextActive]}>{prettyRole(item === "All" ? "All" : item)}</Text>
                  </Pressable>
                );
              }}
            />

            {isSystemAdminRole(role) ? <CreateStaffCard onCreated={() => void load(true)} /> : null}
          </View>
        }
        contentContainerStyle={styles.content}
        ListEmptyComponent={<Text style={styles.empty}>No users in this filter.</Text>}
      />

      {/* Warn */}
      <Modal transparent visible={Boolean(warnModalUser)} animationType="fade" onRequestClose={() => setWarnModalUser(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Warn user</Text>
            <TextInput
              value={warnNote}
              onChangeText={setWarnNote}
              placeholder="Warning note (optional)"
              placeholderTextColor={Colors.inkMuted}
              style={styles.input}
              editable={!warnBusy}
            />
            {!!modalError && <Text style={styles.modalError}>{modalError}</Text>}
            <View style={styles.modalActions}>
              <Pressable style={styles.modalBtnGhost} onPress={() => setWarnModalUser(null)} disabled={warnBusy}>
                <Text style={styles.modalGhostText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtnPrimary, warnBusy && styles.btnDisabled]} onPress={warnUser} disabled={warnBusy}>
                {warnBusy ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.modalPrimaryText}>Confirm warning</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Suspend */}
      <Modal transparent visible={Boolean(suspendModalUser)} animationType="fade" onRequestClose={() => setSuspendModalUser(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Suspend user</Text>
            <TextInput
              value={suspendReason}
              onChangeText={setSuspendReason}
              placeholder="Suspension reason (optional)"
              placeholderTextColor={Colors.inkMuted}
              style={styles.input}
              editable={!suspendBusy}
            />
            {!!modalError && <Text style={styles.modalError}>{modalError}</Text>}
            <View style={styles.modalActions}>
              <Pressable style={styles.modalBtnGhost} onPress={() => setSuspendModalUser(null)} disabled={suspendBusy}>
                <Text style={styles.modalGhostText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtnPrimary, { backgroundColor: Colors.danger }, suspendBusy && styles.btnDisabled]}
                onPress={() => {
                  if (suspendModalUser) void toggleSuspend(suspendModalUser, true);
                }}
                disabled={suspendBusy}
              >
                {suspendBusy ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.modalPrimaryText}>Confirm suspend</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, paddingBottom: 36 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.background },
  loadingText: { marginTop: 10, color: Colors.inkSoft, fontSize: 14 },

  headerWrap: { marginBottom: 14 },
  title: { fontSize: 22, fontWeight: "700", color: Colors.ink },
  subtitle: { fontSize: 13, color: Colors.inkSoft, marginTop: 3 },

  filterRow: { gap: 8, paddingTop: 12, paddingBottom: 8 },
  filterChip: {
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 14,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.hairline,
    backgroundColor: Colors.surface,
  },
  filterChipActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  filterText: { color: Colors.inkSoft, fontWeight: "600", fontSize: 12.5 },
  filterTextActive: { color: Colors.gold },

  input: {
    marginTop: 10,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.hairline,
    backgroundColor: Colors.background,
    paddingHorizontal: 12,
    color: Colors.ink,
    fontSize: 14,
  },

  userCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.hairline,
    padding: 12,
    marginBottom: 10,
  },
  userTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  userName: { fontSize: 15, fontWeight: "700", color: Colors.ink },
  userMeta: { marginTop: 2, fontSize: 12.5, color: Colors.inkSoft },
  roleBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: Colors.goldTint },
  roleBadgeText: { fontSize: 11.5, fontWeight: "700", color: Colors.gold },
  roleBadgeSuspended: { backgroundColor: Colors.dangerTint },
  roleBadgeTextSuspended: { color: Colors.danger },

  flagRow: { marginTop: 10, flexDirection: "row", gap: 8 },
  flagChipWarn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#FFF4E0", borderRadius: 999, paddingHorizontal: 10, height: 26 },
  flagChipWarnText: { fontSize: 11.5, fontWeight: "600", color: "#A66A00" },
  flagChipOk: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: Colors.successTint, borderRadius: 999, paddingHorizontal: 10, height: 26 },
  flagChipOkText: { fontSize: 11.5, fontWeight: "600", color: Colors.successGreen },
  flagChipSuspended: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: Colors.dangerTint, borderRadius: 999, paddingHorizontal: 10, height: 26 },
  flagChipSuspendedText: { fontSize: 11.5, fontWeight: "600", color: Colors.danger },

  actionsRow: { marginTop: 12, flexDirection: "row", gap: 8 },
  actionBtn: { flex: 1, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: Colors.ink },
  actionBtnText: { color: "#FFF", fontSize: 12.5, fontWeight: "700" },
  actionBtnDanger: { backgroundColor: Colors.danger },
  actionBtnSuccess: { backgroundColor: Colors.successGreen },
  btnDisabled: { opacity: 0.6 },
  noActions: { marginTop: 12, fontSize: 12.5, color: Colors.inkMuted },

  empty: { textAlign: "center", color: Colors.inkSoft, marginTop: 24 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.hairline, padding: 14 },
  modalTitle: { fontSize: 16, fontWeight: "700", color: Colors.ink },
  modalError: { fontSize: 13, color: Colors.danger, marginTop: 10, lineHeight: 19 },
  modalActions: { marginTop: 12, flexDirection: "row", gap: 8 },
  modalBtnGhost: { flex: 1, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.hairline },
  modalGhostText: { color: Colors.inkSoft, fontWeight: "600", fontSize: 13 },
  modalBtnPrimary: { flex: 1, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: Colors.ink },
  modalPrimaryText: { color: "#FFF", fontWeight: "700", fontSize: 13 },
});