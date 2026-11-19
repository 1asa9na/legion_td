import { init, initData, miniApp, viewport } from "@telegram-apps/sdk";

export interface ShellStatus {
  insideTelegram: boolean;
  userLabel: string | null;
  initData: string | null;
}

export async function bootTelegram(): Promise<ShellStatus> {
  try {
    init();
  } catch {
    return { insideTelegram: false, userLabel: null, initData: null };
  }

  if (miniApp.mountSync.isAvailable()) {
    miniApp.mountSync();
  }
  if (miniApp.ready.isAvailable()) {
    miniApp.ready();
  }
  if (viewport.mount.isAvailable()) {
    try {
      await viewport.mount();
      if (viewport.expand.isAvailable()) {
        viewport.expand();
      }
    } catch {
      // Viewport metrics are optional for the shell.
    }
  }

  const user = initData.user();
  const userLabel = user?.username ? `@${user.username}` : (user?.first_name ?? null);
  return { insideTelegram: true, userLabel, initData: initData.raw() ?? null };
}
