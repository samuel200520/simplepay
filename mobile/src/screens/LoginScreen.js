import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView, Alert
} from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!phone || !password) { Alert.alert('Error', 'Please fill in all fields'); return; }
    setLoading(true);
    try {
      await login(phone, password);
    } catch (err) {
      Alert.alert('Login Failed', err.response?.data?.error || 'Check your details and try again');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.logoBox}>
          <Text style={styles.logo}>Simple<Text style={styles.logoGreen}>Pay</Text></Text>
          <Text style={styles.logoSub}>Unified Payments · Sierra Leone</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.heading}>Sign in</Text>
          <Text style={styles.label}>Phone number</Text>
          <TextInput style={styles.input} placeholder="077 123 456" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoCapitalize="none" />
          <Text style={styles.label}>Password</Text>
          <TextInput style={styles.input} placeholder="Your password" value={password} onChangeText={setPassword} secureTextEntry />
          <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>Sign in</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Register')}>
            <Text style={styles.link}>No account? <Text style={styles.linkGreen}>Create one</Text></Text>
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