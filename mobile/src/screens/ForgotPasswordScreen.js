import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView, Alert
} from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function ForgotPasswordScreen({ navigation }) {
  const { forgotPassword } = useAuth();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (!phone) { Alert.alert('Error', 'Please enter your phone number'); return; }
    setLoading(true);
    try {
      await forgotPassword(phone);
      setSent(true);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.logoBox}>
            <Text style={styles.logo}>Simple<Text style={styles.logoGreen}>Pay</Text></Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.iconBox}>✅</Text>
            <Text style={styles.heading}>Check your phone</Text>
            <Text style={styles.infoText}>
              We've sent a reset code to your phone. Use code <Text style={{ fontWeight: '700' }}>1234</Text> to reset your password.
            </Text>
            <TouchableOpacity style={styles.btn} onPress={() => navigation.navigate('ResetPassword', { phone })}>
              <Text style={styles.btnText}>Enter reset code</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.link}>Back to sign in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.logoBox}>
          <Text style={styles.logo}>Simple<Text style={styles.logoGreen}>Pay</Text></Text>
          <Text style={styles.logoSub}>Unified Payments · Sierra Leone</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.heading}>Reset password</Text>
          <Text style={styles.infoText}>Enter your phone number to receive a reset code.</Text>
          <Text style={styles.label}>Phone number</Text>
          <TextInput
            style={styles.input}
            placeholder="077 123 456"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoCapitalize="none"
          />
          <TouchableOpacity style={styles.btn} onPress={handleSubmit} disabled={loading}>
            {loading ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>Send reset code</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.link}>Remember your password? <Text style={styles.linkGreen}>Sign in</Text></Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f0f0' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  logoBox: { alignItems: 'center', marginBottom: 24 },
  logo: { fontSize: 32, fontWeight: '700', color: '#1a6b3c' },
  logoGreen: { color: '#1a6b3c' },
  logoSub: { fontSize: 13, color: '#888', marginTop: 4 },
  card: { backgroundColor: 'white', borderRadius: 16, padding: 24, elevation: 4 },
  iconBox: { fontSize: 48, textAlign: 'center', marginBottom: 12 },
  heading: { fontSize: 20, fontWeight: '600', marginBottom: 16, color: '#1a1a1a', textAlign: 'center' },
  infoText: { fontSize: 14, color: '#666', marginBottom: 20, lineHeight: 20, textAlign: 'center' },
  label: { fontSize: 13, color: '#555', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, fontSize: 16, color: '#1a1a1a' },
  btn: { backgroundColor: '#1a6b3c', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 20 },
  btnText: { color: 'white', fontSize: 16, fontWeight: '600' },
  link: { textAlign: 'center', marginTop: 16, fontSize: 14, color: '#888' },
  linkGreen: { color: '#1a6b3c', fontWeight: '500' },
});

