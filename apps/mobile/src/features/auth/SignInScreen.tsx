import { useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  confirmPhoneCode,
  confirmTelegramCode,
  sendPhoneCode,
  sendTelegramCode,
  signInWithApple,
  signInWithGoogle,
} from '../../sync/auth';
import { googleSignInEnabled } from '../../sync/firebase';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';

type Confirmation = Awaited<ReturnType<typeof sendPhoneCode>>;

/**
 * Shown before anything else while nobody is signed in. An account is
 * required: your training lives in it, and this phone keeps a copy.
 */
export function SignInScreen() {
  const insets = useSafeAreaInsets();
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

  return (
    <View style={[styles.root, { paddingTop: insets.top + theme.spacing.xxl, paddingBottom: insets.bottom + theme.spacing.xl }]}>
      <View style={styles.hero}>
        <Text variant="display">Overload</Text>
        <Text color="textMuted">
          Sign in to start. Your workouts, sessions and history are kept in your account, so they are safe and follow
          you to a new phone.
        </Text>
      </View>
      <View style={styles.buttons}>
        {Platform.OS === 'ios' ? <Button title="Continue with Apple" onPress={attempt(signInWithApple)} /> : null}
        {googleSignInEnabled ? (
          <Button title="Continue with Google" variant="secondary" onPress={attempt(signInWithGoogle)} />
        ) : null}
        <Button title="Continue with phone number" variant="secondary" onPress={() => setPhoneOpen(true)} />
        {error ? <Text color="danger">{error}</Text> : null}
      </View>
      <PhoneSheet visible={phoneOpen} onClose={() => setPhoneOpen(false)} />
    </View>
  );
}

/** A code on its way: through Telegram (a server request id) or by SMS (Firebase's own confirmation). */
type Pending = { via: 'telegram'; requestId: string } | { via: 'sms'; confirmation: Confirmation };

/**
 * Number, then the code, in one sheet. Telegram first — cheaper, and it
 * arrives in the "Verification Codes" chat — with SMS as the way out when the
 * number has no Telegram or the code does not come.
 */
function PhoneSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [phone, setPhone] = useState('+');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const number = phone.replace(/[^\d+]/g, '');
  const close = () => {
    setPending(null);
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

  const viaTelegram = () => run(async () => setPending({ via: 'telegram', requestId: await sendTelegramCode(number) }));
  const viaSms = () => {
    setCode('');
    return run(async () => setPending({ via: 'sms', confirmation: await sendPhoneCode(number) }));
  };
  const confirm = () =>
    run(async () => {
      if (pending?.via === 'telegram') await confirmTelegramCode(pending.requestId, code);
      else if (pending?.via === 'sms') await confirmPhoneCode(pending.confirmation, code);
      close();
    });

  return (
    <Sheet
      visible={visible}
      onRequestClose={close}
      anchor="bottom"
      title={pending ? 'Enter the code' : 'Your phone number'}
      body={
        pending?.via === 'telegram'
          ? `We sent a code to ${phone} in Telegram, in the "Verification Codes" chat.`
          : pending
            ? `We sent a code to ${phone} by SMS.`
            : 'In international form, starting with +.'
      }
    >
      {pending ? (
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
      {pending ? (
        <>
          <Button title="Confirm" disabled={busy || code.length < 6} onPress={() => void confirm()} />
          {pending.via === 'telegram' ? (
            <Button title="No code? Send an SMS instead" variant="secondary" disabled={busy} onPress={() => void viaSms()} />
          ) : null}
        </>
      ) : (
        <>
          <Button title="Send code via Telegram" disabled={busy || number.length < 9} onPress={() => void viaTelegram()} />
          <Button title="Send code by SMS" variant="secondary" disabled={busy || number.length < 9} onPress={() => void viaSms()} />
        </>
      )}
      <Button title="Cancel" variant="ghost" onPress={close} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.xl,
    backgroundColor: theme.colors.background,
  },
  hero: { gap: theme.spacing.md },
  buttons: { gap: theme.spacing.sm },
  input: {
    minHeight: 44,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
  },
});
