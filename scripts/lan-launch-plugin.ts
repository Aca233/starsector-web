import type { Plugin, Connect } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { open, mkdir, readFile, stat, readdir } from "node:fs/promises";
import path from "node:path";

const SERVICE = "starsector-web-lan";
const PORT = 3001;
const ORIGIN = "http://127.0.0.1:" + PORT;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
type Info = { service?: string; protocol: number; build: string };

/** Local menu -> local Node launcher. Never exposed as a remote process-launch API. */
export function lanLaunchPlugin(): Plugin {
  let root = "";
  let pending: Promise<{ url: string; reused: boolean }> | null = null;
  async function probe(): Promise<Info | null> {
    let response: Response;
    try {
      response = await fetch(ORIGIN + "/lan/info", {
        signal: AbortSignal.timeout(1500),
        redirect: "error",
      });
    } catch (error) {
      const code = (error as { cause?: { code?: string } }).cause?.code;
      if (code === "ECONNREFUSED") return null;
      throw Error("无法确认 3001 端口的状态，请检查是否被其他程序占用。");
    }
    let info: Info;
    try {
      info = (await response.json()) as Info;
    } catch {
      throw Error("3001 端口已被其他服务占用，未启动第二个后台。");
    }
    if (
      !response.ok ||
      info.service !== SERVICE ||
      !info.build ||
      !Number.isInteger(info.protocol)
    )
      throw Error("3001 端口已被其他服务或旧版联机后台占用，请先关闭旧服务。");
    return info;
  }
  async function builtVersion(): Promise<{
    build: string;
    time: number;
  } | null> {
    try {
      const file = path.join(root, "dist/lan-build.json");
      const data = JSON.parse(await readFile(file, "utf8"));
      await stat(path.join(root, "dist/index.html"));
      return typeof data.build === "string"
        ? { build: data.build, time: (await stat(file)).mtimeMs }
        : null;
    } catch {
      return null;
    }
  }
  // Source timestamps only; no original-game asset enumeration, hashes or size audit.
  async function newerThan(file: string, time: number): Promise<boolean> {
    const info = await stat(file);
    if (!info.isDirectory()) return info.mtimeMs > time;
    for (const entry of await readdir(file, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      if (await newerThan(path.join(file, entry.name), time)) return true;
    }
    return false;
  }
  async function buildIfNeeded() {
    const built = await builtVersion();
    const inputs = [
      "src",
      "scripts",
      "server",
      "index.html",
      "package.json",
      "package-lock.json",
      "vite.config.ts",
      "tsconfig.json",
      "tsconfig.app.json",
      "tsconfig.node.json",
    ];
    let rebuild = !built;
    if (built)
      for (const input of inputs) {
        try {
          if (await newerThan(path.join(root, input), built.time)) {
            rebuild = true;
            break;
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
    if (!rebuild) return;
    const log = await open(path.join(root, "artifacts/lan-build.log"), "w");
    try {
      for (const [bin, args] of [
        ["node_modules/typescript/bin/tsc", ["-b"]],
        ["node_modules/vite/bin/vite.js", ["build"]],
      ] as const) {
        await new Promise<void>((resolve, reject) => {
          // No command shell, downloaded runtime, privileges or firewall changes.
          const child = spawn(
            process.execPath,
            [path.join(root, bin), ...args],
            {
              cwd: root,
              windowsHide: true,
              stdio: ["ignore", log.fd, log.fd],
            },
          );
          const timer = setTimeout(() => {
            child.kill();
            reject(Error("联机构建超时，请查看 artifacts/lan-build.log。"));
          }, 180_000);
          child.once("error", () => {
            clearTimeout(timer);
            reject(
              Error("无法启动构建工具，请确认 Node.js 和项目依赖已安装。"),
            );
          });
          child.once("exit", (code) => {
            clearTimeout(timer);
            if (code === 0) resolve();
            else
              reject(Error("联机构建失败，请查看 artifacts/lan-build.log。"));
          });
        });
      }
    } finally {
      await log.close();
    }
  }
  async function ensureServer() {
    if (Number(process.versions.node.split(".")[0]) < 22)
      throw Error("联机后台需要 Node.js 22 或更高版本。");
    const existing = await probe();
    if (existing) {
      const built = await builtVersion();
      if (!built || built.build !== existing.build)
        throw Error(
          "联机后台仍在使用旧构建，请先停止旧后台再点击。不会自动中断正在进行的对局。",
        );
      return { url: ORIGIN + "/?view=lan", reused: true };
    }
    await mkdir(path.join(root, "artifacts"), { recursive: true });
    // Serialise across separate dev/preview processes, not only repeated clicks.
    const lockPath = path.join(root, "artifacts/lan-launch.lock");
    let lock;
    try {
      lock = await open(lockPath, "wx");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST")
        throw Error(
          "另一个窗口正在启动联机，请稍后重试。若上次启动被强制终止，可在确认没有构建任务后移除 artifacts/lan-launch.lock。",
        );
      throw error;
    }
    try {
      await lock.writeFile(String(process.pid));
      // A second local game server may have finished starting while we took the lock.
      if (await probe()) return { url: ORIGIN + "/?view=lan", reused: true };
      await buildIfNeeded();
      const expected = await builtVersion();
      if (!expected)
        throw Error("缺少联机构建，请查看 artifacts/lan-build.log。");
      const log = await open(path.join(root, "artifacts/lan-server.log"), "a");
      const child = spawn(
        process.execPath,
        [path.join(root, "server/lan-server.mjs")],
        {
          cwd: root,
          env: { ...process.env, HOST: "0.0.0.0", PORT: String(PORT), LAN_BACKGROUND: "1" },
          detached: true,
          windowsHide: true,
          stdio: ["ignore", log.fd, log.fd],
        },
      );
      let failed = false;
      child.once("error", () => {
        failed = true;
      });
      child.once("exit", () => {
        failed = true;
      });
      child.unref();
      await log.close();
      try {
        for (let attempt = 0; attempt < 60; attempt++) {
          await pause(250);
          const info = await probe();
          if (info?.build === expected.build)
            return { url: ORIGIN + "/?view=lan", reused: false };
          if (failed) break;
        }
        throw Error("联机后台未能就绪，请查看 artifacts/lan-server.log。");
      } catch (error) {
        // Only stop the child this request created; never an unrelated port owner.
        if (!failed) child.kill();
        throw error;
      }
    } finally {
      await lock.close();
      const { unlink } = await import("node:fs/promises");
      await unlink(lockPath);
    }
  }
  function permitted(req: IncomingMessage) {
    const remote = req.socket.remoteAddress?.replace(/^::ffff:/, "");
    if (remote !== "127.0.0.1" && remote !== "::1") return false;
    try {
      const address = new URL("http://" + req.headers.host);
      return (
        ["localhost", "127.0.0.1", "[::1]"].includes(address.hostname) &&
        Number(address.port || 80) === req.socket.localPort &&
        req.headers.origin === address.origin &&
        req.headers["x-starsector-launch"] === "1"
      );
    } catch {
      return false;
    }
  }
  function install(middlewares: Connect.Server) {
    middlewares.use(
      (
        req: IncomingMessage,
        res: ServerResponse,
        next: Connect.NextFunction,
      ) => {
        if (req.url?.split("?")[0] !== "/lan/start") return next();
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        const reply = (status: number, data: unknown) => {
          if (!res.destroyed) {
            res.statusCode = status;
            res.end(JSON.stringify(data));
          }
        };
        if (req.method !== "POST") {
          res.setHeader("Allow", "POST");
          reply(405, { error: "请从游戏主菜单启动联机。" });
          return;
        }
        if (!permitted(req)) {
          reply(403, {
            error:
              "仅允许本机游戏菜单启动后台。请在服务端电脑用 localhost 地址打开游戏。",
          });
          return;
        }
        req.resume(); // This endpoint has no parameters; never execute caller-supplied paths or commands.
        pending ??= ensureServer().finally(() => {
          pending = null;
        });
        void pending.then(
          (result) => reply(200, result),
          (error) =>
            reply(503, {
              error: error instanceof Error ? error.message : "联机启动失败。",
            }),
        );
      },
    );
  }
  return {
    name: "local-lan-launcher",
    apply: "serve",
    configResolved(config) {
      root = config.root;
    },
    configureServer(server) {
      install(server.middlewares);
    },
    configurePreviewServer(server) {
      install(server.middlewares);
    },
  };
}
