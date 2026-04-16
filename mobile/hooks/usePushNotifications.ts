/**
 * Expo Push Notification Hook
 *
 * Kullanımı:
 *   const { expoPushToken, registerToken } = usePushNotifications();
 *
 * Kurulum için gerekli Expo paketleri:
 *   npx expo install expo-notifications expo-device
 *
 * .env veya Constants.expoConfig.extra içine ekleyin:
 *   EXPO_PUBLIC_API_URL=https://yerihisset.com
 */

import { useState, useEffect, useRef } from "react";

// expo-notifications ve expo-device paketleri henüz yüklü olmayabilir.
// Bu dosyayı aktif kullanmadan önce şunu çalıştırın:
//   npx expo install expo-notifications expo-device
//
// Kurulumdan sonra aşağıdaki satırların yorumunu kaldırın:
// import * as Device from "expo-device";
// import * as Notifications from "expo-notifications";

// Geçici tip tanımları (expo-notifications kurulana kadar)
type Subscription = { remove: () => void };

let Constants: { expoConfig?: { extra?: Record<string, unknown> } } = {};
try {
  Constants = require("expo-constants").default;
} catch { /* yüklü değil */ }

const API_URL = (Constants.expoConfig?.extra?.apiUrl as string) ?? "";

export interface UsePushNotificationsReturn {
  expoPushToken: string | null;
  notification: unknown;
  permissionStatus: "granted" | "denied" | "undetermined";
  registerToken: () => Promise<void>;
  unregisterToken: () => Promise<void>;
}

export function usePushNotifications(): UsePushNotificationsReturn {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<unknown>(null);
  const [permissionStatus, setPermissionStatus] = useState<"granted" | "denied" | "undetermined">("undetermined");

  const notificationListener = useRef<Subscription | null>(null);
  const responseListener = useRef<Subscription | null>(null);

  useEffect(() => {
    // Dinamik import — paket yüklü değilse sessizce geç
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let Notifications: any = null;
    try {
      Notifications = require("expo-notifications");
    } catch {
      console.warn("expo-notifications yüklü değil. Yüklemek için: npx expo install expo-notifications expo-device");
      return;
    }

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowList: true,
      }),
    });

    notificationListener.current = Notifications.addNotificationReceivedListener((notif: unknown) => {
      console.log("Push bildirimi alındı:", notif);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response: unknown) => {
      setNotification(response);
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  async function registerToken() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let Notifications: any = null;
    try {
      Notifications = require("expo-notifications");
    } catch {
      console.warn("expo-notifications yüklü değil.");
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let Device: any = {};
    try { Device = require("expo-device"); } catch { /* yüklü değil */ }

    if (!Device.isDevice) {
      console.warn("Push bildirimleri yalnızca fiziksel cihazda çalışır.");
      return;
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    setPermissionStatus(finalStatus as "granted" | "denied" | "undetermined");

    if (finalStatus !== "granted") {
      console.warn("Push bildirimi izni reddedildi.");
      return;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : {}
    );
    const token = tokenData.data;
    setExpoPushToken(token);

    // Tokeni backend'e kaydet
    if (API_URL) {
      try {
        await fetch(`${API_URL}/api/push-tokens`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            token,
            platform: Device.osName?.toLowerCase().includes("ios") ? "ios" : "android",
          }),
        });
      } catch (err) {
        console.error("Push token kaydedilemedi:", err);
      }
    }
  }

  async function unregisterToken() {
    if (!expoPushToken || !API_URL) return;
    try {
      await fetch(`${API_URL}/api/push-tokens`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token: expoPushToken }),
      });
      setExpoPushToken(null);
    } catch (err) {
      console.error("Push token silinemedi:", err);
    }
  }

  return { expoPushToken, notification, permissionStatus, registerToken, unregisterToken };
}
