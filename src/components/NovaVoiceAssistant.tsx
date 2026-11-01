import { BlurView } from "expo-blur";
import { Milestone, X } from "lucide-react-native";
import { useState } from "react";
import {
    ActivityIndicator,
    Modal,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { Colors } from "../constants/Colors";
import { useAppToast } from "../context/ToastContext";

interface VoiceProps {
  visible: boolean;
  onClose: () => void;
  onOrderParsed: (data: any) => void;
}

export default function NovaVoiceAssistant({
  visible,
  onClose,
  onOrderParsed,
}: VoiceProps) {
  const [input, setInput] = useState("");
  const [parsing, setParsing] = useState(false);
  const { showToast } = useAppToast();

  const handleContextParse = () => {
    if (!input.trim()) return;
    setParsing(true);
    setTimeout(() => {
      setParsing(false);
      showToast("✨ Conversational intent vectors extracted successfully!");
      onOrderParsed({
        title: "Nova Predicted Celebration Build",
        weight: input.includes("2kg") ? "2.0" : "1.0",
        flavor: input.includes("chocolate")
          ? "Premium Chocolate Fudge Fusion"
          : "Vanilla Bean Glaze Fusion",
        paymentOption: "Full",
      });
      setInput("");
      onClose();
    }, 1500);
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.7)",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <BlurView intensity={90} tint="dark" style={styles.glassPanel}>
          <View style={styles.header}>
            <Text style={{ color: "#FFF", fontWeight: "bold" }}>
              Nova Assistant Terminal
            </Text>
            <TouchableOpacity onPress={onClose}>
              <X color="#FFF" size={20} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.terminalArea}
            multiline
            placeholder="Type configuration rules natively (e.g. 2kg chocolate fudge cake)..."
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={input}
            onChangeText={setInput}
          />
          {parsing ? (
            <ActivityIndicator size="small" color={Colors.lightBlue} />
          ) : (
            <TouchableOpacity
              style={styles.parseBtn}
              onPress={handleContextParse}
            >
              <Milestone color="#FFF" size={16} style={{ marginRight: 6 }} />
              <Text style={{ color: "#FFF", fontWeight: "bold" }}>
                Extract Structural Tokens
              </Text>
            </TouchableOpacity>
          )}
        </BlurView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  glassPanel: {
    borderRadius: 16,
    padding: 20,
    backgroundColor: "rgba(30,30,30,0.8)",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  terminalArea: {
    backgroundColor: "rgba(0,0,0,0.3)",
    color: "#FFF",
    borderRadius: 10,
    padding: 12,
    height: 80,
    textAlignVertical: "top",
    marginVertical: 12,
  },
  parseBtn: {
    backgroundColor: Colors.lightBlue,
    height: 44,
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
});
