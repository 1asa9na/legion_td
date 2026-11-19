import { useEffect, useRef, useState } from "react";
import { mountLane } from "./lane";
import { joinMatch } from "./room";
import { bootTelegram, type ShellStatus } from "./telegram";

type Health = "unknown" | "up" | "down";
type RoomStatus = "browser" | "joining" | "open" | "denied";

export function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [shell, setShell] = useState<ShellStatus>({
    insideTelegram: false,
    userLabel: null,
    initData: null,
  });
  const [health, setHealth] = useState<Health>("unknown");
  const [room, setRoom] = useState<RoomStatus>("browser");

  useEffect(() => {
    let cancel = false;
    let leave = () => {};
    bootTelegram().then(async (status) => {
      if (cancel) return;
      setShell(status);
      if (!status.initData) {
        setRoom(status.insideTelegram ? "denied" : "browser");
        return;
      }
      setRoom("joining");
      try {
        const connection = await joinMatch(status.initData);
        if (cancel) {
          connection.leave();
          return;
        }
        leave = connection.leave;
        setRoom("open");
      } catch {
        if (!cancel) setRoom("denied");
      }
    });
    return () => {
      cancel = true;
      leave();
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
  const roomLine =
    room === "open" ? "в матче" : room === "joining" ? "вход" : room === "denied" ? "нет входа" : "из бота";

  return (
    <div className="app">
      <div ref={hostRef} className="lane" />
      <header className="hud">
        <p className="eyebrow">Legion TD</p>
        <h1>Каркас</h1>
        <p>{telegramLine}</p>
        <p>Сервер: {serverLine}</p>
        <p>Комната: {roomLine}</p>
      </header>
    </div>
  );
}
