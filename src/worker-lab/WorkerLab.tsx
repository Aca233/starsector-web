import { useEffect, useRef, useState } from 'react';
import { WorkerLabController } from './WorkerLabController';
import './worker-lab.css';

declare global { interface Window { __workerLab?: WorkerLabController } }
export default function WorkerLab() {
  const canvas = useRef<HTMLCanvasElement>(null), controller = useRef<WorkerLabController | null>(null);
  const [instance, setInstance] = useState<WorkerLabController | null>(null);
  const [status, setStatus] = useState('正在准备同画质战斗…');
  const [revision, setRevision] = useState(0);
  const params = new URLSearchParams(location.search);
  const ships = [2, 10, 50, 100].includes(Number(params.get('ships'))) ? Number(params.get('ships')) : 100;
  const backend = params.get('backend') === 'main' ? 'main' : 'worker';
  const seed = 0x51180;
  const url = (mode: string, count = ships) => `?view=worker-lab&backend=${mode}&ships=${count}`;
  useEffect(() => {
    if (!canvas.current) return;
    let lab: WorkerLabController | undefined;
    try {
      lab = new WorkerLabController(canvas.current, { ships, seed }, backend, () => setRevision(value => value + 1));
      controller.current = lab; window.__workerLab = lab;
      void lab.ready.then(() => { if (controller.current === lab) { setInstance(lab!); setStatus('准备就绪'); } }).catch(error => { if (controller.current === lab) setStatus(String(error)); });
    } catch (error) { void Promise.resolve().then(() => setStatus(String(error))); }
    const timer = setInterval(() => setRevision(value => value + 1), 500);
    return () => { clearInterval(timer); lab?.dispose(); controller.current = null; if (window.__workerLab === lab) delete window.__workerLab; };
  }, [ships, backend]);
  const lab = instance, report = lab?.report();
  const download = () => {
    const blob = new Blob([JSON.stringify(lab?.report(), null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = href; anchor.download = `worker-lab-${backend}-${ships}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  };
  return <main className="worker-lab" data-revision={revision}>
    <canvas ref={canvas} tabIndex={0} aria-label="双线程实验战场" />
    <section className="worker-lab-panel" aria-label="双线程实验控制">
      <h1>战斗双线程实验</h1>
      <p>固定攻势级阵容 · {ships} 艘 · {backend === 'worker' ? 'Worker 模拟 / 主线程绘制' : '主线程模拟 / 主线程绘制'}</p>
      <p className="worker-lab-note">实验入口，不替换普通战斗。两种模式使用同一固定步长调度；不是全游戏性能结论。</p>
      <nav><a href={url('main')}>单线程重新开局</a><a href={url('worker')}>双线程重新开局</a><a href="?view=combat">普通战斗</a></nav>
      <div className="worker-lab-actions">{[2, 10, 50, 100].map(count => <a key={count} href={url(backend, count)}>{count} 艘</a>)}</div>
      <p role="status">{lab?.error || status}{lab?.running ? ' · 运行中' : ' · 已暂停'}</p>
      {lab?.error && <p role="alert">实验已停止，未用画面快照恢复战斗。请点“单线程重新开局”安全回退。</p>}
      <div className="worker-lab-actions">
        <button disabled={!lab?.session.isPresentationReady() || !!lab?.error} onClick={() => lab?.setRunning(!lab.running)}>{lab?.running ? '暂停' : '开始'}</button>
        <button onClick={() => lab?.toggleAutopilot()}>自动驾驶：{lab?.input.autopilot ? '开' : '关'}</button>
        <button onClick={() => lab?.toggleAudio()}>声音：{lab?.audioEnabled ? '开' : '关'}</button>
        <button onClick={() => lab?.resetMetrics()}>清空统计</button><button onClick={download}>导出数据</button>
      </div>
      <dl>
        <dt>浏览器回调帧率</dt><dd>{report?.callbackHz.toFixed(1) ?? '—'} Hz</dd>
        <dt>模拟进度（已呈现）</dt><dd>{report?.presentedTPS.toFixed(1) ?? '—'} TPS</dd>
        <dt>帧间隔 P95</dt><dd>{report?.intervalP95Ms.toFixed(1) ?? '—'} ms</dd>
        <dt>输入发出→绘制提交 P95</dt><dd>{report?.inputToPresentationP95Ms?.toFixed(1) ?? '—'} ms</dd>
        <dt>最近快照打包 / 应用</dt><dd>{report?.packMs.toFixed(1) ?? '—'} / {report?.applyMs.toFixed(1) ?? '—'} ms</dd>
        <dt>模拟步 / 样本</dt><dd>{report?.tick ?? 0} / {report?.samples ?? 0}</dd>
      </dl>
      <p className="worker-lab-note">点击战场后 WASD/QE 操控，左键开火，右键护盾，V 排能，F 系统，1–3 武器组，Tab 自动驾驶，滚轮缩放。切到后台会暂停。统计不等于显示器实际出帧；低 TPS 仍表示战斗变慢。</p>
    </section>
  </main>;
}




