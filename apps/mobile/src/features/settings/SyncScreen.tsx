import { useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import {
  confirmPhoneCode,
  sendPhoneCode,
  signInWithApple,
  signInWithGoogle,
  signOutOfAccount,
} from '../../sync/auth';
import { googleSignInEnabled } from '../../sync/firebase';
import { requestSync, useSyncStatus } from '../../sync/syncService';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Screen } from '../../ui/Screen';
import { SectionLabel } from '../../ui/SectionLabel';
import { Sheet } from '../../ui/Sheet';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';

type Confirmation = Awaited<ReturnType<typeof sendPhoneCode>>;

/**
 * Backup and sync. Everything the app shows is read from the phone; signing in
 * only adds a copy in the account, so a new phone can pick up where this one
 * left off. Signing out keeps the data here.
 */
export function SyncScreen() {
  const status = useSyncStatus();
  const [error, setError] = useState<string | null>(null);
  const [phoneOpen, setPhoneOpen] = useState(false);

  const attempt = (fn: () => Promise<void>) => async () => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      // Closing Apple's or Google's own sheet is not an error worth showing.
      const message = e instanceof Error ? e.message : String(e);
      if (!/cancel/i.test(message)) setError(message);
    }
  };

  if (!status.enabled) {
    return (
      <Screen scroll>
        <Card>
          <Text variant="heading">Not set up in this build</Text>
          <Text color="textMuted">
            Everything is saved on this phone. Backup and sync switch on once the app is built with its Firebase
            configuration.
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      {status.account ? (
        <>
          <SectionLabel>Signed in</SectionLabel>
          <Card style={styles.card}>
            <Text variant="heading">{status.account.label}</Text>
            <Text color={status.error ? 'danger' : 'textMuted'}>
              {status.syncing
                ? 'Syncing…'
                : status.error
                  ? `Last sync failed: ${status.error}`
                  : status.lastSyncedAt
                    ? `Synced at ${new Date(status.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : 'Not synced yet'}
            </Text>
            <Button title="Sync now" variant="secondary" disabled={status.syncing} onPress={() => void requestSync()} />
          </Card>
          <Text variant="caption" color="textMuted">
            Signing out keeps everything on this phone. It stops syncing until you sign in again.
          </Text>
          <Button title="Sign out" variant="destructive" onPress={attempt(signOutOfAccount)} />
        </>
      ) : (
        <>
          <Card style={styles.card}>
            <Text variant="heading">Back up your training</Text>
            <Text color="textMuted">
              Sign in to keep a copy of your workouts, sessions and gyms in your account, and to pick them up on
              another phone.
            </Text>
          </Card>
          <View style={styles.buttons}>
            {Platform.OS === 'ios' ? <Button title="Continue with Apple" onPress={attempt(signInWithApple)} /> : null}
            {googleSignInEnabled ? (
              <Button title="Continue with Google" variant="secondary" onPress={attempt(signInWithGoogle)} />
            ) : null}
            <Button title="Continue with phone number" variant="secondary" onPress={() => setPhoneOpen(true)} />
          </View>
        </>
      )}

      {error ? <Text color="danger">{error}</Text> : null}

      <PhoneSheet visible={phoneOpen} onClose={() => setPhoneOpen(false)} />
    </Screen>
  );
}

/** Number, then the SMS code, in one sheet. */
function PhoneSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [phone, setPhone] = useState('+');
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setConfirmation(null);
    setCode('');
    setError(null);
    onClose();
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onRequestClose={close}
      anchor="bottom"
      title={confirmation ? 'Enter the code' : 'Your phone number'}
      body={confirmation ? `We sent a code to ${phone}.` : 'In international form, starting with +.'}
    >
      {confirmation ? (
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="123456"
          placeholderTextColor={theme.colors.textMuted}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          autoFocus
          style={styles.input}
        />
      ) : (
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="+998 90 123 45 67"
          placeholderTextColor={theme.colors.textMuted}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          autoFocus
          style={styles.input}
        />
      )}
      {error ? <Text color="danger">{error}</Text> : null}
      {confirmation ? (
        <Button
          title="Confirm"
          disabled={busy || code.length < 6}
          onPress={() => void run(async () => {
            await confirmPhoneCode(confirmation, code);
            close();
          })}
        />
      ) : (
        <Button
          title="Send code"
          disabled={busy || phone.replace(/\D/g, '').length < 8}
          onPress={() => void run(async () => setConfirmation(await sendPhoneCode(phone.replace(/[^\d+]/g, ''))))}
        />
      )}
      <Button title="Cancel" variant="ghost" onPress={close} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: { gap: theme.spacing.md },
  buttons: { gap: theme.spacing.sm },
  input: {
    minHeight: 44,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
  },
});
