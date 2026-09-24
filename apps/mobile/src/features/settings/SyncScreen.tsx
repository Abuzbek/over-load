import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { requestSync, signOut, useSyncStatus } from '../../sync/syncService';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Screen } from '../../ui/Screen';
import { SectionLabel } from '../../ui/SectionLabel';
import { Sheet } from '../../ui/Sheet';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';

/**
 * The account this phone syncs with. Screens read the phone's copy; the
 * account in Firestore is what survives the phone. Signing out removes the
 * copy from this phone, after a last sync.
 */
export function SyncScreen() {
  const status = useSyncStatus();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [unsynced, setUnsynced] = useState(0);

  if (!status.enabled || !status.account) {
    return (
      <Screen scroll>
        <Card>
          <Text variant="heading">Not set up in this build</Text>
          <Text color="textMuted">
            This build has no Firebase configuration, so everything stays on this phone.
          </Text>
        </Card>
      </Screen>
    );
  }

  const leave = async (force: boolean) => {
    setBusy(true);
    setError(null);
    try {
      setUnsynced((await signOut({ force })).unsynced);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
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
        Signing out removes your training from this phone. It stays in your account and comes back when you sign in.
      </Text>
      <Button title="Sign out" variant="destructive" disabled={busy} onPress={() => void leave(false)} />
      {error ? <Text color="danger">{error}</Text> : null}

      <Sheet
        visible={unsynced > 0}
        onRequestClose={() => setUnsynced(0)}
        anchor="bottom"
        title="Not everything is backed up"
        body={`${unsynced} ${unsynced === 1 ? 'change has' : 'changes have'} not reached your account yet — probably no connection. Signing out now loses ${unsynced === 1 ? 'it' : 'them'}.`}
      >
        <Button title="Stay signed in" onPress={() => setUnsynced(0)} />
        <Button title="Sign out anyway" variant="destructive" disabled={busy} onPress={() => void leave(true)} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: theme.spacing.md },
});
