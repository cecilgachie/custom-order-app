import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Calendar as CalendarIcon,
  Cake,
  Check,
  ChevronLeft,
  ChevronRight,
  Layers,
  Minus,
  Palette,
  Plus,
  Scale,
  ShoppingBag,
  Type,
  Users,
} from "lucide-react-native";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../../constants/Colors";
import { MAX_WEIGHT_KG, MIN_WEIGHT_KG, PRICE_PER_KG, SIZE_MULTIPLIERS, WEIGHT_STEP } from "../../constants/pricing";
import { useAppToast } from "../../context/ToastContext";
import { supabase } from "../../lib/supabase";

/* ------------------------------------------------------------------ */
/* Tokens + business rules                                             */
/* ------------------------------------------------------------------ */
const theme = {
  background: Colors.background,
  surface: Colors.surface,
  ink: Colors.ink,
  inkSoft: Colors.inkSoft,
  inkMuted: Colors.inkMuted,
  gold: Colors.gold,
  goldTint: Colors.goldTint,
  hairline: Colors.hairline,
  success: Colors.successGreen,
  successTint: Colors.successTint,
  danger: Colors.danger,
  dangerTint: Colors.dangerTint,
  dangerBorder: Colors.dangerBorder,
};

type CakeSize = "Small" | "Medium" | "Large";

// Prices and weights come from constants/pricing.ts (1,000 per kg, 0.5 kg minimum)
const SERVINGS_PER_KG = 8;
const LEAD_DAYS = 2; // earliest bookable date is today + 2 days
const MAX_INSCRIPTION = 45;

const FLAVOR_OPTIONS = ["Vanilla", "Chocolate", "Red Velvet", "Strawberry", "Lemon", "Marble"];
const COLOR_OPTIONS = [
  { name: "Standard White", hex: "#FFFFFF" },
  { name: "Blush Pink", hex: "#F4C6D0" },
  { name: "Gold", hex: "#C9A45C" },
  { name: "Chocolate Brown", hex: "#4A2C1D" },
  { name: "Sky Blue", hex: "#BFD9EE" },
  { name: "Sage Green", hex: "#B7C9A8" },
];

/* ------------------------------------------------------------------ */
/* Date helpers (built from local parts, never toISOString, which      */
/* shifts the day in UTC+3)                                            */
/* ------------------------------------------------------------------ */
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const pad = (n: number) => String(n).padStart(2, "0");
const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const formatLongDate = (d: Date) =>
  `${WEEKDAYS_LONG[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

const formatKes = (n: number) => `KES ${Math.round(n).toLocaleString()}`;

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */
// Save as src/app/(tabs)/customize.tsx (the Customize tab)
export default function CustomizeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showToast } = useAppToast();
  const params = useLocalSearchParams();

  // Route params (can arrive as string or string[])
  const readParam = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const baseTitle = readParam(params.title) || "Custom Celebration Cake";
  const defaultFlavor = readParam(params.flavor) || "Vanilla";
  const parsedWeight = parseFloat(readParam(params.weight) || String(MIN_WEIGHT_KG));
  const defaultWeight = Number.isFinite(parsedWeight)
    ? Math.min(MAX_WEIGHT_KG, Math.max(MIN_WEIGHT_KG, parsedWeight))
    : MIN_WEIGHT_KG;

  const minDate = useMemo(() => addDays(startOfDay(new Date()), LEAD_DAYS), []);

  const [selectedSize, setSelectedSize] = useState<CakeSize>("Medium");
  const [cakeWeight, setCakeWeight] = useState(defaultWeight);
  const [flavor, setFlavor] = useState(defaultFlavor);
  const [colorTheme, setColorTheme] = useState("Standard White");
  const [frostingMessage, setFrostingMessage] = useState("");
  const [designNotes, setDesignNotes] = useState("");
  const [eventDate, setEventDate] = useState<Date | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(new Date(minDate.getFullYear(), minDate.getMonth(), 1));
  const [guestCount, setGuestCount] = useState("15");
  const [errors, setErrors] = useState<{ date?: string; guests?: string; flavor?: string }>({});
  const [saving, setSaving] = useState(false);

  const hasCake = !!readParam(params.title);

  const resetForm = () => {
    setSelectedSize("Medium");
    setCakeWeight(defaultWeight);
    setFlavor(defaultFlavor);
    setColorTheme("Standard White");
    setFrostingMessage("");
    setDesignNotes("");
    setEventDate(null);
    setCalendarOpen(false);
    setGuestCount("15");
    setErrors({});
  };

  // This screen is a tab, so it stays alive between visits. When a different cake is
  // chosen on Home, start the form again for that cake.
  const cakeKey = `${readParam(params.id) ?? ""}|${baseTitle}|${defaultFlavor}|${defaultWeight}`;
  useEffect(() => {
    resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cakeKey]);

  /* ---------- pricing ---------- */
  const multiplier = SIZE_MULTIPLIERS[selectedSize];
  const basePrice = Math.round(cakeWeight * PRICE_PER_KG);
  const calculatedTotalPrice = Math.round(cakeWeight * PRICE_PER_KG * multiplier);
  const sizeAdjustment = calculatedTotalPrice - basePrice;
  const servings = Math.round(cakeWeight * SERVINGS_PER_KG);

  const adjustWeight = (action: "plus" | "minus") => {
    setCakeWeight((prev) => {
      const next = action === "plus" ? prev + WEIGHT_STEP : prev - WEIGHT_STEP;
      return Math.min(MAX_WEIGHT_KG, Math.max(MIN_WEIGHT_KG, next));
    });
  };

  /* ---------- calendar ---------- */
  const monthCells = useMemo(() => {
    const y = viewMonth.getFullYear();
    const m = viewMonth.getMonth();
    const offset = (new Date(y, m, 1).getDay() + 6) % 7; // Monday first
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells: (Date | null)[] = Array(offset).fill(null);
    for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(y, m, day));
    return cells;
  }, [viewMonth]);

  const canGoPrev =
    viewMonth.getFullYear() > minDate.getFullYear() ||
    (viewMonth.getFullYear() === minDate.getFullYear() && viewMonth.getMonth() > minDate.getMonth());

  const shiftMonth = (delta: number) =>
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));

  const pickDate = (d: Date) => {
    setEventDate(d);
    setErrors((e) => ({ ...e, date: undefined }));
    setCalendarOpen(false);
  };

  /* ---------- submit ---------- */
  const handleAddToCartLedger = async () => {
    if (saving) return;

    const nextErrors: typeof errors = {};
    if (!eventDate) nextErrors.date = "Choose the date you need the cake.";
    else if (eventDate < minDate)
      nextErrors.date = `Cakes need at least ${LEAD_DAYS} days to prepare. Pick ${formatLongDate(minDate)} or later.`;

    const guests = parseInt(guestCount, 10);
    if (!Number.isInteger(guests) || guests < 1 || guests > 2000)
      nextErrors.guests = "Enter a guest count between 1 and 2000.";

    if (!flavor.trim()) nextErrors.flavor = "Choose or type a flavor.";

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      if (nextErrors.date) setCalendarOpen(true);
      showToast(Object.values(nextErrors)[0] as string);
      return;
    }
    setErrors({});

    try {
      setSaving(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        showToast("Session expired. Please log back in.");
        router.replace("/(auth)/login");
        return;
      }

      // Payload for public.cake_orders (column names unchanged)
      const orderPayload = {
        user_id: user.id,
        cake_title: baseTitle,
        flavor: flavor.trim(),
        guest_count: guests,
        cake_size: selectedSize,
        cake_message: frostingMessage.trim() || null,
        custom_color_theme: colorTheme.trim() || "Standard White",
        design_instructions: designNotes.trim() || null,
        event_date: toISODate(eventDate as Date),
        total_price: calculatedTotalPrice,
        total_weight_kg: cakeWeight,
        payment_type: "Full",
        payment_status: "Unpaid",
        order_status: "Pending Review",
      };

      const { error } = await supabase.from("cake_orders").insert([orderPayload]);
      if (error) throw error;

      showToast("Custom cake saved to your cart! 🎂");
      resetForm();
      router.setParams({ id: "", title: "", flavor: "", weight: "" }); // the next visit starts blank
      router.replace("/(tabs)/cart");
    } catch (error: any) {
      showToast(error?.message || "Failed to save your order. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const flavorChips = useMemo(() => {
    const exists = FLAVOR_OPTIONS.some((f) => f.toLowerCase() === defaultFlavor.toLowerCase());
    return exists ? FLAVOR_OPTIONS : [defaultFlavor, ...FLAVOR_OPTIONS];
  }, [defaultFlavor]);

  /* ---------- render ---------- */
  return (
    <KeyboardAvoidingView
      style={styles.mainWrapperContainer}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* HEADER */}
      <View style={[styles.headerBar, { height: 60 + insets.top, paddingTop: insets.top }]}>
        <Text style={styles.headerTitleText}>Customize your cake</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollLayout}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {/* INTRO */}
        <View style={styles.introCard}>
          <View style={styles.introIcon}>
            <Cake size={24} color={theme.gold} strokeWidth={1.6} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cakeHeadline} numberOfLines={2}>
              {baseTitle}
            </Text>
            <Text style={styles.cakeFlavorSubtitle}>{hasCake ? `Base recipe: ${defaultFlavor}` : "Design your own cake from scratch"}</Text>
          </View>
        </View>

        {/* SIZE */}
        <Text style={styles.sectionLabel}>Size</Text>
        <View style={styles.sizeSelectionRow}>
          {(["Small", "Medium", "Large"] as const).map((size) => {
            const isChosen = selectedSize === size;
            return (
              <Pressable
                key={size}
                style={[styles.sizeCardChip, isChosen && styles.activeSizeCardChip]}
                onPress={() => setSelectedSize(size)}
                accessibilityRole="button"
                accessibilityState={{ selected: isChosen }}
              >
                <Layers size={18} color={isChosen ? theme.gold : theme.inkSoft} strokeWidth={1.75} />
                <Text style={[styles.sizeChipText, isChosen && styles.activeSizeChipText]}>{size}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* WEIGHT */}
        <Text style={styles.sectionLabel}>Weight</Text>
        <View style={styles.stepperControlContainer}>
          <View style={styles.stepperIcon}>
            <Scale size={18} color={theme.gold} strokeWidth={1.75} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.weightDisplayIndicator}>{cakeWeight.toFixed(1)} kg</Text>
            <Text style={styles.weightHint}>Serves about {servings}</Text>
          </View>
          <View style={styles.stepperButtonTray}>
            <Pressable
              style={({ pressed }) => [styles.stepBtn, pressed && styles.stepBtnPressed, cakeWeight <= MIN_WEIGHT_KG && { opacity: 0.35 }]}
              onPress={() => adjustWeight("minus")}
              disabled={cakeWeight <= MIN_WEIGHT_KG}
              accessibilityLabel="Decrease weight"
            >
              <Minus size={18} color={theme.ink} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.stepBtn, pressed && styles.stepBtnPressed, cakeWeight >= MAX_WEIGHT_KG && { opacity: 0.35 }]}
              onPress={() => adjustWeight("plus")}
              disabled={cakeWeight >= MAX_WEIGHT_KG}
              accessibilityLabel="Increase weight"
            >
              <Plus size={18} color={theme.ink} />
            </Pressable>
          </View>
        </View>

        {/* FLAVOR */}
        <Text style={styles.sectionLabel}>Flavor</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} keyboardShouldPersistTaps="handled">
          {flavorChips.map((f) => {
            const active = flavor.trim().toLowerCase() === f.toLowerCase();
            return (
              <Pressable
                key={f}
                onPress={() => {
                  setFlavor(f);
                  setErrors((e) => ({ ...e, flavor: undefined }));
                }}
                style={[styles.optionChip, active && styles.optionChipActive]}
              >
                <Text style={[styles.optionChipText, active && styles.optionChipTextActive]}>{f}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={[styles.inputCard, !!errors.flavor && styles.inputCardError]}>
          <View style={[styles.formInputRow, styles.rowLast]}>
            <Cake size={16} color={theme.inkMuted} style={styles.formFieldIcon} />
            <TextInput
              style={styles.fieldTextInputElement}
              value={flavor}
              onChangeText={(t) => {
                setFlavor(t);
                if (errors.flavor) setErrors((e) => ({ ...e, flavor: undefined }));
              }}
              placeholder="Or type your own flavor"
              placeholderTextColor={theme.inkMuted}
            />
          </View>
        </View>
        {!!errors.flavor && <Text style={styles.errorText}>{errors.flavor}</Text>}

        {/* COLOR */}
        <Text style={styles.sectionLabel}>Color theme</Text>
        <View style={styles.swatchRow}>
          {COLOR_OPTIONS.map((c) => {
            const active = colorTheme.trim().toLowerCase() === c.name.toLowerCase();
            return (
              <Pressable
                key={c.name}
                onPress={() => setColorTheme(c.name)}
                style={styles.swatchWrap}
                accessibilityRole="button"
                accessibilityLabel={c.name}
                accessibilityState={{ selected: active }}
              >
                <View style={[styles.swatchRing, active && styles.swatchRingActive]}>
                  <View style={[styles.swatch, { backgroundColor: c.hex }]}>
                    {active && <Check size={14} color={c.hex === "#4A2C1D" ? "#FFF" : theme.ink} strokeWidth={3} />}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.inputCard}>
          <View style={[styles.formInputRow, styles.rowLast]}>
            <Palette size={16} color={theme.inkMuted} style={styles.formFieldIcon} />
            <TextInput
              style={styles.fieldTextInputElement}
              value={colorTheme}
              onChangeText={setColorTheme}
              placeholder="Or describe your own palette"
              placeholderTextColor={theme.inkMuted}
            />
          </View>
        </View>

        {/* INSCRIPTION */}
        <Text style={styles.sectionLabel}>Inscription</Text>
        <View style={styles.inputCard}>
          <View style={[styles.formInputRow, styles.rowLast]}>
            <Type size={16} color={theme.inkMuted} style={styles.formFieldIcon} />
            <TextInput
              style={styles.fieldTextInputElement}
              value={frostingMessage}
              onChangeText={setFrostingMessage}
              placeholder="e.g. Happy Birthday Felix"
              placeholderTextColor={theme.inkMuted}
              maxLength={MAX_INSCRIPTION}
            />
            <Text style={styles.counter}>
              {frostingMessage.length}/{MAX_INSCRIPTION}
            </Text>
          </View>
        </View>

        {/* EVENT LOGISTICS */}
        <Text style={styles.sectionLabel}>Event details</Text>
        <View style={[styles.inputCard, !!errors.date && styles.inputCardError]}>
          <Pressable
            style={[styles.formInputRow, !calendarOpen && styles.rowLast]}
            onPress={() => setCalendarOpen((o) => !o)}
            accessibilityRole="button"
            accessibilityLabel="Choose event date"
          >
            <CalendarIcon size={16} color={theme.inkMuted} style={styles.formFieldIcon} />
            <Text style={[styles.dateText, !eventDate && { color: theme.inkMuted }]}>
              {eventDate ? formatLongDate(eventDate) : "Choose the date you need it"}
            </Text>
            <ChevronRight
              size={16}
              color={theme.inkMuted}
              style={{ transform: [{ rotate: calendarOpen ? "90deg" : "0deg" }] }}
            />
          </Pressable>

          {calendarOpen && (
            <View style={styles.calendar}>
              <View style={styles.calHeader}>
                <Pressable
                  onPress={() => shiftMonth(-1)}
                  disabled={!canGoPrev}
                  hitSlop={8}
                  style={[styles.calNav, !canGoPrev && { opacity: 0.3 }]}
                  accessibilityLabel="Previous month"
                >
                  <ChevronLeft size={18} color={theme.ink} />
                </Pressable>
                <Text style={styles.calTitle}>
                  {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
                </Text>
                <Pressable onPress={() => shiftMonth(1)} hitSlop={8} style={styles.calNav} accessibilityLabel="Next month">
                  <ChevronRight size={18} color={theme.ink} />
                </Pressable>
              </View>

              <View style={styles.calWeekRow}>
                {WEEKDAYS_SHORT.map((d) => (
                  <Text key={d} style={styles.calWeekday}>
                    {d}
                  </Text>
                ))}
              </View>

              <View style={styles.calGrid}>
                {monthCells.map((cell, i) => {
                  if (!cell) return <View key={`pad-${i}`} style={styles.calCell} />;
                  const disabled = cell < minDate;
                  const selected = !!eventDate && toISODate(cell) === toISODate(eventDate);
                  return (
                    <View key={toISODate(cell)} style={styles.calCell}>
                      <Pressable
                        disabled={disabled}
                        onPress={() => pickDate(cell)}
                        style={[styles.calDay, selected && styles.calDaySelected]}
                        accessibilityRole="button"
                        accessibilityLabel={formatLongDate(cell)}
                        accessibilityState={{ disabled, selected }}
                      >
                        <Text
                          style={[
                            styles.calDayText,
                            disabled && { color: theme.hairline },
                            selected && { color: "#FFF", fontWeight: "700" },
                          ]}
                        >
                          {cell.getDate()}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
              <Text style={styles.calNote}>Earliest available date is {formatLongDate(minDate)}.</Text>
            </View>
          )}

          <View style={[styles.formInputRow, styles.rowLast, styles.rowTopBorder]}>
            <Users size={16} color={theme.inkMuted} style={styles.formFieldIcon} />
            <TextInput
              style={styles.fieldTextInputElement}
              value={guestCount}
              onChangeText={(t) => {
                setGuestCount(t.replace(/[^\d]/g, ""));
                if (errors.guests) setErrors((e) => ({ ...e, guests: undefined }));
              }}
              placeholder="Estimated guests"
              placeholderTextColor={theme.inkMuted}
              keyboardType="number-pad"
              maxLength={4}
            />
            <Text style={styles.counter}>guests</Text>
          </View>
        </View>
        {!!errors.date && <Text style={styles.errorText}>{errors.date}</Text>}
        {!!errors.guests && <Text style={styles.errorText}>{errors.guests}</Text>}

        {/* NOTES */}
        <Text style={styles.sectionLabel}>Notes for the chef</Text>
        <TextInput
          style={styles.textAreaElement}
          value={designNotes}
          onChangeText={setDesignNotes}
          placeholder="Frosting patterns, layer details, allergies, or anything else we should know..."
          placeholderTextColor={theme.inkMuted}
          multiline
          numberOfLines={4}
        />

        {/* PRICE BREAKDOWN */}
        <View style={styles.breakdownCard}>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>
              {cakeWeight.toFixed(1)} kg at {formatKes(PRICE_PER_KG)}/kg
            </Text>
            <Text style={styles.breakdownValue}>{formatKes(basePrice)}</Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>{selectedSize} size adjustment</Text>
            <Text style={styles.breakdownValue}>
              {sizeAdjustment === 0 ? "None" : `${sizeAdjustment > 0 ? "+" : "-"}${formatKes(Math.abs(sizeAdjustment))}`}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* FOOTER */}
      <View style={styles.floatingActionFooter}>
        <View>
          <Text style={styles.footerPriceLabelText}>Estimated total</Text>
          <Text style={styles.footerPriceAmountText}>{formatKes(calculatedTotalPrice)}</Text>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.actionCommitBtn,
            pressed && { opacity: 0.9, transform: [{ scale: 0.985 }] },
            saving && { opacity: 0.75 },
          ]}
          onPress={handleAddToCartLedger}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Add to cart"
        >
          {saving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <ShoppingBag size={18} color={theme.gold} strokeWidth={1.9} />
              <Text style={styles.actionCommitBtnText}>Add to cart</Text>
            </>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */
const styles = StyleSheet.create({
  mainWrapperContainer: { flex: 1, backgroundColor: theme.background },

  headerBar: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, height: 60,
    backgroundColor: theme.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.hairline,
  },
  backBtn: { width: 38, height: 38, borderRadius: 19, justifyContent: "center", alignItems: "center", marginRight: 10 },
  headerTitleText: { fontSize: 18, fontWeight: "700", color: theme.ink, letterSpacing: -0.2 },

  scrollLayout: { padding: 18, paddingBottom: 130 },

  introCard: {
    flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: theme.surface, borderRadius: 18, padding: 16,
    borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline, marginBottom: 6,
    shadowColor: "#2A1B10", shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  introIcon: { width: 50, height: 50, borderRadius: 14, backgroundColor: theme.goldTint, justifyContent: "center", alignItems: "center" },
  cakeHeadline: { fontSize: 18, fontWeight: "700", color: theme.ink, letterSpacing: -0.2 },
  cakeFlavorSubtitle: { fontSize: 13, color: theme.inkSoft, marginTop: 3 },

  sectionLabel: { fontSize: 15, fontWeight: "700", color: theme.ink, marginLeft: 2, marginBottom: 10, marginTop: 22 },

  /* size */
  sizeSelectionRow: { flexDirection: "row", gap: 10 },
  sizeCardChip: {
    flex: 1, backgroundColor: theme.surface, borderRadius: 14, paddingVertical: 15, alignItems: "center", gap: 7,
    borderWidth: 1, borderColor: theme.hairline,
  },
  activeSizeCardChip: { backgroundColor: theme.ink, borderColor: theme.ink },
  sizeChipText: { fontSize: 13.5, fontWeight: "600", color: theme.inkSoft },
  activeSizeChipText: { color: "#FFF" },

  /* weight */
  stepperControlContainer: {
    flexDirection: "row", alignItems: "center", backgroundColor: theme.surface, padding: 14, borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline, gap: 12,
  },
  stepperIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.goldTint, justifyContent: "center", alignItems: "center" },
  weightDisplayIndicator: { fontSize: 18, fontWeight: "700", color: theme.ink },
  weightHint: { fontSize: 12.5, color: theme.inkSoft, marginTop: 2 },
  stepperButtonTray: { flexDirection: "row", gap: 8 },
  stepBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: theme.background,
    justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: theme.hairline,
  },
  stepBtnPressed: { backgroundColor: theme.goldTint },

  /* chips + swatches */
  chipRow: { gap: 8, paddingBottom: 10 },
  optionChip: { paddingHorizontal: 16, height: 38, justifyContent: "center", borderRadius: 19, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.hairline },
  optionChipActive: { backgroundColor: theme.ink, borderColor: theme.ink },
  optionChipText: { fontSize: 14, fontWeight: "500", color: theme.inkSoft },
  optionChipTextActive: { color: theme.gold, fontWeight: "600" },

  swatchRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  swatchWrap: { alignItems: "center" },
  swatchRing: { width: 46, height: 46, borderRadius: 23, justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "transparent" },
  swatchRingActive: { borderColor: theme.gold },
  swatch: { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(0,0,0,0.15)" },

  /* inputs */
  inputCard: { backgroundColor: theme.surface, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline, paddingHorizontal: 16 },
  inputCardError: { borderColor: theme.danger, borderWidth: 1 },
  formInputRow: { flexDirection: "row", alignItems: "center", minHeight: 54, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.hairline },
  rowLast: { borderBottomWidth: 0 },
  rowTopBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline },
  formFieldIcon: { marginRight: 12 },
  fieldTextInputElement: { flex: 1, fontSize: 15, color: theme.ink, paddingVertical: 12 },
  dateText: { flex: 1, fontSize: 15, color: theme.ink },
  counter: { fontSize: 12, color: theme.inkMuted, marginLeft: 8 },
  errorText: { fontSize: 12.5, color: theme.danger, marginTop: 8, marginLeft: 4 },

  /* calendar */
  calendar: { paddingBottom: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline, paddingTop: 12 },
  calHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  calNav: { width: 34, height: 34, borderRadius: 17, backgroundColor: theme.background, justifyContent: "center", alignItems: "center" },
  calTitle: { fontSize: 15, fontWeight: "700", color: theme.ink },
  calWeekRow: { flexDirection: "row", marginBottom: 4 },
  calWeekday: { width: "14.2857%", textAlign: "center", fontSize: 12, color: theme.inkMuted },
  calGrid: { flexDirection: "row", flexWrap: "wrap" },
  calCell: { width: "14.2857%", height: 40, alignItems: "center", justifyContent: "center" },
  calDay: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  calDaySelected: { backgroundColor: theme.ink },
  calDayText: { fontSize: 14, color: theme.ink },
  calNote: { fontSize: 12, color: theme.inkSoft, marginTop: 8, textAlign: "center" },

  textAreaElement: {
    backgroundColor: theme.surface, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline,
    padding: 14, fontSize: 15, color: theme.ink, height: 108, textAlignVertical: "top",
  },

  /* breakdown */
  breakdownCard: { backgroundColor: theme.goldTint, borderRadius: 16, padding: 16, marginTop: 22, gap: 10 },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between" },
  breakdownLabel: { fontSize: 13.5, color: theme.inkSoft },
  breakdownValue: { fontSize: 13.5, fontWeight: "600", color: theme.ink },

  /* footer */
  floatingActionFooter: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: 88, backgroundColor: theme.surface,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20,
  },
  footerPriceLabelText: { fontSize: 12.5, color: theme.inkSoft },
  footerPriceAmountText: { fontSize: 22, fontWeight: "800", color: theme.ink, marginTop: 2, letterSpacing: -0.4 },
  actionCommitBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 54, minWidth: 156,
    paddingHorizontal: 24, borderRadius: 16, backgroundColor: theme.ink,
  },
  actionCommitBtnText: { color: "#FFF", fontWeight: "700", fontSize: 16 },
});