import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Colors } from '../constants/Colors';
import { Smartphone, ShieldCheck } from 'lucide-react-native';

interface MpesaProps {
  visible: boolean;
  amount: number;
  onPaymentComplete: (checkoutId: string) => void;
  onCancel: () => void;
}

export default function MpesaPaymentModal({ visible, amount, onPaymentComplete, onCancel }: MpesaProps) {
  const [phone, setPhone] = useState('2547');
  const [processing, setProcessing] = useState(false);

  const requestStkPushIntent = () => {
    if (phone.length < 12) return alert("Configure a valid complete format Safaricom line (2547XXXXXXXX)!");
    setProcessing(true);
    
    setTimeout(() => {
      setProcessing(false);
      onPaymentComplete(`MPESA_STK_${Math.random().toString(36).substring(2,10).toUpperCase()}`);
    }, 2500);
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalBg}>
        <View style={styles.container}>
          <Smartphone size={32} color={Colors.successGreen} style={{ alignSelf: 'center', marginBottom: 12 }} />
          <Text style={styles.title}>M-Pesa Express Checkout</Text>
          <Text style={styles.amountText}>Payable Amount: KES {amount.toFixed(2)}</Text>
          <TextInput style={styles.input} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
          {processing ? <ActivityIndicator size="small" color={Colors.successGreen} /> : (
            <View style={styles.btnRow}>
              <TouchableOpacity onPress={onCancel} style={{ flex: 1, alignItems: 'center' }}><Text style={{ color: Colors.gray }}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={requestStkPushIntent} style={styles.payBtn}>
                <ShieldCheck color="#FFF" size={16} style={{ marginRight: 4 }} />
                <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Authorize Pin</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  container: { backgroundColor: '#FFF', borderRadius: 20, padding: 24 },
  title: { fontSize: 16, fontWeight: 'bold', textAlign: 'center', color: Colors.textDark },
  amountText: { fontSize: 18, fontWeight: 'bold', color: Colors.successGreen, textAlign: 'center', marginVertical: 12 },
  input: { height: 46, borderWidth: 1, borderColor: Colors.lightGray, borderRadius: 10, textAlign: 'center', fontSize: 16, marginBottom: 16, color: '#000' },
  btnRow: { flexDirection: 'row', alignItems: 'center' },
  payBtn: { flex: 1, backgroundColor: Colors.successGreen, height: 44, borderRadius: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }
});