import { Bot } from "grammy";

export async function registerMenuButton(): Promise<void> {
  const token = process.env.BOT_TOKEN;
  const url = process.env.WEBAPP_URL;
  if (!token || !url) {
    console.log("menu button skipped: BOT_TOKEN or WEBAPP_URL is empty");
    return;
  }

  try {
    const bot = new Bot(token);
    await bot.api.setChatMenuButton({
      menu_button: {
        type: "web_app",
        text: "Играть",
        web_app: { url },
      },
    });
    console.log("menu button set");
  } catch (error) {
    console.error("menu button failed", error);
  }
}
