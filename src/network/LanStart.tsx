import { readBattleSize } from "../engine/runtime/BattleSizeSettings";
import { useRef, useState } from "react";
import { NativeButton } from "../ui/NativeChrome";
import { NativeBitmapText } from "../ui/NativeBitmapText";
import type { Design } from "../studio/DesignModel";

/** The entrance handles connection only. Ship selection and refit live inside the room. */
export function LanStart({design,hull,name,onNameChange,available,connected,connecting,initialCode,onHost,onJoin}:{
  design:Design|null;hull:string;name:string;onNameChange:(name:string)=>void;
  available:boolean|null;connected:boolean;connecting:boolean;initialCode:string;
  onHost:()=>void;onJoin:(code:string,password:string)=>void;
}) {
  const [address,setAddress]=useState("");
  const [code,setCode]=useState(initialCode), [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false), [error,setError]=useState("");
  const pending=useRef(false);
  const locked=busy||connecting||available===null;
  const host = async () => {
    if (pending.current || locked || !name.trim()) return;
    if (available === true) { onHost(); return; }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/lan/start", {
        method: "POST",
        headers: { "X-Starsector-Launch": "1" },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.url)
        throw Error(
          data?.error ??
            "当前网页服务不支持启动后台。请用本项目的开发或预览服务打开游戏；纯静态网页无法启动本机程序。",
        );
      const url = new URL(data.url);
      if (
        url.protocol !== "http:" ||
        url.hostname !== "127.0.0.1" ||
        url.port !== "3001"
      )
        throw Error("后台返回了无效的本机地址。");
      // Fragment stays in the browser, not in static-server request logs.
      url.hash = new URLSearchParams({
        host: "1",
        battleSize: String(readBattleSize()),
        name: name.trim(),
        hull,
        ...(design ? {design:JSON.stringify(design)} : {}),
      }).toString();
      window.location.assign(url.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : "启动失败，请重试。");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const join = () => {
    if (locked || !name.trim()) return;
    setError("");
    if (available === true) { if (/^[0-9A-F]{6}$/.test(code)) onJoin(code,password); return; }
    try {
      const value = address.trim();
      const explicitScheme = value.includes("://");
      const url = new URL(explicitScheme ? value : "http://" + value);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw Error("请输入房主的 HTTP 地址或 IP:端口。");
      if (!explicitScheme && !url.port) url.port = "3001";
      const room = url.searchParams.get("room");
      url.pathname = "/";
      url.search = "?view=lan" + (room && /^[0-9a-f]{6}$/i.test(room) ? "&room=" + room.toUpperCase() : "");
      url.hash = new URLSearchParams({connect:"1", name:name.trim(), hull, ...(design ? {design:JSON.stringify(design)} : {})}).toString();
      window.location.assign(url.href);
    } catch {
      setError("房主地址无效，请输入房主的 HTTP 链接或 IP:端口。");
    }
  };
  return <section className="lan-start lan-entry-controls" aria-label="创建或加入房间">
    <div className="lan-entry-identity lan-form">
      <label htmlFor="lan-player-name">玩家名称</label>
      <input id="lan-player-name" value={name} maxLength={24} disabled={locked||connected} onChange={event=>onNameChange(event.target.value)} autoComplete="nickname"/>
      <p className="lan-muted" role="status">{available===null?"正在检查联机服务…":connecting?"正在连接并进入房间…":available?((connected?"已连接：":"当前服务器：")+window.location.host):"进入房间后再选船、改装和分队。"}</p>
    </div>
    <div className="lan-entry-options">
      <form className="lan-entry-option lan-form" aria-label="创建房间" onSubmit={event=>{event.preventDefault();void host();}}>
        <h2><NativeBitmapText font="caption">创建房间</NativeBitmapText></h2>
        <p>我来当房主，创建后邀请朋友加入。</p>
        <NativeButton type="submit" disabled={locked||!name.trim()}>{busy?"正在启动后台…":"创建房间"}</NativeButton>
        <small className="lan-muted" role={busy?"status":undefined}>{busy?"首次或源码更新后会自动构建，请稍候。":available?"直接进入房间，不需要先点连接服务器。":"点击创建才启动本机后台；已有兼容后台则复用。"}</small>
      </form>
      <form className="lan-entry-option lan-form" aria-label="加入房间" onSubmit={event=>{event.preventDefault();join();}}>
        <h2><NativeBitmapText font="caption">加入房间</NativeBitmapText></h2>
        {available===true?<>
          <label htmlFor="lan-code-input">房间码</label>
          <input id="lan-code-input" value={code} maxLength={6} disabled={locked} onChange={event=>setCode(event.target.value.toUpperCase())} placeholder="六位房间码" autoComplete="off" spellCheck={false}/>
          <label htmlFor="lan-password">房间密码（可选）</label>
          <input id="lan-password" type="password" value={password} maxLength={32} disabled={locked} onChange={event=>setPassword(event.target.value)} autoComplete="off"/>
        </>:<>
          <label htmlFor="lan-host-address">邀请链接 / 房主地址</label>
          <input id="lan-host-address" value={address} disabled={locked} onChange={event=>setAddress(event.target.value)} placeholder="例如 26.12.34.56:3001" autoComplete="off" spellCheck={false}/>
        </>}
        <NativeButton type="submit" disabled={locked||!name.trim()||(available===true?!/^[0-9A-F]{6}$/.test(code):!address.trim())}>加入房间</NativeButton>
        <small className="lan-muted">{available===true?"输入房主提供的房间码，加入后再选择自己的舰船。":"只连接朋友，不启动你的后台。支持局域网及 n2n / Radmin 虚拟网络地址。"}</small>
      </form>
    </div>
    {error&&<p className="lan-error" role="alert">{error}</p>}
  </section>;
}
