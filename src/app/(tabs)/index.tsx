import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Cake,
  Check,
  Clock,
  Heart,
  Layers,
  Plus,
  Scale,
  Search,
  User,
  Users,
  X,
  ZoomIn,
} from "lucide-react-native";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  ImageSourcePropType,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ImageStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../../constants/Colors";
import { useAppToast } from "../../context/ToastContext";
import NovaAIAssistant from "../../components/NovaAIAssistant";
import { timeAgo, useNotifications } from "../../hooks/useNotifications";
import { supabase } from "../../lib/supabase";

/* ------------------------------------------------------------------ */
/* Layout + tokens                                                     */
/* ------------------------------------------------------------------ */
const { width, height } = Dimensions.get("window");
const colWidth = (width - 44) / 2;
const SHEET_HEIGHT = Math.round(height * 0.9);

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

/* ------------------------------------------------------------------ */
/* Business rules (edit here, not in the JSX)                          */
/* ------------------------------------------------------------------ */
const PRICE_PER_KG = 1000; // KES
const DEFAULT_ORDER_WEIGHT_KG = 0.5; // instant "Add to cart" preset
const CATEGORIES = ["All", "Wedding", "Birthday", "Cupcakes", "Custom"];

/**
 * Placeholder spec values used ONLY when the cake_catalog row has no such
 * column. Add real columns later (ingredients, lead_time_hours, tiers,
 * layers, finish) and they will override these automatically.
 */
const SPEC_DEFAULTS = {
  leadTimeHours: 48,
  tiers: 1,
  layers: 3,
  finish: "Buttercream",
  servingsPerKg: 8,
};

/**
 * Builds the row inserted by the instant "Add to cart" action.
 * >>> Rename keys here if your cake_orders columns differ. <<<
 */
const buildDefaultOrder = (item: CakeItem, userId: string) => ({
  user_id: userId,
  cake_title: item.title,
  flavor: item.base_flavor,
  cake_size: "Medium", // same value customize.tsx uses (Small | Medium | Large); Medium = 1.0x price
  total_weight_kg: DEFAULT_ORDER_WEIGHT_KG,
  total_price: priceFor(DEFAULT_ORDER_WEIGHT_KG),
  payment_type: "Full",
  payment_status: "Unpaid",
  order_status: "Pending Review", // the cart only lists rows with this status
});

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */
type CakeItem = {
  id: string | number;
  title: string;
  description?: string | null;
  base_flavor?: string | null;
  default_weight_kg?: number | null;
  image_url?: string | null;
  image_key?: string | null;
  localImage?: ImageSourcePropType | null; // bundled image (assets/images/N.jpg)
  category?: string | null;
  ingredients?: string[] | string | null;
  lead_time_hours?: number | null;
  tiers?: number | null;
  layers?: number | null;
  finish?: string | null;
  [key: string]: any;
};

/* ------------------------------------------------------------------ */
/* Local cakes: assets/images/1.jpg ... 10.jpg                         */
/*                                                                     */
/* require() must be static (Metro resolves it at build time), so      */
/* every image is listed explicitly. To add more: copy a block below   */
/* and point it at 11.jpg, 12.jpg ...                                  */
/*                                                                     */
/* PATH NOTE: this file is assumed to be app/(tabs)/index.tsx, so      */
/* "../../assets/images/" reaches <project>/assets/images/.            */
/* If your file is app/(tabs)/home/index.tsx, change every "../../"    */
/* in the paths below to "../../../".                                  */
/* ------------------------------------------------------------------ */
const LOCAL_CAKES: CakeItem[] = [
  {
    id: "local-1",
    title: "Classic Chocolate Drip",
    description: "Rich chocolate sponge layered with ganache and finished with a glossy drip.",
    base_flavor: "Chocolate",
    category: "Birthday",
    default_weight_kg: 1,
    localImage: require("../../../assets/images/002.jpeg"),
  },
  {
    id: "local-2",
    title: "Vanilla Dream",
    description: "Soft vanilla sponge with silky buttercream and delicate piping.",
    base_flavor: "Vanilla",
    category: "Wedding",
    default_weight_kg: 1,
    localImage: require("../../../assets/images/9.jpg"),
  },
  {
    id: "local-3",
    title: "Red Velvet Romance",
    description: "Velvety red sponge with tangy cream cheese frosting.",
    base_flavor: "Red Velvet",
    category: "Birthday",
    default_weight_kg: 1,
    localImage: require("../../../assets/images/004.jpeg"),
  },
  {
    id: "local-4",
    title: "Strawberry Bliss",
    description: "Light sponge filled with fresh strawberry cream and topped with berries.",
    base_flavor: "Strawberry",
    category: "Birthday",
    default_weight_kg: 1,
    localImage: require("../../../assets/images/4.jpg"),
  },
  {
    id: "local-5",
    title: "Elegant Tiered Wedding Cake",
    description: "A graceful multi-tier cake with floral detailing, made for your big day.",
    base_flavor: "Vanilla",
    category: "Wedding",
    default_weight_kg: 3,
    tiers: 3,
    localImage: require("../../../assets/images/5.jpg"),
  },
  {
    id: "local-6",
    title: "Lemon Zest Cupcakes",
    description: "Bright lemon cupcakes with a swirl of lemon buttercream.",
    base_flavor: "Lemon",
    category: "Cupcakes",
    default_weight_kg: 0.5,
    localImage: require("../../../assets/images/001.jpeg"),
  },
  {
    id: "local-7",
    title: "Caramel Crunch",
    description: "Buttery caramel sponge with salted caramel and a crunchy topping.",
    base_flavor: "Caramel",
    category: "Custom",
    default_weight_kg: 1,
    localImage: require("../../../assets/images/7.jpg"),
  },
  {
    id: "local-8",
    title: "Black Forest",
    description: "Chocolate sponge, whipped cream and cherries, topped with chocolate shavings.",
    base_flavor: "Chocolate",
    category: "Birthday",
    default_weight_kg: 1,
    localImage: require("../../../assets/images/8.jpg"),
  },
  {
    id: "local-9",
    title: "Rainbow Celebration",
    description: "Colourful layers with vanilla frosting, perfect for kids' parties.",
    base_flavor: "Vanilla",
    category: "Custom",
    default_weight_kg: 1,
    localImage: require("../../../assets/images/1.jpg"),
  },
  {
    id: "local-10",
    title: "Chocolate Cupcake Box",
    description: "Six moist chocolate cupcakes topped with whipped chocolate frosting.",
    base_flavor: "Chocolate",
    category: "Cupcakes",
    default_weight_kg: 0.5,
    localImage: require("../../../assets/images/003.jpeg"),
  },
];

/* ------------------------------------------------------------------ */
/* Image strategy: remote URL first, then local image, then vector     */
/* ------------------------------------------------------------------ */
const getLocalImage = (item: CakeItem): ImageSourcePropType | null => item.localImage ?? null;

/**
 * image_url can be a full web address, or just a file name in the public
 * "cake-images" Supabase Storage bucket (e.g. "chocolate-drip.jpg").
 */
const resolveImageUrl = (value?: string | null): string | null => {
  const v = value?.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  return supabase.storage.from("cake-images").getPublicUrl(v.replace(/^\/+/, "")).data.publicUrl;
};

function CakeImage({
  item,
  style,
  resizeMode = "cover",
}: {
  item: CakeItem;
  style: StyleProp<ImageStyle>;
  resizeMode?: "cover" | "contain";
}) {
  const remote = resolveImageUrl(item.image_url);
  const [remoteFailed, setRemoteFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // New image url means a fresh attempt
  useEffect(() => {
    setRemoteFailed(false);
    setLoaded(false);
  }, [remote]);

  const local = getLocalImage(item);
  const source: ImageSourcePropType | null =
    remote && !remoteFailed ? { uri: remote } : local;

  if (!source) {
    return (
      <View style={[style as any, styles.imagePlaceholder]}>
        <Cake size={36} color={theme.gold} strokeWidth={1.5} />
      </View>
    );
  }

  const showSpinner = !!remote && !remoteFailed && !loaded;

  return (
    <View style={[style as any, { overflow: "hidden" }]}>
      <Image
        source={source as any}
        style={StyleSheet.absoluteFill}
        contentFit={resizeMode}
        cachePolicy="memory-disk"
        transition={200}
        onLoad={() => setLoaded(true)}
        onError={() => setRemoteFailed(true)}
      />
      {showSpinner && (
        <View style={[StyleSheet.absoluteFill, styles.imagePlaceholder]}>
          <ActivityIndicator size="small" color={theme.gold} />
        </View>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
const priceFor = (weightKg: number) => Math.round(weightKg * PRICE_PER_KG);
const formatKes = (n: number) => `KES ${n.toLocaleString()}`;

const parseIngredients = (item: CakeItem): string[] => {
  if (Array.isArray(item.ingredients)) return item.ingredients.filter(Boolean);
  if (typeof item.ingredients === "string" && item.ingredients.trim()) {
    return item.ingredients.split(",").map((s) => s.trim()).filter(Boolean);
  }
  // Sensible baseline so the section is never empty
  return [item.base_flavor || "Vanilla", "Butter", "Free range eggs", "Fresh cream", "Cake flour"];
};

const formatLeadTime = (hours: number) =>
  hours % 24 === 0 ? `${hours / 24} day${hours === 24 ? "" : "s"}` : `${hours} hrs`;

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */
export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showToast } = useAppToast();
  const toastRef = useRef(showToast);
  toastRef.current = showToast;

  const [catalog, setCatalog] = useState<CakeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [addingId, setAddingId] = useState<string | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);

  const [notificationVisible, setNotificationVisible] = useState(false);
  const { notifications, unreadCount, markAllRead } = useNotifications();
  const closeNotifications = () => {
    setNotificationVisible(false);
    if (unreadCount > 0) markAllRead();
  };

  // Detail sheet state
  const [selected, setSelected] = useState<CakeItem | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;

  /* ---------- data ---------- */
  const loadCatalog = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      let { data, error } = await supabase
        .from("cake_catalog")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("title", { ascending: true });
      // Before the catalog migration has run, those columns do not exist: fall back to a plain read
      if (error) ({ data, error } = await supabase.from("cake_catalog").select("*"));
      if (error) throw error;
      setCatalog((data as CakeItem[]) || []);
    } catch {
      // Local cakes still show even if the DB call fails
      toastRef.current("Failed to pull cake inventory.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const filteredCatalog = useMemo(() => {
    let result: CakeItem[] = [...LOCAL_CAKES, ...catalog]; // local cakes first, DB cakes after
    if (selectedCategory !== "All") {
      const cat = selectedCategory.toLowerCase();
      result = result.filter((item) =>
        item.category
          ? item.category.toLowerCase() === cat
          : item.description?.toLowerCase().includes(cat) || item.title?.toLowerCase().includes(cat)
      );
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (item) =>
          item.title?.toLowerCase().includes(q) ||
          item.base_flavor?.toLowerCase().includes(q) ||
          item.description?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [catalog, selectedCategory, searchQuery]);

  /* ---------- sheet controls ---------- */
  const openSheet = (item: CakeItem) => {
    setSheetError(null);
    setSelected(item);
    setSheetVisible(true);
  };

  useEffect(() => {
    if (sheetVisible) {
      translateY.setValue(SHEET_HEIGHT);
      Animated.spring(translateY, {
        toValue: 0,
        damping: 22,
        stiffness: 180,
        mass: 0.9,
        useNativeDriver: true,
      }).start();
    }
  }, [sheetVisible, translateY]);

  const closeSheet = useCallback(() => {
    Animated.timing(translateY, {
      toValue: SHEET_HEIGHT,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      setSheetVisible(false);
      setZoomOpen(false);
    });
  }, [translateY]);

  const backdropOpacity = translateY.interpolate({
    inputRange: [0, SHEET_HEIGHT],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  /* ---------- actions ---------- */
  const toggleFavorite = (id: string) =>
    setFavorites((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const navigateToCustomizer = (item: CakeItem) => {
    router.push({
      pathname: "/(tabs)/home/customize",
      params: {
        id: item.id,
        title: item.title,
        flavor: item.base_flavor,
        weight: item.default_weight_kg,
      },
    });
  };

  const customizeFromSheet = (item: CakeItem) => {
    Animated.timing(translateY, { toValue: SHEET_HEIGHT, duration: 180, useNativeDriver: true }).start(() => {
      setSheetVisible(false);
      setZoomOpen(false);
      navigateToCustomizer(item);
    });
  };

  const addToCart = async (item: CakeItem) => {
    if (addingId) return; // blocks double taps
    setAddingId(String(item.id));
    setSheetError(null);
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;

      if (!user) {
        showToast("Please log in to add cakes to your cart.");
        router.push("/(auth)/login");
        return;
      }

      const { error } = await supabase.from("cake_orders").insert(buildDefaultOrder(item, user.id));
      if (error) throw error;

      showToast(`${item.title} added to your cart 🎂`);
      if (sheetVisible) closeSheet();
    } catch (error: any) {
      const message = error?.message || "Could not add to cart. Please try again.";
      // A toast would sit behind the open sheet, so show the error inside it
      if (sheetVisible) setSheetError(message);
      else showToast(message, { type: "error" });
    } finally {
      setAddingId(null);
    }
  };

  /* ---------- render ---------- */
  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.gold} />
        <Text style={styles.loadingText}>Fetching delicious options...</Text>
      </View>
    );
  }

  const renderCard = ({ item }: { item: CakeItem }) => {
    const id = String(item.id);
    const isAdding = addingId === id;
    const isFav = favorites.has(id);

    return (
      <Pressable
        onPress={() => openSheet(item)}
        accessibilityRole="button"
        accessibilityLabel={`View details for ${item.title}`}
        style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.985 }] }]}
      >
        <CakeImage item={item} style={StyleSheet.absoluteFill as any} />

        <Pressable
          style={styles.favIcon}
          hitSlop={8}
          onPress={() => toggleFavorite(id)}
          accessibilityRole="button"
          accessibilityLabel={isFav ? "Remove from favourites" : "Save to favourites"}
        >
          <Heart size={16} color="#E63946" fill={isFav ? "#E63946" : "transparent"} />
        </Pressable>

        <BlurView intensity={45} tint="light" style={styles.glassInfo}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cakeTitle} numberOfLines={1}>
              {item.title}
            </Text>
            {!!item.description && (
              <Text style={styles.descText} numberOfLines={2}>
                {item.description}
              </Text>
            )}
            <Text style={styles.flavorText} numberOfLines={1}>
              {item.base_flavor || "Classic"}, {DEFAULT_ORDER_WEIGHT_KG} kg
            </Text>
            <Text style={styles.priceValue}>{formatKes(priceFor(DEFAULT_ORDER_WEIGHT_KG))}</Text>
          </View>

          <Pressable
            onPress={() => addToCart(item)}
            disabled={!!addingId}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Add ${item.title} to cart`}
            style={({ pressed }) => [
              styles.quickAdd,
              pressed && { transform: [{ scale: 0.92 }], backgroundColor: theme.gold },
              !!addingId && !isAdding && { opacity: 0.45 },
            ]}
          >
            {isAdding ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Plus size={18} color="#FFF" strokeWidth={2.5} />
            )}
          </Pressable>
        </BlurView>
      </Pressable>
    );
  };

  return (
    <View style={[styles.mainContainer, { paddingTop: insets.top + 16 }]}>
      {/* 1. BRAND HEADER */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.welcomeText}>Welcome to 👋</Text>
          <Text style={styles.brandText}>Vatican Cake Point</Text>
        </View>

        <View style={styles.actionTray}>
          <Pressable
            style={styles.headerButtonCircle}
            onPress={() => setNotificationVisible(true)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Open order tracker"
          >
            <Bell size={21} color={theme.ink} strokeWidth={1.75} />
            {unreadCount > 0 && <View style={styles.badgeIndicator} />}
          </Pressable>

          <Pressable
            style={styles.headerButtonCircle}
            onPress={() => router.push("/profile")}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
          >
            <User size={21} color={theme.ink} strokeWidth={1.75} />
          </Pressable>
        </View>
      </View>

      {/* 2. SEARCH */}
      <View style={styles.searchBarContainer}>
        <Search size={19} color={theme.inkMuted} style={styles.searchIcon} />
        <TextInput
          placeholder="Search flavors, decorations..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchInput}
          placeholderTextColor={theme.inkMuted}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery("")} hitSlop={10} accessibilityLabel="Clear search">
            <X size={17} color={theme.inkMuted} />
          </Pressable>
        )}
      </View>

      {/* 3. CATEGORY CHIPS */}
      <View style={styles.chipsWrap}>
        <FlatList
          horizontal
          data={CATEGORIES}
          keyExtractor={(item) => item}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryList}
          renderItem={({ item }) => {
            const isActive = selectedCategory === item;
            return (
              <Pressable
                onPress={() => setSelectedCategory(item)}
                style={[styles.chip, isActive && styles.activeChip]}
              >
                <Text style={[styles.chipText, isActive && styles.activeChipText]}>{item}</Text>
              </Pressable>
            );
          }}
        />
      </View>

      {/* 4. PRODUCT GRID */}
      <FlatList
        data={filteredCatalog}
        keyExtractor={(item) => String(item.id)}
        numColumns={2}
        contentContainerStyle={styles.gridContainer}
        columnWrapperStyle={{ justifyContent: "space-between" }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadCatalog(true)}
            tintColor={theme.gold}
            colors={[theme.gold]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Cake size={44} color={theme.inkMuted} strokeWidth={1.5} />
            <Text style={styles.emptyText}>No matching cakes found today.</Text>
          </View>
        }
        renderItem={renderCard}
      />

      {/* Floating Nova assistant */}
      <NovaAIAssistant />

      {/* 5. DETAIL SHEET */}
      <Modal visible={sheetVisible} transparent animationType="none" onRequestClose={closeSheet} statusBarTranslucent>
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Animated.View style={[styles.sheetBackdrop, { opacity: backdropOpacity }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} accessibilityLabel="Close details" />
          </Animated.View>

          <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
            {selected && (
              <>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                  {/* Hero */}
                  <Pressable onPress={() => setZoomOpen(true)} accessibilityLabel="Zoom photo">
                    <CakeImage item={selected} style={styles.sheetHero} />
                    <View style={styles.zoomHint}>
                      <ZoomIn size={14} color="#FFF" />
                      <Text style={styles.zoomHintText}>Tap to zoom</Text>
                    </View>
                  </Pressable>

                  <Pressable style={styles.sheetClose} onPress={closeSheet} hitSlop={10} accessibilityLabel="Close">
                    <X size={20} color={theme.ink} />
                  </Pressable>

                  <View style={styles.sheetBody}>
                    <View style={styles.titleRow}>
                      <View style={{ flex: 1, paddingRight: 12 }}>
                        <Text style={styles.sheetTitle}>{selected.title}</Text>
                        <Text style={styles.sheetSub}>{selected.base_flavor || "Classic"} sponge</Text>
                      </View>
                      <Text style={styles.sheetPrice}>{formatKes(priceFor(DEFAULT_ORDER_WEIGHT_KG))}</Text>
                    </View>

                    {!!selected.description && <Text style={styles.sheetDescription}>{selected.description}</Text>}

                    {/* Metrics */}
                    <View style={styles.metricsRow}>
                      <Metric
                        icon={<Scale size={17} color={theme.gold} strokeWidth={1.75} />}
                        value={`${selected.default_weight_kg || DEFAULT_ORDER_WEIGHT_KG} kg`}
                        label="Standard size"
                      />
                      <View style={styles.metricDivider} />
                      <Metric
                        icon={<Users size={17} color={theme.gold} strokeWidth={1.75} />}
                        value={`About ${Math.round(
                          (selected.default_weight_kg || DEFAULT_ORDER_WEIGHT_KG) * SPEC_DEFAULTS.servingsPerKg
                        )}`}
                        label="Servings"
                      />
                      <View style={styles.metricDivider} />
                      <Metric
                        icon={<Clock size={17} color={theme.gold} strokeWidth={1.75} />}
                        value={formatLeadTime(selected.lead_time_hours || SPEC_DEFAULTS.leadTimeHours)}
                        label="Lead time"
                      />
                    </View>

                    {/* Ingredients */}
                    <Text style={styles.blockTitle}>Ingredients</Text>
                    <View style={styles.chipCloud}>
                      {parseIngredients(selected).map((ing) => (
                        <View key={ing} style={styles.ingChip}>
                          <Text style={styles.ingChipText}>{ing}</Text>
                        </View>
                      ))}
                    </View>

                    {/* Timeline */}
                    <Text style={styles.blockTitle}>Baking timeline</Text>
                    <View style={styles.timeline}>
                      {[
                        { t: "Order confirmed", d: "Chef reviews your details and confirms the bake." },
                        {
                          t: "Baking and decorating",
                          d: `Handmade to order over ${formatLeadTime(
                            selected.lead_time_hours || SPEC_DEFAULTS.leadTimeHours
                          )}.`,
                        },
                        { t: "Ready for pickup", d: "You are notified the moment it is boxed." },
                      ].map((step, i, arr) => (
                        <View key={step.t} style={styles.timelineRow}>
                          <View style={styles.timelineRail}>
                            <View style={styles.timelineDot} />
                            {i < arr.length - 1 && <View style={styles.timelineLine} />}
                          </View>
                          <View style={{ flex: 1, paddingBottom: i < arr.length - 1 ? 16 : 0 }}>
                            <Text style={styles.timelineTitle}>{step.t}</Text>
                            <Text style={styles.timelineDesc}>{step.d}</Text>
                          </View>
                        </View>
                      ))}
                    </View>

                    {/* Structure specs */}
                    <Text style={styles.blockTitle}>Structure</Text>
                    <View style={styles.specCard}>
                      <SpecRow label="Tiers" value={String(selected.tiers || SPEC_DEFAULTS.tiers)} />
                      <SpecRow label="Sponge layers" value={String(selected.layers || SPEC_DEFAULTS.layers)} />
                      <SpecRow label="Finish" value={selected.finish || SPEC_DEFAULTS.finish} last />
                    </View>
                  </View>
                </ScrollView>

                {!!sheetError && <Text style={styles.sheetError}>{sheetError}</Text>}

                {/* Sticky actions */}
                <View style={styles.sheetFooter}>
                  <Pressable
                    onPress={() => customizeFromSheet(selected)}
                    style={({ pressed }) => [styles.secondaryBtn, pressed && { backgroundColor: theme.goldTint }]}
                    accessibilityRole="button"
                  >
                    <Layers size={17} color={theme.ink} strokeWidth={1.75} />
                    <Text style={styles.secondaryBtnText}>Customize</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => addToCart(selected)}
                    disabled={!!addingId}
                    style={({ pressed }) => [
                      styles.primaryBtn,
                      pressed && { opacity: 0.88, transform: [{ scale: 0.985 }] },
                      !!addingId && { opacity: 0.7 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${selected.title} to cart`}
                  >
                    {addingId === String(selected.id) ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <>
                        <Check size={17} color={theme.gold} strokeWidth={2.5} />
                        <Text style={styles.primaryBtnText}>
                          Add to cart, {formatKes(priceFor(DEFAULT_ORDER_WEIGHT_KG))}
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>

                {/* Zoom viewer (nested so iOS can present it) */}
                <Modal visible={zoomOpen} transparent animationType="fade" onRequestClose={() => setZoomOpen(false)}>
                  <View style={styles.zoomOverlay}>
                    <ScrollView
                      maximumZoomScale={4}
                      minimumZoomScale={1}
                      centerContent
                      bouncesZoom
                      showsHorizontalScrollIndicator={false}
                      showsVerticalScrollIndicator={false}
                      contentContainerStyle={styles.zoomContent}
                    >
                      <CakeImage item={selected} style={{ width, height: width * 1.2 }} resizeMode="contain" />
                    </ScrollView>
                    <Pressable style={styles.zoomClose} onPress={() => setZoomOpen(false)} hitSlop={12} accessibilityLabel="Close zoom">
                      <X size={22} color="#FFF" />
                    </Pressable>
                  </View>
                </Modal>
              </>
            )}
          </Animated.View>
        </View>
      </Modal>

      {/* 6. NOTIFICATION TRACKER */}
      <Modal visible={notificationVisible} transparent animationType="fade" onRequestClose={closeNotifications}>
        <View style={styles.modalOverlay}>
          <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
          <Pressable style={StyleSheet.absoluteFill} onPress={closeNotifications} />

          <View style={styles.modalContent}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalHeaderTitle}>Notifications</Text>
              <Pressable style={styles.closeCrossButton} onPress={closeNotifications} hitSlop={12}>
                <X size={18} color={theme.ink} />
              </Pressable>
            </View>

            <FlatList
              data={notifications}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 360 }}
              ListEmptyComponent={<Text style={styles.notifEmpty}>No notifications yet.</Text>}
              ItemSeparatorComponent={() => <View style={styles.notifSeparator} />}
              renderItem={({ item }) => (
                <View style={styles.notifRow}>
                  <View style={[styles.notifDot, !!item.read_at && { backgroundColor: theme.hairline }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.notifHeader}>{item.title}</Text>
                    <Text style={styles.notifBody}>{item.body}</Text>
                  </View>
                  <Text style={styles.notifTime}>{timeAgo(item.created_at)}</Text>
                </View>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Small presentational pieces                                         */
/* ------------------------------------------------------------------ */
function Metric({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <View style={styles.metric}>
      {icon}
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function SpecRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.specRow, !last && styles.specRowBorder]}>
      <Text style={styles.specLabel}>{label}</Text>
      <Text style={styles.specValue}>{value}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */
const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: theme.background, paddingTop: 16 },
  centerContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: theme.background },
  loadingText: { marginTop: 12, color: theme.inkSoft, fontSize: 14 },

  /* header */
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, marginBottom: 16 },
  welcomeText: { fontSize: 13, color: theme.inkSoft },
  brandText: { fontSize: 23, fontWeight: "700", color: theme.ink, letterSpacing: -0.3 },
  actionTray: { flexDirection: "row", gap: 10, alignItems: "center" },
  headerButtonCircle: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: theme.surface,
    justifyContent: "center", alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline,
    shadowColor: "#2A1B10", shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  badgeIndicator: { position: "absolute", top: 10, right: 11, width: 8, height: 8, borderRadius: 4, backgroundColor: "#E63946", borderWidth: 1.5, borderColor: theme.surface },

  /* search */
  searchBarContainer: {
    flexDirection: "row", alignItems: "center", backgroundColor: theme.surface, marginHorizontal: 16,
    paddingHorizontal: 14, borderRadius: 14, marginBottom: 14, height: 48,
    borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline,
  },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, fontSize: 15, color: theme.ink },

  /* chips */
  chipsWrap: { height: 44, marginBottom: 6 },
  categoryList: { paddingHorizontal: 16, gap: 8, alignItems: "center" },
  chip: { paddingHorizontal: 18, height: 36, justifyContent: "center", borderRadius: 18, backgroundColor: theme.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline },
  activeChip: { backgroundColor: theme.ink, borderColor: theme.ink },
  chipText: { fontSize: 14, fontWeight: "500", color: theme.inkSoft },
  activeChipText: { color: theme.gold, fontWeight: "600" },

  /* grid */
  gridContainer: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 },
  card: {
    width: colWidth, height: 292, borderRadius: 20, overflow: "hidden", marginBottom: 12,
    backgroundColor: theme.goldTint,
    shadowColor: "#2A1B10", shadowOpacity: 0.1, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 3,
  },
  favIcon: {
    position: "absolute", top: 10, right: 10, width: 32, height: 32, borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.92)", justifyContent: "center", alignItems: "center",
  },
  glassInfo: {
    position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 11, backgroundColor: "rgba(255,255,255,0.55)", overflow: "hidden",
  },
  cakeTitle: { fontSize: 14.5, fontWeight: "700", color: theme.ink },
  descText: { fontSize: 11.5, lineHeight: 15, color: theme.inkSoft, marginTop: 2 },
  flavorText: { fontSize: 12, color: theme.inkSoft, marginTop: 3 },
  priceValue: { fontSize: 13.5, fontWeight: "700", color: theme.ink, marginTop: 5 },
  quickAdd: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: theme.ink,
    justifyContent: "center", alignItems: "center", marginLeft: 8,
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  imagePlaceholder: { backgroundColor: theme.goldTint, justifyContent: "center", alignItems: "center" },
  emptyContainer: { alignItems: "center", paddingTop: 64, gap: 12 },
  emptyText: { color: theme.inkSoft, fontSize: 15 },

  /* detail sheet */
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(20,12,8,0.6)" },
  sheet: {
    height: SHEET_HEIGHT, backgroundColor: theme.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: "hidden",
  },
  sheetHero: { width: "100%", height: 300 },
  zoomHint: {
    position: "absolute", left: 16, bottom: 14, flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(31,22,18,0.65)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14,
  },
  zoomHintText: { color: "#FFF", fontSize: 12, fontWeight: "500" },
  sheetClose: {
    position: "absolute", top: 14, right: 14, width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.95)", justifyContent: "center", alignItems: "center",
  },
  sheetBody: { padding: 20 },
  titleRow: { flexDirection: "row", alignItems: "flex-start" },
  sheetTitle: { fontSize: 24, fontWeight: "700", color: theme.ink, letterSpacing: -0.4 },
  sheetSub: { fontSize: 14, color: theme.inkSoft, marginTop: 3 },
  sheetPrice: { fontSize: 18, fontWeight: "700", color: theme.gold },
  sheetDescription: { fontSize: 14.5, lineHeight: 22, color: theme.inkSoft, marginTop: 14 },

  metricsRow: {
    flexDirection: "row", backgroundColor: theme.surface, borderRadius: 16, marginTop: 20,
    borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline, paddingVertical: 16,
  },
  metric: { flex: 1, alignItems: "center", gap: 5 },
  metricValue: { fontSize: 15, fontWeight: "700", color: theme.ink },
  metricLabel: { fontSize: 12, color: theme.inkSoft },
  metricDivider: { width: StyleSheet.hairlineWidth, backgroundColor: theme.hairline },

  blockTitle: { fontSize: 16, fontWeight: "700", color: theme.ink, marginTop: 26, marginBottom: 12 },
  chipCloud: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  ingChip: { backgroundColor: theme.goldTint, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14 },
  ingChipText: { fontSize: 13, color: theme.ink, fontWeight: "500" },

  timeline: { paddingLeft: 2 },
  timelineRow: { flexDirection: "row" },
  timelineRail: { width: 22, alignItems: "center" },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.gold, marginTop: 4 },
  timelineLine: { flex: 1, width: 1.5, backgroundColor: theme.hairline, marginTop: 4 },
  timelineTitle: { fontSize: 14.5, fontWeight: "600", color: theme.ink },
  timelineDesc: { fontSize: 13, color: theme.inkSoft, marginTop: 2, lineHeight: 19 },

  specCard: { backgroundColor: theme.surface, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline, paddingHorizontal: 16 },
  specRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 14 },
  specRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.hairline },
  specLabel: { fontSize: 14, color: theme.inkSoft },
  specValue: { fontSize: 14, fontWeight: "600", color: theme.ink },

  sheetError: { fontSize: 13, color: theme.danger, backgroundColor: Colors.dangerTint, paddingHorizontal: 20, paddingVertical: 10, textAlign: "center" },
  sheetFooter: {
    flexDirection: "row", gap: 10, padding: 16, paddingBottom: 28, backgroundColor: theme.surface,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline,
  },
  secondaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 18, height: 54,
    borderRadius: 16, borderWidth: 1, borderColor: theme.hairline, backgroundColor: theme.surface,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: "600", color: theme.ink },
  primaryBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 54,
    borderRadius: 16, backgroundColor: theme.ink,
  },
  primaryBtnText: { fontSize: 15, fontWeight: "700", color: "#FFF" },

  /* zoom */
  zoomOverlay: { flex: 1, backgroundColor: "rgba(10,6,4,0.96)" },
  zoomContent: { flexGrow: 1, justifyContent: "center" },
  zoomClose: {
    position: "absolute", top: 54, right: 18, width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.18)", justifyContent: "center", alignItems: "center",
  },

  /* notifications */
  modalOverlay: { flex: 1, justifyContent: "center", padding: 20 },
  modalContent: { backgroundColor: theme.surface, borderRadius: 24, padding: 20 },
  modalHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalHeaderTitle: { fontSize: 18, fontWeight: "700", color: theme.ink },
  closeCrossButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: theme.background, justifyContent: "center", alignItems: "center" },
  notifEmpty: { fontSize: 14, color: theme.inkSoft, textAlign: "center", paddingVertical: 24 },
  notifRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 14, gap: 12 },
  notifSeparator: { height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline },
  notifDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.gold, marginTop: 6 },
  notifHeader: { fontSize: 14.5, fontWeight: "600", color: theme.ink },
  notifBody: { fontSize: 13, color: theme.inkSoft, marginTop: 3, lineHeight: 19 },
  notifTime: { fontSize: 12, color: theme.inkMuted },
});