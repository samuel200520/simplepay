import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView, Alert
} from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function RegisterScreen({ navigation }) {
  const { register } = useAuth();
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!form.full_name || !form.phone || !form.password) {
      Alert.alert('Error', 'Please fill in all required fields'); return;
    }
    setLoading(true);
    try {
      await register(form);
    } catch (err) {
      Alert.alert('Registration Failed', err.response?.data?.error || 'Please try again');
    } finally {
      setLoading(false);
    }
  };

  const update = (field) => (value) => setForm({ ...form, [field]: value });

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.logoBox}>
          <Text style={styles.logo}>Simple<Text style={styles.logoGreen}>Pay</Text></Text>
          <Text style={styles.logoSub}>Unified Payments · Sierra Leone</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.heading}>Create account</Text>
          {[
            { field: 'full_name', label: 'Full name', placeholder: 'Mohamed Kamara', type: 'default' },
            { field: 'phone', label: 'Phone number', placeholder: '077 123 456', type: 'phone-pad' },
            { field: 'email', label: 'Email (optional)', placeholder: 'you@example.com', type: 'email-address' },
            { field: 'password', label: 'Password', placeholder: 'Min. 8 characters', type: 'default', secure: true },
          ].map(({ field, label, placeholder, type, secure }) => (
            <View key={field}>
              <Text style={styles.label}>{label}</Text>
              <TextInput style={styles.input} placeholder={placeholder} value={form[field]} onChangeText={update(field)} keyboardType={type} secureTextEntry={!!secure} autoCapitalize="none" />
            </View>
          ))}
          <TouchableOpacity style={styles.btn} onPress={handleRegister} disabled={loading}>
            {loading ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>Create account</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.link}>Already have an account? <Text style={styles.linkGreen}>Sign in</Text></Text>
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
  heading: { fontSize: 20, fontWeight: '600', marginBottom: 16, color: '#1a1a1a' },
  label: { fontSize: 13, color: '#555', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, fontSize: 16, color: '#1a1a1a' },
  btn: { backgroundColor: '#1a6b3c', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 20 },
  btnText: { color: 'white', fontSize: 16, fontWeight: '600' },
  link: { textAlign: 'center', marginTop: 16, fontSize: 14, color: '#888' },
  linkGreen: { color: '#1a6b3c', fontWeight: '500' },
});