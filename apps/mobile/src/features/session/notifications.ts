import * as Notifications from 'expo-notifications';

let scheduledId: string | null = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Replaces any pending rest notification — only one rest is ever active. */
export async function scheduleRestNotification(seconds: number): Promise<void> {
  await cancelRestNotification();

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    const request = await Notifications.requestPermissionsAsync();
    if (request.status !== 'granted') return;
  }

  scheduledId = await Notifications.scheduleNotificationAsync({
    content: { title: 'Rest complete', body: 'Time for your next set.' },
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
