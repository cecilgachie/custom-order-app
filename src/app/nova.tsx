import { useRouter } from "expo-router";
import { ArrowUp, RotateCcw, Sparkles } from "lucide-react-native";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../constants/Colors";
import { supabase } from "../lib/supabase";

type Destination = "orders" | "cart" | "home";
type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  action?: Destination;
  error?: boolean;
};

const DESTINATIONS: Record<Destination, { label: string; path: string }> = {
  orders: { label: "Open my orders", path: "/(tabs)/orders" },
  cart: { label: "Open my cart", path: "/(tabs)/cart" },
  home: { label: "Browse cakes", path: "/(tabs)" },
};

const SUGGESTIONS = [
  "Which cake suits 30 guests?",
  "How do deposits work?",
  "Where is my order?",
  "How much is a 2 kg Large cake?",
];

const MAX_INPUT = 600;
const ACTION_TAG = /\[\[go:(orders|cart|home)\]\]/i;

let counter = 0;
const newId = () => `m${Date.now()}-${counter++}`;

export default function NovaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<Message>>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const scrollToEnd = () => requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));

  const ask = useCallback(async (history: Message[]) => {
    setSending(true);
    try {
      const payload = history
        .filter((m) => !m.error)
        .slice(-12)
        .map((m) => ({ role: m.role, content: m.text }));

      const { data, error } = await supabase.functions.invoke("nova-assistant", { body: { messages: payload } });

      if (error) {
        let message = "Nova could not be reached. Check your connection and try again.";
        try {
          const body = await (error as any).context?.json?.();
          if (body?.error) message = body.error;
        } catch {
          /* keep generic */
        }
        throw new Error(message);
      }
      if (data?.ok === false || data?.error) throw new Error(data.error || "Nova could not answer that.");

      const raw = String(data.reply ?? "");
      const match = raw.match(ACTION_TAG);
      const reply: Message = {
        id: newId(),
        role: "assistant",
        text: raw.replace(ACTION_TAG, "").trim(),
        action: match ? (match[1].toLowerCase() as Destination) : undefined,
      };
      setMessages((prev) => [...prev, reply]);
    } catch (e: any) {
      setMessages((prev) => [...prev, { id: newId(), role: "assistant", text: e?.message || "Something went wrong.", error: true }]);
    } finally {
      setSending(false);
      scrollToEnd();
    }
  }, []);

  const send = (text: string) => {
    const content = text.trim();
    if (!content || sending) return;
    const next = [...messages, { id: newId(), role: "user" as const, text: content }];
    setMessages(next);
    setInput("");
    scrollToEnd();
    ask(next);
  };

  // Drop the error bubble and ask again with the same history
  const retry = () => {
    if (sending) return;
    const cleaned = messages.filter((m) => !m.error);
    setMessages(cleaned);
    ask(cleaned);
  };

  const newChat = () => {
    if (sending) return;
    setMessages([]);
    setInput("");
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const mine = item.role === "user";
    return (
      <View style={[styles.row, mine && { justifyContent: "flex-end" }]}>
        {!mine && (
          <View style={styles.avatar}>
            <Sparkles size={14} color={Colors.gold} strokeWidth={2} />
          </View>
        )}
        <View style={{ maxWidth: "80%" }}>
          <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleNova, item.error && styles.bubbleError]}>
            <Text style={[styles.bubbleText, mine && { color: "#FFF" }, item.error && { color: Colors.danger }]} selectable>
              {item.text}
            </Text>
          </View>

          {item.error && (
            <Pressable onPress={retry} style={styles.retry} accessibilityRole="button">
              <RotateCcw size={13} color={Colors.ink} />
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          )}

          {item.action && (
            <Pressable
              onPress={() => router.push(DESTINATIONS[item.action!].path as any)}
              style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
            >
              <Text style={styles.actionText}>{DESTINATIONS[item.action].label}</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  const welcome = (
    <View style={styles.welcome}>
      <View style={styles.welcomeIcon}>
        <Sparkles size={26} color={Colors.gold} strokeWidth={1.75} />
      </View>
      <Text style={styles.welcomeTitle}>Hi, I'm Nova</Text>
      <Text style={styles.welcomeText}>
        Ask me about cakes, sizes and pricing, deposits and payments, or where your order is.
      </Text>
      <View style={styles.chips}>
        {SUGGESTIONS.map((s) => (
          <Pressable key={s} onPress={() => send(s)} style={({ pressed }) => [styles.chip, pressed && { backgroundColor: Colors.goldTint }]} accessibilityRole="button">
            <Text style={styles.chipText}>{s}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const canSend = input.trim().length > 0 && !sending;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      {messages.length > 0 && (
        <View style={styles.topBar}>
          <Text style={styles.topTitle}>Nova</Text>
          <Pressable onPress={newChat} hitSlop={8} accessibilityRole="button" accessibilityLabel="Start a new chat">
            <Text style={styles.newChat}>New chat</Text>
          </Pressable>
        </View>
      )}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderMessage}
        ListHeaderComponent={messages.length === 0 ? welcome : null}
        ListFooterComponent={
          sending ? (
            <View style={styles.row}>
              <View style={styles.avatar}>
                <Sparkles size={14} color={Colors.gold} strokeWidth={2} />
              </View>
              <View style={[styles.bubble, styles.bubbleNova, styles.typing]}>
                <ActivityIndicator size="small" color={Colors.gold} />
                <Text style={styles.typingText}>Nova is thinking…</Text>
              </View>
            </View>
          ) : null
        }
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onContentSizeChange={scrollToEnd}
      />

      <View style={[styles.composer, { paddingBottom: 10 + insets.bottom }]}>
        <View style={styles.inputWrap}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask Nova anything about your cake"
            placeholderTextColor={Colors.inkMuted}
            style={styles.input}
            multiline
            maxLength={MAX_INPUT}
            editable={!sending}
            returnKeyType="send"
            blurOnSubmit
            onSubmitEditing={() => send(input)}
          />
          <Pressable
            onPress={() => send(input)}
            disabled={!canSend}
            style={({ pressed }) => [styles.sendBtn, !canSend && { opacity: 0.35 }, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            <ArrowUp size={20} color={Colors.gold} strokeWidth={2.5} />
          </Pressable>
        </View>
        <Text style={styles.disclaimer}>Nova can make mistakes. Check order details in the Orders tab.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 10 },
  topTitle: { fontSize: 15, fontWeight: "700", color: Colors.ink },
  newChat: { fontSize: 14, fontWeight: "600", color: Colors.gold },

  list: { padding: 16, paddingBottom: 8, flexGrow: 1 },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginBottom: 12 },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.ink, justifyContent: "center", alignItems: "center" },
  bubble: { paddingHorizontal: 14, paddingVertical: 11, borderRadius: 18 },
  bubbleMine: { backgroundColor: Colors.ink, borderBottomRightRadius: 6 },
  bubbleNova: { backgroundColor: Colors.surface, borderBottomLeftRadius: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.hairline },
  bubbleError: { backgroundColor: Colors.dangerTint, borderColor: Colors.dangerBorder },
  bubbleText: { fontSize: 15, lineHeight: 22, color: Colors.ink },
  typing: { flexDirection: "row", alignItems: "center", gap: 10 },
  typingText: { fontSize: 14, color: Colors.inkSoft },
  retry: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: 8, paddingVertical: 4 },
  retryText: { fontSize: 13, fontWeight: "600", color: Colors.ink },
  actionBtn: { alignSelf: "flex-start", marginTop: 8, paddingHorizontal: 14, height: 38, justifyContent: "center", borderRadius: 19, backgroundColor: Colors.goldTint, borderWidth: 1, borderColor: Colors.gold },
  actionText: { fontSize: 13.5, fontWeight: "700", color: "#8A6A33" },

  welcome: { alignItems: "center", paddingTop: 28, paddingBottom: 20, paddingHorizontal: 12 },
  welcomeIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.ink, justifyContent: "center", alignItems: "center", marginBottom: 16, borderWidth: 1.5, borderColor: Colors.gold },
  welcomeTitle: { fontSize: 24, fontWeight: "700", color: Colors.ink, letterSpacing: -0.4 },
  welcomeText: { fontSize: 14.5, color: Colors.inkSoft, textAlign: "center", lineHeight: 22, marginTop: 8, maxWidth: 320 },
  chips: { marginTop: 22, gap: 10, alignSelf: "stretch" },
  chip: { paddingHorizontal: 16, paddingVertical: 13, borderRadius: 16, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.hairline },
  chipText: { fontSize: 14.5, fontWeight: "600", color: Colors.ink },

  composer: { paddingHorizontal: 16, paddingTop: 10, backgroundColor: Colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.hairline },
  inputWrap: { flexDirection: "row", alignItems: "flex-end", gap: 10, backgroundColor: Colors.background, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.hairline, paddingLeft: 16, paddingRight: 6, paddingVertical: 6 },
  input: { flex: 1, fontSize: 15.5, color: Colors.ink, maxHeight: 110, paddingTop: Platform.OS === "ios" ? 8 : 6, paddingBottom: Platform.OS === "ios" ? 8 : 6 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.ink, justifyContent: "center", alignItems: "center" },
  disclaimer: { fontSize: 11.5, color: Colors.inkMuted, textAlign: "center", marginTop: 8 },
});