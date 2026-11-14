import { useEffect, useRef, useState } from "react";
import { mountLane } from "./lane";
import { bootTelegram, type ShellStatus } from "./telegram";

type Health = "unknown" | "up" | "down";

export function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [shell, setShell] = useState<ShellStatus>({
    insideTelegram: false,
    userLabel: null,
  });
  const [health, setHealth] = useState<Health>("unknown");

  useEffect(() => {
    let cancel = false;
    bootTelegram().then((status) => {
      if (!cancel) {
        setShell(status);
      }
    });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    let destroy = () => {};
    let cancel = false;
    mountLane(host)
      .then((dispose) => {
        if (cancel) {
          dispose();
        } else {
          destroy = dispose;
        }
      })
      .catch((error: unknown) => {
        console.error("lane failed", error);
      });
    return () => {
      cancel = true;
      destroy();
    };
  }, []);

  useEffect(() => {
    let cancel = false;
    fetch("/health")
      .then((response) => {
        if (!cancel) {
          setHealth(response.ok ? "up" : "down");
        }
      })
      .catch(() => {
        if (!cancel) {
          setHealth("down");
        }
      });
    return () => {
      cancel = true;
    };
  }, []);

  const telegramLine = shell.insideTelegram
    ? (shell.userLabel ?? "сессия Telegram")
    : "браузер, открой из меню бота";
  const serverLine =
    health === "up" ? "на связи" : health === "down" ? "не запущен" : "проверка";

  return (
    <div className="app">
      <div ref={hostRef} className="lane" />
      <header className="hud">
        <p className="eyebrow">Legion TD</p>
        <h1>Каркас</h1>
        <p>{telegramLine}</p>
        <p>Сервер: {serverLine}</p>
      </header>
    </div>
  );
}
