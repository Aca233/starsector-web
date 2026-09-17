import { readBattleSize } from "../engine/runtime/BattleSizeSettings";
import { normalizeBattleSize } from "../shared/battle-size.mjs";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { NativeButton, NativeFrame } from "../ui/NativeChrome";
import { LanConnection, LAN_SHIPS, teamName } from "./protocol";
import type { Match, Room, Seat } from "./protocol";
import { LanBattle } from "./LanBattle";
import { LanBattleReport } from "./LanBattleReport";
import type { BattleEnded } from "./battle-report.mjs";
import { LanStart } from "./LanStart";
import { NativeBitmapText } from "../ui/NativeBitmapText";
import { Modal } from "../ui/core/UI";
import { readSelectedDesign, rememberSelectedDesign } from "./LanDesign";
import type { Design } from "../studio/DesignModel";
import "./lan.css";
const LanRoomWorkbench = lazy(() => import("./LanRoomWorkbench").then(m=>({default:m.LanRoomWorkbench})));
type RoomEntryIntent = {type:"create";battleSize:number} | {type:"join";code:string;password:string};
export default function LanApp() {
  const [workbenchRoom, setWorkbenchRoom] = useState<Room|null>(null);
  const [lastIdentity,setLastIdentity] = useState("");
  const leavingWorkbench = useRef(false);
  const [carried] = useState(readSelectedDesign);
  const [selectedDesign, setSelectedDesign] = useState<Design | null>(carried.design);
  const selectedRef = useRef(selectedDesign);
  const pendingDesign = useRef(false);
  const entryIntent = useRef<RoomEntryIntent|null>(null);
  const [entering,setEntering] = useState(false);
  const [initialHost] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)),
  );
  const autoHost = useRef(initialHost.get("host") === "1");
  const autoGuest = useRef(initialHost.get("connect") === "1");
  const [reconnecting, setReconnecting] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [previewHull] = useState(() => LAN_SHIPS.find(ship=>ship.id===initialHost.get("hull"))?.id ?? LAN_SHIPS[0].id);
  const presetRef = useRef(previewHull);
  const [connection] = useState(() => new LanConnection());
  const [name, setName] = useState(
      () =>
        initialHost.get("name")?.slice(0, 24) ||
        connection.saved?.name ||
        "玩家",
    ),
    [initialCode] = useState(
      () =>
        new URLSearchParams(location.search)
          .get("room")
          ?.toUpperCase()
          .slice(0, 6) || "",
    ),
    [id, setId] = useState(""),
    [connecting, setConnecting] = useState(false);
  const [room, setRoom] = useState<Room | null>(null),
    [match, setMatch] = useState<Match | null>(null),
    [ended, setEnded] = useState<BattleEnded|null>(null);
  const activeMatch = useRef<Match|null>(null);
  const [lastBattle,setLastBattle] = useState<{match:Match;result:BattleEnded}|null>(null);
  const [reportOpen,setReportOpen] = useState(false);
  const [error, setError] = useState(carried.error),
    [available, setAvailable] = useState<boolean | null>(null),
    [addresses, setAddresses] = useState<string[]>([]);
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
        if (info.build && (autoHost.current || autoGuest.current || connection.saved)) {
          setConnecting(true);
          const url = new URL("/lan/ws", window.location.href);
          url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
          connection.connect(
            url.href,
            initialHost.get("name")?.trim().slice(0, 24) ||
              connection.saved?.name ||
              "玩家",
          );
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) setAvailable(false);
      });
    const unsub = connection.subscribe((m) => {
      if (m.type === "welcome") {
        setReconnecting("");
        if (m.resumed && !m.hasRoom) {
          setRoom(null);
          setMatch(null);
        }
        if (autoGuest.current) {
          autoGuest.current = false;
          history.replaceState(null,"",location.pathname+location.search);
        }
        if (autoHost.current) {
          autoHost.current = false;
          history.replaceState(null, "", location.pathname + location.search);
          if (!m.hasRoom) entryIntent.current = {type:"create", battleSize:initialHost.has("battleSize") ? normalizeBattleSize(Number(initialHost.get("battleSize"))) : readBattleSize()};
        }
        if (entryIntent.current && !m.hasRoom) {
          pendingDesign.current = true;
          setEntering(true);
          connection.send(entryIntent.current);
        } else if (m.hasRoom) entryIntent.current = null;
        setLastIdentity(m.id);
        setId(m.id);
        setConnecting(false);
        setError("");
      }
      if (m.type === "room") {
        entryIntent.current=null;setEntering(false);
        setRoom(m.room);
        if (m.room.match) activeMatch.current = m.room.match;
        if(!leavingWorkbench.current)setWorkbenchRoom(m.room);
        if (pendingDesign.current && ["lobby","ended"].includes(m.room.status)) {
          pendingDesign.current = false;
          const design = selectedRef.current;
          connection.send({type:"configure", hull:design?.hullId ?? presetRef.current, design});
        }
      }
      if (m.type === "match") {
        activeMatch.current = m.match;
        setReportOpen(false);
        setMatch((previous) =>
          previous?.id === m.match.id ? previous : m.match,
        );
        setEnded(null);
        setError("");
      }
      if (m.type === "ended") {
        const finishedMatch = activeMatch.current;
        if (finishedMatch?.id === m.matchId) {
          const result:BattleEnded = {matchId:m.matchId, reason:m.reason || (m.winner === "draw" ? "平局" : typeof m.winner === "number" ? teamName(m.winner)+"获胜" : "本局已中断"), winner:m.winner, report:m.report};
          setEnded(result); setLastBattle({match:finishedMatch,result});
        }
      }
      if (m.type === "roomClosed" || m.type === "left") {
        activeMatch.current = null;
        setReportOpen(false);
        entryIntent.current=null;setEntering(false);
        if(leavingWorkbench.current){setWorkbenchRoom(null);leavingWorkbench.current=false;}
        setRoom(null);
        setMatch(null);
        setEnded(null);
        if (m.message) setError(m.message);
      }
      if (m.type === "reconnecting") {
        setReconnecting("连接中断，正在自动重连（席位保留 30 秒）…");
        setConnecting(true);
      }
      if (m.type === "disconnected") {
        entryIntent.current=null;setEntering(false);
        setReconnecting("");
        setId("");
        setConnecting(false);
        setRoom(null);
        setMatch(null);
        setError(
          (previous) =>
            previous || m.reason || "与服务器断开连接，请重新连接。",
        );
      }
      if (m.type === "error") {
        entryIntent.current=null;setEntering(false);
        if(!m.requestId)setError(m.message);
        setConnecting(false);
      }
    });
    return () => {
      abort.abort();
      unsub();
      connection.close(false);
    };
  }, [connection, initialHost]);
  const me=room?.members.find(member=>member.id===id);
  const send=(message:unknown)=>{
    setError("");
    if(!connection.ready||!connection.send(message)){setError("连接尚未就绪，请重新连接服务器。");return false;}
    return true;
  };
  const enterRoom=(intent:RoomEntryIntent)=>{
    if(!name.trim()||available!==true||connecting||entering||entryIntent.current)return;
    entryIntent.current=intent;setError("");setEntering(true);
    if(connection.ready){
      pendingDesign.current=true;
      if(!send(intent)){entryIntent.current=null;setEntering(false);}
    }else{
      setConnecting(true);
      const url=new URL("/lan/ws",window.location.href);
      url.protocol=location.protocol==="https:"?"wss:":"ws:";
      connection.connect(url.href,name.trim());
    }
  };
  if(match&&me)return <LanBattle key={match.id} connection={connection} match={match} seat={me.seat as Seat} ended={ended}
    onReturn={()=>{setMatch(null);setEnded(null);}}/>;
  if(workbenchRoom)return <><Suspense fallback={<div className="native-loading">正在打开房间改装台…</div>}>
    <LanRoomWorkbench key={workbenchRoom.code} room={workbenchRoom} id={id||lastIdentity} active={room?.code===workbenchRoom.code&&!!id}
      connection={connection} addresses={addresses} message={error||reconnecting} initial={selectedDesign}
      onViewReport={lastBattle && workbenchRoom.match?.id === lastBattle.match.id ? ()=>setReportOpen(true) : undefined}
      onConfirmed={next=>{selectedRef.current=next;setSelectedDesign(next);rememberSelectedDesign(next);}}
      onLeave={()=>{leavingWorkbench.current=!!room&&connection.ready;if(leavingWorkbench.current)send({type:"leave"});setWorkbenchRoom(null);}}/>
  </Suspense>
    {reportOpen && lastBattle && <LanBattleReport match={lastBattle.match} seat={lastBattle.match.players.find(player=>player.id===(id||lastIdentity))?.seat ?? -1} result={lastBattle.result} onReturn={()=>setReportOpen(false)} returnLabel="关闭战报"/>}
  </>;
  return <main className="native-refit-app lan-page lan-entry-page">
    <h1 className="native-screen-tab"><NativeBitmapText font="caption">局域网联机</NativeBitmapText></h1>
    <NativeFrame className="lan-entry-shell">
      <header className="lan-entry-heading"><h2><NativeBitmapText>创建或加入房间</NativeBitmapText></h2><p>选船、改装和分队，都在进入房间后进行。</p></header>
      <ol className="lan-workflow" aria-label="联机操作步骤"><li aria-current="step">1 · 创建 / 加入</li><li>2 · 房间内改装与分队</li><li>3 · 准备 / 开始</li></ol>
      {reconnecting&&<p className="lan-menu-note" role="status">{reconnecting}</p>}
      {error&&<p className="lan-error" role="alert">{error}</p>}
      <LanStart design={selectedDesign} hull={previewHull} name={name} onNameChange={setName} available={available} connected={!!id}
        connecting={connecting||entering||!!room} initialCode={initialCode}
        onHost={()=>enterRoom({type:"create",battleSize:readBattleSize()})} onJoin={(code,password)=>enterRoom({type:"join",code,password})}/>
      <footer className="lan-entry-footer"><NativeButton onClick={()=>setHelpOpen(true)}>联机说明</NativeButton><NativeButton onClick={()=>{connection.close();window.location.assign("./");}}>返回主菜单</NativeButton></footer>
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
            <p>创建房间后，在房间内点击「邀请朋友」。朋友打开邀请链接，确认房间码与密码后加入；不必单独点击连接服务器。</p>
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
              先创建或加入房间，在房间里选择配装和队伍，最后准备。其他真人准备后，房主直接点击开始，无需再点准备；更换配装、队伍、AI 或人数会取消准备。创建房间的玩家负责战斗计算，服务器转发信息。
            </p>
            <h3>使用舰船设计</h3>
            <p>进入房间后，点击自己的舰船或“更换舰船”，在房间中选船、改装，完成后点击“应用修改”。入房前不再选船，不必另开页面或先保存。编辑时保持房间连接并取消自己的准备，未应用的修改不会改变房间配装；只有明确另存方案才写入本机方案库。已存方案 / JSON 导入保留在次要入口。</p>
            <p>武器、插件、S-mod、幅能配置、武器组、支持的战斗技能及舰载机随方案同步。准备和加载阶段按同一版本的设计规则校验，开局后不能改装。</p>
            <h3>当前版本</h3>
            <p>
              所有房间统一采用房间编成，
              支持多队互打和每人独立一队，成员栏只显示真人。玩家可自行选队，房主在独立的「AI 舰船」中手动添加对手或友军，默认没有 AI。房间可设置 2–10
              个真人席位，无需坐满；只有房主时给对面添加 AI 也可开始。不限制固定数量的
              AI，从已适配舰体中选择并使用建议配装。更改容量、队伍或 AI
              编成会取消所有人的准备；至少两个阵营需有舰船。菜单不暂停；断线保留席位
              30
              秒，客机可刷新后重连。开战后客机离开仅退出自己，舰船由 AI
              接管；主动退出或席位过期后不能中途加入。房主结束本局会结束全场，刷新房主页面也无法恢复计算。大量舰船的流畅度取决于房主与客机性能和网络，仍有通信字节安全预算；暂不支持主机迁移。
            </p>
            <p>大厅延迟为服务器往返时间，不代表完整操作延迟。</p>
          </div>
        </Modal>
      )}
  </main>;
}
