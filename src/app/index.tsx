import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { supabase } from '@/lib/supabase';

// Placeholder home screen. Confirms the app can reach Supabase until auth lands in step (b).
export default function Home() {
  const [status, setStatus] = useState('Checking Supabase…');

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ error }) => setStatus(error ? `Supabase error: ${error.message}` : 'Connected to Supabase'))
      .catch((e: Error) => setStatus(`Supabase error: ${e.message}`));
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sportslink</Text>
      <Text>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontSize: 28, fontWeight: '700' },
});
