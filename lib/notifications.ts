import * as Notifications from "expo-notifications";
import { placeName } from "@/lib/locations";
import { sportMeta } from "@/lib/sports";
import { Game } from "@/lib/types";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

const REMINDER_LEAD_MS = 2 * 60 * 60_000;
const reminderId = (gameId: string) => `game-${gameId}`;

// Local "still in?" nudge two hours before kickoff - the cheapest no-show
// defence there is. Asking permission is deferred to the first join so the
// prompt arrives with obvious context. Never throws: reminders are a nicety.
export async function scheduleGameReminder(game: Game) {
  try {
    const fireAt = new Date(new Date(game.startsAt).getTime() - REMINDER_LEAD_MS);
    if (fireAt.getTime() <= Date.now()) return;
    const { granted } = await Notifications.requestPermissionsAsync();
    if (!granted) return;
    await Notifications.scheduleNotificationAsync({
      identifier: reminderId(game.id),
      content: {
        title: `${sportMeta(game.sport).name} in 2 hours`,
        body: `Still in for ${placeName(game)}? Confirm your spot so the group knows who's coming.`,
        data: { gameId: game.id },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
    });
  } catch {}
}

export async function cancelGameReminder(gameId: string) {
  try {
    await Notifications.cancelScheduledNotificationAsync(reminderId(gameId));
  } catch {}
}
