import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView, Alert
} from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function ResetPasswordScreen({ navigation, route }) {
  const { resetPassword } = useAuth();
  const [phone, setPhone] = useState(route.params?.phone || '');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleReset = async () => {
    if (!phone || !otp || !newPassword || !confirmPassword) {
      Alert.alert('Error', 'All fields are required'); return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match'); return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters'); return;
    }
    setLoading(true);
    try {
      await resetPassword(phone, otp, newPassword);
      setSuccess(true);
      setTimeout(() => navigation.navigate('Login'), 2000);
    } catch (err) {
      Alert.alert('Reset Failed', err.response?.data?.error || 'Please try again');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.card}>
            <Text style={styles.iconBox}>✅</Text>
            <Text style={styles.heading}>Password reset!</Text>
            <Text style={styles.infoText}>
              Your password has been reset successfully. Redirecting to sign in...
            </Text>
          </View>
        </ScrollView>
      </View>
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
          <Text style={styles.heading}>Enter reset code</Text>
          <Text style={styles.infoText}>Enter the code sent to your phone and your new password.</Text>

          <Text style={styles.label}>Phone number</Text>
          <TextInput style={styles.input} placeholder="077 123 456" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoCapitalize="none" />

          <Text style={styles.label}>Reset code</Text>
          <TextInput style={styles.input} placeholder="Enter code (1234)" value={otp} onChangeText={setOtp} keyboardType="number-pad" />

          <Text style={styles.label}>New password</Text>
          <TextInput style={styles.input} placeholder="Min. 6 characters" value={newPassword} onChangeText={setNewPassword} secureTextEntry />

          <Text style={styles.label}>Confirm new password</Text>
          <TextInput style={styles.input} placeholder="Re-enter new password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />

          <TouchableOpacity style={styles.btn} onPress={handleReset} disabled={loading}>
            {loading ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>Reset password</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
            <Text style={styles.link}>Resend code</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.link}>Back to sign in</Text>
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
  link: { textAlign: 'center', marginTop: 12, fontSize: 14, color: '#1a6b3c' },
});

