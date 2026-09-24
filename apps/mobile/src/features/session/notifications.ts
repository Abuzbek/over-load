import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

let scheduledId: string | null = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Android 8+ silently drops any notification posted to a channel that was
// never created — there is no error, it just never appears. iOS has no
// concept of channels, so this is a no-op there. Run once at module load;
// setNotificationChannelAsync is safe to call repeatedly, but a single
// setup call reads more clearly than re-creating it on every schedule.
if (Platform.OS === 'android') {
  void Notifications.setNotificationChannelAsync('rest', {
    name: 'Rest timer',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    enableVibrate: true,
    vibrationPattern: [0, 250, 250, 250],
  });
}

/** Replaces any pending rest notification — only one rest is ever active. */
export async function scheduleRestNotification(seconds: number): Promise<void> {
  await cancelRestNotification();

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    const request = await Notifications.requestPermissionsAsync();
    if (request.status !== 'granted') return;
  }

  scheduledId = await Notifications.scheduleNotificationAsync({
    content: { title: 'Rest complete', body: 'Time for your next set.', sound: true },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      channelId: 'rest',
    },
  });
}

export async function cancelRestNotification(): Promise<void> {
  if (!scheduledId) return;
  await Notifications.cancelScheduledNotificationAsync(scheduledId);
  scheduledId = null;
}
