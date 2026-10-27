import { isRunningInExpoGo } from "expo";
import type * as NotificationsModule from "expo-notifications";
import { Platform } from "react-native";
import { placeName } from "@/lib/locations";
import { sportMeta } from "@/lib/sports";
import { Game } from "@/lib/types";

// Loaded only where it works. In Expo Go on Android, merely importing
// expo-notifications (SDK 57) throws "Cannot find native module
// 'ExpoTopicSubscriptionModule'" (use a development build to test reminders
// on Android). Browsers can't schedule local notifications at all.
const Notifications: typeof NotificationsModule | null =
  Platform.OS === "web" || (Platform.OS === "android" && isRunningInExpoGo()) ? null : require("expo-notifications");

Notifications?.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

const REMINDER_LEAD_MS = 2 * 60 * 60_000;
const REMINDER_PREFIX = "game-";
const reminderId = (gameId: string) => `${REMINDER_PREFIX}${gameId}`;
const reminderBody = (game: Game) => `Still in for ${placeName(game)}? Confirm your spot so the group knows who's coming.`;
const fireTime = (game: Game) => new Date(new Date(game.startsAt).getTime() - REMINDER_LEAD_MS);

async function schedule(Notifications: typeof NotificationsModule, game: Game) {
  const fireAt = fireTime(game);
  if (fireAt.getTime() <= Date.now()) return;
  await Notifications.scheduleNotificationAsync({
    identifier: reminderId(game.id),
    content: {
      title: `${sportMeta(game.sport).name} in 2 hours`,
      body: reminderBody(game),
      data: { gameId: game.id, startsAt: game.startsAt },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
  });
}

// Local "still in?" nudge two hours before kickoff - the cheapest no-show
// defence there is. Asking permission is deferred to the first join so the
// prompt arrives with obvious context. Never throws: reminders are a nicety.
export async function scheduleGameReminder(game: Game) {
  if (!Notifications) return;
  try {
    if (fireTime(game).getTime() <= Date.now()) return;
    const { granted } = await Notifications.requestPermissionsAsync();
    if (granted) await schedule(Notifications, game);
  } catch {}
}

export async function cancelGameReminder(gameId: string) {
  if (!Notifications) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(reminderId(gameId));
  } catch {}
}

// Reminders live on this device only, so they go stale when someone else
// changes a game: the host cancels or moves it. After each load from the
// server, drop reminders for games the viewer is no longer in (or that
// changed) and schedule any that are missing. Never asks for permission.
export async function syncGameReminders(games: Game[], meId: string | undefined) {
  if (!Notifications) return;
  try {
    const wanted = new Map(
      games.filter((g) => g.status === "open" && g.participants.some((p) => p.user.id === meId)).map((g) => [reminderId(g.id), g])
    );
    for (const n of await Notifications.getAllScheduledNotificationsAsync()) {
      if (!n.identifier.startsWith(REMINDER_PREFIX)) continue;
      const game = wanted.get(n.identifier);
      if (game && n.content.data?.startsAt === game.startsAt && n.content.body === reminderBody(game)) {
        wanted.delete(n.identifier);
      } else {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
    const { granted } = await Notifications.getPermissionsAsync();
    if (!granted) return;
    for (const game of wanted.values()) await schedule(Notifications, game);
  } catch {}
}

export async function cancelAllGameReminders() {
  if (!Notifications) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {}
}
