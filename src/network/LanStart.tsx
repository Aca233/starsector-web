import { useRef, useState } from "react";
import { NativeButton } from "../ui/NativeChrome";

/** No background is launched until the player explicitly chooses to host. */
export function LanStart() {
  const [name, setName] = useState("玩家");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const host = async () => {
    if (pending.current || !name.trim()) return;
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
        name: name.trim(),
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
    setError("");
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
      url.pathname = "/";
      url.search = "?view=lan";
      url.hash = "";
      window.location.assign(url.href);
    } catch {
      setError("房主地址无效，请输入房主的 HTTP 链接或 IP:端口。");
    }
  };
  return (
    <section className="lan-start" aria-label="选择联机方式">
      <h3>我是房主</h3>
      <form
        className="lan-form"
        onSubmit={(event) => {
          event.preventDefault();
          void host();
        }}
      >
        <label htmlFor="lan-host-name">玩家名称</label>
        <input
          id="lan-host-name"
          value={name}
          maxLength={24}
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
        />
        <NativeButton type="submit" disabled={busy || !name.trim()}>
          {busy ? "正在启动后台…" : "创建房间"}
        </NativeButton>
        <p className="lan-muted" role={busy ? "status" : undefined}>
          {busy
            ? "首次或源码更新后会自动构建，请稍候。"
            : "自动启动本机后台，已有后台则直接复用。"}
        </p>
      </form>
      <h3>加入朋友</h3>
      <form
        className="lan-form"
        onSubmit={(event) => {
          event.preventDefault();
          join();
        }}
      >
        <label htmlFor="lan-host-address">房主地址 / 虚拟网卡 IP</label>
        <input
          id="lan-host-address"
          value={address}
          disabled={busy}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="例如 26.12.34.56:3001"
          autoComplete="off"
          spellCheck={false}
        />
        <NativeButton type="submit" disabled={busy || !address.trim()}>
          连接房主
        </NativeButton>
        <p className="lan-muted">
          只连接房主，不启动你的后台。也可直接打开房主分享的链接。
        </p>
      </form>
      {error && (
        <p className="lan-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
