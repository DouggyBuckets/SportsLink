import { AlertButton, Alert as NativeAlert } from "react-native";

// Drop-in for React Native's Alert. On web, react-native-web's Alert.alert
// does nothing at all, so confirmations and error messages fall back to the
// browser's own dialogs. Every alert in the app is either a message (OK only)
// or Cancel plus one action, which window.alert / window.confirm cover.
export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[]) {
    if (process.env.EXPO_OS !== "web") {
      NativeAlert.alert(title, message, buttons);
      return;
    }
    const text = message ? `${title}\n\n${message}` : title;
    const actions = (buttons ?? []).filter((b) => b.style !== "cancel");
    const hasCancel = actions.length < (buttons ?? []).length;
    if (hasCancel) {
      if (window.confirm(text)) actions[0]?.onPress?.();
    } else {
      window.alert(text);
      actions[0]?.onPress?.();
    }
  },
  // iOS only; other platforms show their own input instead (see settings).
  prompt: NativeAlert.prompt,
};
