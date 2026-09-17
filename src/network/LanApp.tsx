import { useEffect, useRef, useState } from "react";
import { NativeButton, NativeFrame } from "../ui/NativeChrome";
import { LanConnection, LAN_SHIPS } from "./protocol";
import type { Match, Room, Seat } from "./protocol";
import { LanBattle } from "./LanBattle";
import { LanStart } from "./LanStart";
import { NativeBitmapText } from "../ui/NativeBitmapText";
import { Modal } from "../ui/core/UI";
import { ShipStage } from "../studio/ShipStage";
import { modManager } from "../engine/modding/ModManager";
import { runtimeAssetUrl } from "../engine/runtime/RuntimePaths";
import "./lan.css";
export default function LanApp() {
  const [initialHost] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)),
  );
  const autoHost = useRef(initialHost.get("host") === "1");
  const [helpOpen, setHelpOpen] = useState(false);
  const [previewHull, setPreviewHull] = useState(LAN_SHIPS[0].id);
  const [connection] = useState(() => new LanConnection());
  const [name, setName] = useState(
      () => initialHost.get("name")?.slice(0, 24) || "玩家",
    ),
    [code, setCode] = useState(""),
    [id, setId] = useState(""),
    [connecting, setConnecting] = useState(false);
  const [room, setRoom] = useState<Room | null>(null),
    [match, setMatch] = useState<Match | null>(null),
    [ended, setEnded] = useState("");
  const [error, setError] = useState(""),
    [available, setAvailable] = useState<boolean | null>(null),
    [addresses, setAddresses] = useState<string[]>([]),
    [ping, setPing] = useState<number | null>(null);
  useEffect(() => {
    document.title = "远行星号 · 局域网联机";
    const abort = new AbortController();
    fetch("/lan/info", { signal: abort.signal, cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw Error("not LAN server");
        return r.json();
      })
      .then((info) => {
        if (abort.signal.aborted) return;
        setAvailable(!!info.build);
        setAddresses(info.addresses ?? []);
        if (info.build && autoHost.current) {
          setConnecting(true);
          const url = new URL("/lan/ws", window.location.href);
          url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
          connection.connect(
            url.href,
            initialHost.get("name")?.trim().slice(0, 24) || "玩家",
          );
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) setAvailable(false);
      });
    const unsub = connection.subscribe((m) => {
      if (m.type === "welcome") {
        if (autoHost.current) {
          autoHost.current = false;
          history.replaceState(null, "", location.pathname + location.search);
          connection.send({ type: "create" });
        }
        setId(m.id);
        setConnecting(false);
        setError("");
      }
      if (m.type === "room") setRoom(m.room);
      if (m.type === "match") {
        setMatch(m.match);
        setEnded("");
        setError("");
      }
      if (m.type === "ended") {
        setEnded(
          m.winner === "draw"
            ? "双方同归于尽"
            : m.winner
              ? m.winner === "host"
                ? "主机阵营获胜"
                : "客机阵营获胜"
              : m.reason,
        );
      }
      if (m.type === "roomClosed" || m.type === "left") {
        setRoom(null);
        setMatch(null);
        setEnded("");
        if (m.message) setError(m.message);
      }
      if (m.type === "disconnected") {
        setId("");
        setConnecting(false);
        setRoom(null);
        setMatch(null);
        setError(
          (previous) =>
            previous || "与服务器断开连接。请重新连接；首版不支持断线续局。",
        );
      }
      if (m.type === "error") {
        setError(m.message);
        setConnecting(false);
      }
      if (m.type === "pong" && typeof m.sent === "number")
        setPing(Math.round(performance.now() - m.sent));
    });
    const pingTimer = setInterval(
      () => connection.send({ type: "ping", sent: performance.now() }),
      2000,
    );
    return () => {
      abort.abort();
      clearInterval(pingTimer);
      unsub();
      connection.close();
    };
  }, [connection, initialHost]);
  const me = room?.members.find((m) => m.id === id);
  const isHost = room?.hostId === id;
  const send = (m: unknown) => {
    setError("");
    if (!connection.send(m)) setError("连接尚未就绪，请重新连接服务器。");
  };
  if (match && me)
    return (
      <LanBattle
        key={match.id}
        connection={connection}
        match={match}
        seat={me.seat as Seat}
        ended={ended}
        onReturn={() => {
          setMatch(null);
          setEnded("");
        }}
      />
    );
  const hull = me?.hull ?? previewHull;
  const spec = modManager.requireShip(hull);
  const shipName = LAN_SHIPS.find((ship) => ship.id === hull)?.name ?? hull;
  const editable = !!room && ["lobby", "ended"].includes(room.status);
  const canStart =
    editable &&
    room.members.length === 2 &&
    room.members.every((member) => member.ready);
  const connect = () => {
    setError("");
    setConnecting(true);
    const url = new URL("/lan/ws", window.location.href);
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    connection.connect(url.href, name.trim());
  };
  return (
    <main className="native-refit-app lan-page">
      <h1 className="native-screen-tab">
        <NativeBitmapText font="caption">局域网联机</NativeBitmapText>
      </h1>
      <span className="lan-screen-meta">双人对决 · 内置配装</span>
      <NativeFrame className="lan-shell">
        <aside
          className="lan-roster-panel"
          aria-label={room ? "房间成员" : "预设舰船"}
        >
          <h2 className="lan-section-title">
            <NativeBitmapText font="caption">
              {room ? "参战玩家" : "预设舰船"}
            </NativeBitmapText>
            <span>{room ? room.members.length + " / 2" : "2 艘"}</span>
          </h2>
          {room ? (
            <div className="lan-roster">
              {[0, 1].map((seat) => {
                const member = room.members.find((m) => m.seat === seat);
                return member ? (
                  <article
                    className="lan-member"
                    data-local={member.id === id}
                    key={member.id}
                  >
                    <div className="lan-member-heading">
                      <strong>
                        {member.name}
                        {member.id === id ? "（你）" : ""}
                      </strong>
                      <span>{seat === 0 ? "主机" : "玩家"}</span>
                    </div>
                    <img
                      src={runtimeAssetUrl(
                        modManager.requireShip(member.hull).spriteUrl,
                      )}
                      alt=""
                    />
                    <p>{LAN_SHIPS.find((s) => s.id === member.hull)?.name}级</p>
                    <span className={member.ready ? "lan-ready" : "lan-muted"}>
                      {member.ready ? "已准备" : "未准备"}
                    </span>
                  </article>
                ) : (
                  <article className="lan-member lan-member-empty" key={seat}>
                    <span className="lan-empty-mark" aria-hidden="true">
                      ＋
                    </span>
                    <strong>等待玩家加入</strong>
                    <span>分享地址与房间码</span>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="lan-ship-list">
              {LAN_SHIPS.map((ship) => (
                <button
                  type="button"
                  className="lan-ship-choice"
                  aria-pressed={hull === ship.id}
                  key={ship.id}
                  onClick={() => setPreviewHull(ship.id)}
                >
                  <img
                    src={runtimeAssetUrl(
                      modManager.requireShip(ship.id).spriteUrl,
                    )}
                    alt=""
                  />
                  <strong>{ship.name}级</strong>
                  <span>战列舰 · 内置配装</span>
                </button>
              ))}
            </div>
          )}
          <div className="lan-roster-note">
            <span className="lan-muted">对局规则</span>
            <p>一人一舰 · 正面对决</p>
            <p>双方准备后由主机开始。</p>
          </div>
        </aside>
        <section className="lan-vessel-panel" aria-label="舰船预览">
          <div className="refit-grid" aria-hidden="true" />
          <div className="lan-vessel-heading">
            <h2>
              <NativeBitmapText>{shipName + "级"}</NativeBitmapText>
            </h2>
            <span>战列舰 / 内置预设</span>
          </div>
          <div className="lan-vessel">
            <ShipStage spec={spec} home />
          </div>
          <div className="lan-vessel-caption">
            <span className="lan-muted">
              {room ? "你的参战舰船" : "舰船预览"}
            </span>
            <p>
              {hull === "onslaught"
                ? "重甲舰体 · 弹道火力"
                : "全向护盾 · 能量火力"}
            </p>
            {room && (
              <fieldset className="lan-hull-picker" disabled={!editable}>
                <legend>选择舰船</legend>
                {LAN_SHIPS.map((ship) => (
                  <NativeButton
                    key={ship.id}
                    aria-pressed={hull === ship.id}
                    onClick={() => send({ type: "configure", hull: ship.id })}
                  >
                    {ship.name}
                  </NativeButton>
                ))}
              </fieldset>
            )}
            <small>
              {room
                ? "更换舰船将取消准备状态"
                : "连接服务器后，可创建房间或加入朋友"}
            </small>
          </div>
        </section>
        <aside className="lan-command-panel" aria-label="联机控制">
          <section className="lan-connection-status">
            <h2 className="lan-section-title">
              <NativeBitmapText font="caption">服务器连接</NativeBitmapText>
              <span className={id ? "lan-ready" : "lan-muted"}>
                {id ? "已连接" : connecting ? "连接中" : "未连接"}
              </span>
            </h2>
            <p className="lan-address">{window.location.host}</p>
            {id && (
              <p className="lan-muted">
                {name} · 往返延迟 {ping === null ? "测量中" : ping + " ms"}
              </p>
            )}
          </section>
          {error && (
            <p className="lan-error" role="alert">
              {error}
            </p>
          )}
          {available === false ? (
            <LanStart />
          ) : !id ? (
            <form
              className="lan-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (name.trim() && !connecting && available === true) connect();
              }}
            >
              <label htmlFor="lan-name">玩家名称</label>
              <input
                id="lan-name"
                value={name}
                maxLength={24}
                onChange={(event) => setName(event.target.value)}
                autoComplete="nickname"
              />
              <NativeButton
                type="submit"
                disabled={!name.trim() || connecting || available !== true}
              >
                {connecting ? "正在连接…" : "连接服务器"}
              </NativeButton>
              <p className="lan-muted">
                {available === null
                  ? "正在检查联机服务…"
                  : "所有玩家需打开同一服务器的页面。"}
              </p>
            </form>
          ) : !room ? (
            <div className="lan-room-entry">
              <h2 className="lan-section-title">
                <NativeBitmapText font="caption">建立对局</NativeBitmapText>
              </h2>
              <NativeButton onClick={() => send({ type: "create" })}>
                创建双人房间
              </NativeButton>
              <form
                className="lan-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (/^[0-9A-F]{6}$/.test(code)) send({ type: "join", code });
                }}
              >
                <label htmlFor="lan-code-input">加入朋友的房间</label>
                <input
                  id="lan-code-input"
                  aria-label="房间码"
                  value={code}
                  maxLength={6}
                  onChange={(event) =>
                    setCode(event.target.value.toUpperCase())
                  }
                  placeholder="六位房间码"
                  autoComplete="off"
                  spellCheck={false}
                />
                <NativeButton
                  type="submit"
                  disabled={!/^[0-9A-F]{6}$/.test(code)}
                >
                  加入房间
                </NativeButton>
              </form>
            </div>
          ) : (
            <section className="lan-room-details">
              <h2 className="lan-section-title">
                <NativeBitmapText font="caption">当前房间</NativeBitmapText>
                <span>{isHost ? "你是主机" : "已加入"}</span>
              </h2>
              <div className="lan-room-code">
                <span>房间码</span>
                <strong className="lan-code">{room.code}</strong>
              </div>
              <p className="lan-muted" role="status">
                {room.status === "loading"
                  ? "正在准备战斗…"
                  : room.members.length < 2
                    ? "等待另一位玩家加入"
                    : canStart
                      ? isHost
                        ? "双方已准备，可以开始战斗"
                        : "双方已准备，等待主机开始"
                      : "等待双方确认准备"}
              </p>
              {room.reason && (
                <p className="lan-last-match">上一局：{room.reason}</p>
              )}
            </section>
          )}
          <section className="lan-specs" aria-label="舰船参数">
            <h2 className="lan-section-title">
              <NativeBitmapText font="caption">舰船参数</NativeBitmapText>
              <span>基础值</span>
            </h2>
            <dl>
              <div>
                <dt>舰体结构</dt>
                <dd>{spec.hitpoints}</dd>
              </div>
              <div>
                <dt>舰体装甲</dt>
                <dd>{spec.armorRating}</dd>
              </div>
              <div>
                <dt>最高航速</dt>
                <dd>{spec.maxSpeed}</dd>
              </div>
              <div>
                <dt>幅能容量</dt>
                <dd>{spec.maxFlux}</dd>
              </div>
              <div>
                <dt>幅能耗散</dt>
                <dd>{spec.fluxDissipation}</dd>
              </div>
              <div>
                <dt>护盾角度</dt>
                <dd>{spec.shieldArcDeg}°</dd>
              </div>
            </dl>
          </section>
          {room && (
            <div className="lan-actions">
              <NativeButton
                disabled={!editable}
                onClick={() => send({ type: "ready", ready: !me?.ready })}
              >
                {me?.ready ? "取消准备" : "准备"}
              </NativeButton>
              {isHost && (
                <NativeButton
                  disabled={!canStart}
                  onClick={() => send({ type: "start" })}
                >
                  开始战斗
                </NativeButton>
              )}
            </div>
          )}
        </aside>
        <footer className="lan-footer">
          <span className="lan-muted">
            {room ? "退出或断线将结束本局" : "同一局域网 · 无需公网 IP"}
          </span>
          <div>
            <NativeButton onClick={() => setHelpOpen(true)}>
              联机说明
            </NativeButton>
            {room && (
              <NativeButton onClick={() => send({ type: "leave" })}>
                离开房间
              </NativeButton>
            )}
            <NativeButton
              onClick={() => {
                connection.close();
                window.location.assign("./");
              }}
            >
              返回主菜单
            </NativeButton>
          </div>
        </footer>
      </NativeFrame>
      {helpOpen && (
        <Modal
          title="局域网联机"
          eyebrow=""
          onClose={() => setHelpOpen(false)}
          footer={
            <NativeButton onClick={() => setHelpOpen(false)}>返回</NativeButton>
          }
        >
          <div className="lan-help">
            <h3>邀请朋友</h3>
            <p>朋友打开下方地址，连接服务器，再输入你的六位房间码。</p>
            {addresses.length ? (
              addresses.map((address) => (
                <p key={address}>
                  <a href={address}>{address}</a>
                </p>
              ))
            ) : (
              <p>启动联机服务后，终端会显示可用的局域网地址。</p>
            )}
            <p>
              建议使用有线连接，并允许 Windows 专用网络通信。无需公网 IP
              或端口转发。
            </p>
            <h3>n2n / Radmin VPN</h3>
            <p>
              异地玩家先加入同一个虚拟网络，再打开房主虚拟网卡对应的地址。只有房主需要后台；加入者不需要另开服务器。虚拟网络须允许玩家之间访问
              TCP 3001，具体还受防火墙与网络路由影响。
            </p>
            <h3>对局方式</h3>
            <p>
              创建房间的玩家负责战斗计算，服务器转发信息。双方准备后由主机开始；更换舰船会取消准备。
            </p>
            <h3>当前版本</h3>
            <p>
              双人、两艘预设舰船。菜单不会暂停战斗；任何玩家退出或断线都会结束本局。暂不支持自定义配装、十人百舰、断线续局和主机迁移。
            </p>
            <p>大厅延迟为服务器往返时间，不代表完整操作延迟。</p>
          </div>
        </Modal>
      )}
    </main>
  );
}
