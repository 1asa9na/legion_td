import { useEffect, useRef, useState } from "react";
import type { Command, MatchState, TowerState } from "@legion/sim";
import {
  buildCommand,
  lockSend,
  prepareSeconds,
  refusalText,
  rootTowers,
  sellPayout,
  towerByFighter,
  unlockSend,
  type Cell,
  type SendLock,
} from "./board";
import { mountLane, type LanePicture } from "./lane";
import { joinMatch, type MatchConnection } from "./room";
import { bootTelegram, type ShellStatus } from "./telegram";

type Health = "unknown" | "up" | "down";
type RoomStatus = "browser" | "joining" | "open" | "denied";

export function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const laneRef = useRef<LanePicture | null>(null);
  const snapshotRef = useRef<MatchState | null>(null);
  const selectedRef = useRef<Cell | null>(null);
  const matchRef = useRef<MatchConnection | null>(null);
  const initRef = useRef<string | null>(null);
  const [shell, setShell] = useState<ShellStatus>({
    insideTelegram: false,
    userLabel: null,
    initData: null,
  });
  const [health, setHealth] = useState<Health>("unknown");
  const [room, setRoom] = useState<RoomStatus>("browser");
  const [snapshot, setSnapshot] = useState<MatchState | null>(null);
  const [selected, setSelected] = useState<Cell | null>(null);
  const [lock, setLock] = useState<SendLock | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    bootTelegram().then(async (status) => {
      if (cancel) return;
      setShell(status);
      if (!status.initData) {
        setRoom(status.insideTelegram ? "denied" : "browser");
        return;
      }
      initRef.current = status.initData;
      setRoom("joining");
      try {
        const connection = await joinMatch(status.initData);
        if (cancel) {
          connection.leave();
          return;
        }
        attach(connection);
      } catch {
        if (!cancel) setRoom("denied");
      }
    });
    return () => {
      cancel = true;
      matchRef.current?.leave();
    };
  }, []);

  function attach(connection: MatchConnection): void {
    matchRef.current?.leave();
    matchRef.current = connection;
    setSelected(null);
    setLock(null);
    setRefusal(null);
    setSnapshot(connection.snapshot() ?? null);
    connection.onState((state) => {
      if (matchRef.current !== connection) return;
      setSnapshot(state);
      setLock((current) => unlockSend(current, state.tick, false));
    });
    connection.onReport((report) => {
      if (matchRef.current !== connection) return;
      setLock((current) => unlockSend(current, null, true));
      setRefusal(report.ok ? null : refusalText(report.reason));
    });
    setRoom("open");
  }

  snapshotRef.current = snapshot;
  selectedRef.current = selected;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || room !== "open") return;
    let cancel = false;
    let picture: LanePicture | null = null;
    mountLane(host, setSelected)
      .then((mounted) => {
        if (cancel) {
          mounted.destroy();
          return;
        }
        picture = mounted;
        laneRef.current = mounted;
        if (snapshotRef.current) mounted.draw(snapshotRef.current, selectedRef.current);
      })
      .catch((error: unknown) => {
        console.error("lane failed", error);
      });
    return () => {
      cancel = true;
      picture?.destroy();
      laneRef.current = null;
    };
  }, [room]);

  useEffect(() => {
    if (snapshot) laneRef.current?.draw(snapshot, selected);
  }, [snapshot, selected]);

  useEffect(() => {
    let cancel = false;
    fetch("/health")
      .then((response) => {
        if (!cancel) setHealth(response.ok ? "up" : "down");
      })
      .catch(() => {
        if (!cancel) setHealth("down");
      });
    return () => {
      cancel = true;
    };
  }, []);

  function send(command: Command): void {
    const next = lockSend(lock, JSON.stringify(command), snapshot?.tick ?? 0);
    if (!next || !matchRef.current) return;
    setLock(next);
    matchRef.current.send(command);
  }

  async function again(): Promise<void> {
    const initData = initRef.current;
    if (!initData) return;
    matchRef.current?.leave();
    matchRef.current = null;
    setSnapshot(null);
    setRoom("joining");
    try {
      attach(await joinMatch(initData));
    } catch {
      setRoom("denied");
    }
  }

  if (room !== "open" || !snapshot) {
    const telegramLine = shell.insideTelegram
      ? (shell.userLabel ?? "сессия Telegram")
      : "браузер, открой из меню бота";
    const serverLine = health === "up" ? "на связи" : health === "down" ? "не запущен" : "проверка";
    const roomLine = room === "joining" ? "вход" : room === "denied" ? "нет входа" : "из бота";
    return (
      <div className="app">
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

  const built = selected
    ? snapshot.towers.find((tower) => tower.slot === selected.slot && tower.side === selected.side)
    : undefined;

  return (
    <div className="app">
      <div ref={hostRef} className="lane" />
      <header className="summary">
        <p className="eyebrow">Legion TD</p>
        <p>
          {snapshot.gold} · доход {snapshot.income}
        </p>
        <p>Волна {snapshot.waveLevel}</p>
        {snapshot.phase === "prepare" ? (
          <p>Подготовка {prepareSeconds(snapshot.prepareMs)}</p>
        ) : (
          <p>
            Король {Math.ceil(snapshot.kingHp)} / {snapshot.kingMaxHp}
          </p>
        )}
        {snapshot.holdMs > 0 ? <p>волна выходит</p> : null}
      </header>
      <footer className="dock">
        <Dock snapshot={snapshot} selected={selected} built={built} refusal={refusal} send={send} again={() => void again()} />
      </footer>
    </div>
  );
}

function Dock({
  snapshot,
  selected,
  built,
  refusal,
  send,
  again,
}: {
  snapshot: MatchState;
  selected: Cell | null;
  built: TowerState | undefined;
  refusal: string | null;
  send: (command: Command) => void;
  again: () => void;
}) {
  if (snapshot.outcome !== "playing") {
    return (
      <>
        <p>{snapshot.outcome === "cleared" ? "Линия удержана" : "Король пал"}</p>
        <div className="actions">
          <button type="button" onClick={again}>
            Ещё раз
          </button>
        </div>
      </>
    );
  }

  if (!selected) {
    return <p>Выбери клетку</p>;
  }

  if (!built) {
    return (
      <>
        <div className="actions">
          {rootTowers().map((tower) => (
            <button
              key={tower.fighterId}
              type="button"
              onClick={() => send(buildCommand(tower.fighterId, selected.slot, selected.side))}
            >
              {tower.name} {tower.goldCost}
            </button>
          ))}
        </div>
        {refusal ? <p className="refusal">{refusal}</p> : null}
      </>
    );
  }

  const definition = towerByFighter(built.fighterId);
  const payout = sellPayout(definition?.value ?? 0, definition?.sellGold ?? 0, built.fresh, snapshot.phase);
  const label = payout ?? (built.fresh ? definition?.value : definition?.sellGold);
  return (
    <>
      <p>
        {definition?.name ?? built.fighterId} · {Math.ceil(built.hp)} / {built.maxHp}
      </p>
      <div className="actions">
        {(definition?.upgradesTo ?? []).map((fighterId) => {
          const next = towerByFighter(fighterId);
          if (!next) return null;
          return (
            <button key={fighterId} type="button" onClick={() => send({ type: "upgrade", id: built.id, fighterId })}>
              {next.name} {next.goldCost}
            </button>
          );
        })}
        <button type="button" disabled={payout === null} onClick={() => send({ type: "sell", id: built.id })}>
          Продажа {label}
        </button>
      </div>
      {refusal ? <p className="refusal">{refusal}</p> : null}
    </>
  );
}
