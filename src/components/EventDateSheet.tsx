import { ChevronLeft, ChevronRight, Minus, Plus, X } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Colors } from "../constants/Colors";
import { supabase } from "../lib/supabase";

const LEAD_DAYS = 2; // earliest bookable date is today + 2 days (the payment function enforces it too)
const MAX_GUESTS = 2000;
const SHEET_HEIGHT = Math.min(660, Math.round(Dimensions.get("window").height * 0.86));

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const pad = (n: number) => String(n).padStart(2, "0");
// Built from local parts: toISOString() shifts the day at Nairobi's UTC+3
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const parseISO = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const formatLong = (d: Date) => `${WEEKDAYS_LONG[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

type Item = { id: string | number; cake_title: string; event_date?: string | null; guest_count?: number | null };

type Props = {
  visible: boolean;
  item: Item | null;
  onClose: () => void;
  onSaved: (patch: { event_date: string; guest_count: number }) => void;
};

/**
 * Picks the event date and guest count for a cake that is already in the cart.
 * Errors are shown inside the sheet (a toast would sit behind it).
 */
export default function EventDateSheet({ visible, item, onClose, onSaved }: Props) {
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const [shown, setShown] = useState(false);

  // Keep showing the last cake while the sheet slides out
  const cached = useRef<Item | null>(null);
  if (item) cached.current = item;
  const view = item ?? cached.current;

  const minDate = useMemo(() => addDays(startOfDay(new Date()), LEAD_DAYS), [visible]);

  const [selected, setSelected] = useState<Date | null>(null);
  const [viewMonth, setViewMonth] = useState(new Date(minDate.getFullYear(), minDate.getMonth(), 1));
  const [guests, setGuests] = useState("10");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible && item) {
      const existing = item.event_date ? parseISO(item.event_date) : null;
      const usable = existing && existing >= minDate ? existing : null;
      const base = usable ?? minDate;
      setSelected(usable);
      setViewMonth(new Date(base.getFullYear(), base.getMonth(), 1));
      setGuests(String(item.guest_count || 10));
      setError(null);
      setShown(true);
      translateY.setValue(SHEET_HEIGHT);
      Animated.spring(translateY, { toValue: 0, damping: 22, stiffness: 180, mass: 0.9, useNativeDriver: true }).start();
    } else if (!visible && shown) {
      Animated.timing(translateY, { toValue: SHEET_HEIGHT, duration: 200, useNativeDriver: true }).start(() => setShown(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, item?.id]);

  const backdropOpacity = translateY.interpolate({ inputRange: [0, SHEET_HEIGHT], outputRange: [1, 0], extrapolate: "clamp" });

  const cells = useMemo(() => {
    const y = viewMonth.getFullYear();
    const m = viewMonth.getMonth();
    const offset = (new Date(y, m, 1).getDay() + 6) % 7; // Monday first
    const days = new Date(y, m + 1, 0).getDate();
    const list: (Date | null)[] = Array(offset).fill(null);
    for (let d = 1; d <= days; d++) list.push(new Date(y, m, d));
    return list;
  }, [viewMonth]);

  const canGoPrev =
    viewMonth.getFullYear() > minDate.getFullYear() ||
    (viewMonth.getFullYear() === minDate.getFullYear() && viewMonth.getMonth() > minDate.getMonth());
  const shiftMonth = (delta: number) => setViewMonth((p) => new Date(p.getFullYear(), p.getMonth() + delta, 1));

  const bumpGuests = (delta: number) => {
    const n = parseInt(guests, 10) || 0;
    setGuests(String(Math.min(MAX_GUESTS, Math.max(1, n + delta))));
    setError(null);
  };

  const close = () => {
    if (!saving) onClose();
  };

  const save = async () => {
    if (saving || !view) return;
    if (!selected) return setError("Choose the date you need the cake.");
    if (selected < minDate) return setError(`Cakes need at least ${LEAD_DAYS} days' notice. Pick ${formatLong(minDate)} or later.`);
    const n = parseInt(guests, 10);
    if (!Number.isInteger(n) || n < 1 || n > MAX_GUESTS) return setError(`Enter a guest count between 1 and ${MAX_GUESTS}.`);

    setError(null);
    setSaving(true);
    try {
      const iso = toISO(selected);
      // .select() returns the changed rows: security rules can reject an update WITHOUT an error
      const { data, error: updateError } = await supabase
        .from("cake_orders")
        .update({ event_date: iso, guest_count: n })
        .eq("id", view.id)
        .select("id");
      if (updateError) throw updateError;
      if (!data || data.length === 0) throw new Error("Could not save the date. Please try again.");
      onSaved({ event_date: iso, guest_count: n });
    } catch (e: any) {
      setError(e?.message || "Could not save the date. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={shown} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" />
        </Animated.View>

        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <View style={styles.header}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.title}>When do you need it?</Text>
              {!!view && (
                <Text style={styles.sub} numberOfLines={1}>
                  {view.cake_title}
                </Text>
              )}
            </View>
            <Pressable onPress={close} hitSlop={10} style={styles.closeBtn} accessibilityLabel="Close">
              <X size={18} color={Colors.ink} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
            <Text style={styles.chosen}>{selected ? formatLong(selected) : "No date chosen yet"}</Text>

            {/* Calendar */}
            <View style={styles.calHeader}>
              <Pressable onPress={() => shiftMonth(-1)} disabled={!canGoPrev} hitSlop={8} style={[styles.calNav, !canGoPrev && { opacity: 0.3 }]} accessibilityLabel="Previous month">
                <ChevronLeft size={18} color={Colors.ink} />
              </Pressable>
              <Text style={styles.calTitle}>
                {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
              </Text>
              <Pressable onPress={() => shiftMonth(1)} hitSlop={8} style={styles.calNav} accessibilityLabel="Next month">
                <ChevronRight size={18} color={Colors.ink} />
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {WEEKDAYS_SHORT.map((d) => (
                <Text key={d} style={styles.weekday}>
                  {d}
                </Text>
              ))}
            </View>

            <View style={styles.grid}>
              {cells.map((cell, i) => {
                if (!cell) return <View key={`pad-${i}`} style={styles.cell} />;
                const disabled = cell < minDate;
                const isSel = !!selected && toISO(cell) === toISO(selected);
                return (
                  <View key={toISO(cell)} style={styles.cell}>
                    <Pressable
                      disabled={disabled}
                      onPress={() => {
                        setSelected(cell);
                        setError(null);
                      }}
                      style={[styles.day, isSel && styles.daySelected]}
                      accessibilityRole="button"
                      accessibilityLabel={formatLong(cell)}
                      accessibilityState={{ disabled, selected: isSel }}
                    >
                      <Text style={[styles.dayText, disabled && { color: Colors.hairline }, isSel && { color: "#FFF", fontWeight: "700" }]}>{cell.getDate()}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
            <Text style={styles.note}>Earliest available date: {formatLong(minDate)}.</Text>

            {/* Guests */}
            <Text style={styles.label}>Number of guests</Text>
            <View style={styles.guestRow}>
              <Pressable onPress={() => bumpGuests(-1)} style={styles.stepBtn} accessibilityLabel="Fewer guests">
                <Minus size={18} color={Colors.ink} />
              </Pressable>
              <TextInput
                value={guests}
                onChangeText={(t) => {
                  setGuests(t.replace(/[^\d]/g, ""));
                  setError(null);
                }}
                keyboardType="number-pad"
                maxLength={4}
                style={styles.guestInput}
                textAlign="center"
              />
              <Pressable onPress={() => bumpGuests(1)} style={styles.stepBtn} accessibilityLabel="More guests">
                <Plus size={18} color={Colors.ink} />
              </Pressable>
            </View>
          </ScrollView>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <Pressable onPress={save} disabled={saving} style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.9 }, saving && { opacity: 0.7 }]} accessibilityRole="button">
            {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Save date</Text>}
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(20,12,8,0.55)" },
  sheet: { height: SHEET_HEIGHT, backgroundColor: Colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 28 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  title: { fontSize: 20, fontWeight: "700", color: Colors.ink, letterSpacing: -0.3 },
  sub: { fontSize: 13.5, color: Colors.inkSoft, marginTop: 2 },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.background, justifyContent: "center", alignItems: "center" },

  chosen: { fontSize: 15, fontWeight: "700", color: Colors.ink, backgroundColor: Colors.goldTint, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, marginBottom: 14 },

  calHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  calNav: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.background, justifyContent: "center", alignItems: "center" },
  calTitle: { fontSize: 15, fontWeight: "700", color: Colors.ink },
  weekRow: { flexDirection: "row", marginBottom: 4 },
  weekday: { width: "14.2857%", textAlign: "center", fontSize: 12, color: Colors.inkMuted },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: "14.2857%", height: 40, alignItems: "center", justifyContent: "center" },
  day: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  daySelected: { backgroundColor: Colors.ink },
  dayText: { fontSize: 14, color: Colors.ink },
  note: { fontSize: 12, color: Colors.inkSoft, textAlign: "center", marginTop: 8 },

  label: { fontSize: 14, fontWeight: "600", color: Colors.ink, marginTop: 18, marginBottom: 8 },
  guestRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.hairline, justifyContent: "center", alignItems: "center" },
  guestInput: { flex: 1, height: 46, borderRadius: 14, borderWidth: 1, borderColor: Colors.hairline, backgroundColor: Colors.background, fontSize: 18, fontWeight: "700", color: Colors.ink },

  error: { fontSize: 13, color: Colors.danger, marginTop: 8, lineHeight: 19 },
  saveBtn: { height: 54, borderRadius: 16, backgroundColor: Colors.ink, justifyContent: "center", alignItems: "center", marginTop: 12 },
  saveText: { color: "#FFF", fontWeight: "700", fontSize: 16 },
});