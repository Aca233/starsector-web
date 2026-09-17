import { Component, type ReactNode } from "react";

/** Suspense handles pending modules, not rejected imports or render errors. */
export class RuntimeErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state: { error: string | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  render() {
    if (this.state.error === null) return this.props.children;
    return (
      <main className="native-loading" role="alert">
        <section style={{ maxWidth: 640, padding: 24 }}>
          <h1>页面加载或运行失败</h1>
          <p>可能是连接中断、版本更新或运行异常。未保存的修改可能丢失；重新加载不会主动清除已有存档。</p>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{this.state.error}</pre>
          <button className="native-button" type="button" onClick={() => window.location.reload()}>重新加载</button>
          {" "}
          <button className="native-button" type="button" onClick={() => window.location.assign(window.location.pathname)}>返回主菜单</button>
        </section>
      </main>
    );
  }
}
