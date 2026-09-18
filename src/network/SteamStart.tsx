import { MotionPresence } from '../ui/core/MotionPresence';
import { steamRequest, type SteamStatus } from "./SteamApi";
import { useState } from 'react';
import { NativeButton } from '../ui/NativeChrome';
import { NativeBitmapText } from '../ui/NativeBitmapText';
import { Modal } from '../ui/core/UI';
export function SteamStart({ status, name, onName, busy: connecting, onSelected, onRefresh, onReset }: {
  status: SteamStatus | null; name: string; onName: (name: string) => void; busy: boolean;
  onSelected: (status: SteamStatus, kind: 'create' | 'join', password: string) => void;
  onRefresh: (status: SteamStatus) => void; onReset: () => void;
}) {
  const [lobby, setLobby] = useState<string | null>(null), [password, setPassword] = useState(''), [visibility, setVisibility] = useState('friends');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirm, setConfirm] = useState<'leave' | 'shutdown' | null>(null);
  const [rooms, setRooms] = useState<Array<{id:string;name:string;players:string;capacity:string}> | null>(null);
  const targetLobby = lobby ?? status?.pendingInvite ?? '';
  const locked = busy || connecting || !!status?.busy;
  const action = async (operation: string) => {
    if (locked) return; setBusy(true); setError('');
    try {
      if (operation === 'create' || operation === 'join') {
        const selected = await steamRequest(operation, operation === 'create' ? { visibility } : { lobby: targetLobby });
        onRefresh(selected); onSelected(selected, operation, password);
      } else if (operation === 'list') setRooms((await steamRequest<{rooms:NonNullable<typeof rooms>}>('list')).rooms);
      else if (operation === 'shutdown') { await steamRequest('shutdown'); setError('启动器已退出，可以关闭本页面。'); }
      else { if (operation === 'leave') onReset(); onRefresh(await steamRequest(operation)); }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); setConfirm(null); }
  };
  return <section className="lan-start lan-entry-controls" aria-label="Steam 创建或加入房间">
    <p className="lan-menu-note">每位 Steam 玩家都要先登录 Steam，并运行自己的 Electron 桌面版或轻量启动器；不要把本机网页地址发给朋友。</p>
    {!status ? <div className="lan-help"><h2>请先启动 Steam 联机启动器</h2><p>普通网页不能直接调用 Steam。Electron 桌面版点击 Steam 联机入口会自动启动后台；浏览器版请双击启动包内的「启动 Steam 联机」。</p><p>源码开发可在项目目录运行 <code>npm run steam</code>。</p></div> : <>
      <p role="status">{status.available ? 'Steam 已连接：' + status.name : status.error || 'Steam 尚未连接'}{status.testApp ? ' · Spacewar 480 开发测试' : ' · AppID ' + status.appId}</p>
      {!status.available && <NativeButton disabled={locked} onClick={() => void action('retry')}>已登录 Steam，重试连接</NativeButton>}
      {status.lobby && <div className="lan-help"><p>启动器仍在 Steam 房间 {status.lobby.id}。{status.occupied ? '请使用已经连接的游戏页面，不要重复打开多个控制页面。' : '可等待原页面重连；如需重建，请先离开旧房间。'}</p><NativeButton disabled={locked} onClick={() => setConfirm('leave')}>离开旧 Steam 房间</NativeButton></div>}
      <div className="lan-entry-identity lan-form"><label htmlFor="steam-player-name">玩家名称</label><input id="steam-player-name" value={name} maxLength={24} disabled={locked || !!status.lobby} onChange={e=>onName(e.target.value)} /></div>
      <div className="lan-entry-options">
        <form className="lan-entry-option lan-form" onSubmit={e=>{e.preventDefault();void action('create');}}>
          <h2><NativeBitmapText font="caption">创建 Steam 房间</NativeBitmapText></h2><p>由你的电脑计算战斗，Steam 负责玩家间的数据连接。</p>
          <label>房间可见性<select value={visibility} disabled={locked || !!status.lobby} onChange={e=>setVisibility(e.target.value)}><option value="friends">好友可加入</option><option value="public">公开测试房间</option></select></label>
          <NativeButton type="submit" disabled={locked || !status.available || !!status.lobby || !name.trim()}>创建房间</NativeButton>
        </form>
        <form className="lan-entry-option lan-form" onSubmit={e=>{e.preventDefault();void action('join');}}>
          <h2><NativeBitmapText font="caption">加入 Steam 房间</NativeBitmapText></h2>
          <label>Steam 房间号 / 邀请链接<input aria-label="Steam 房间号" value={targetLobby} maxLength={160} onChange={e=>setLobby(e.target.value)} placeholder="不是局域网的六位房间码" disabled={locked || !!status.lobby}/></label>
          <label>房间密码（可选）<input type="password" value={password} maxLength={32} onChange={e=>setPassword(e.target.value)} disabled={locked || !!status.lobby}/></label>
          {status.pendingInvite && <p role="status">收到 Steam 邀请，房间号已填入；由你确认后加入，不会自动退出正在进行的游戏。</p>}
          <NativeButton type="submit" disabled={locked || !status.available || !!status.lobby || !name.trim() || !targetLobby.trim()}>加入房间</NativeButton>
        </form>
      </div>
      <div className="lan-entry-footer"><NativeButton disabled={locked || !status.available} onClick={()=>void action('list')}>查找公开房间</NativeButton><NativeButton disabled={locked || !!status.lobby || status.occupied} onClick={()=>setConfirm('shutdown')}>退出启动器</NativeButton></div>
      {rooms && <div className="lan-help"><p>仅显示同游戏、同版本的公开房间。480 是共享测试环境，列表可能不完整，优先使用完整房间号。</p>{rooms.length ? rooms.map(room=><p key={room.id}><NativeButton disabled={locked || !!status.lobby} onClick={()=>setLobby(room.id)}>{room.name} · {room.players}/{room.capacity} 人 · 填入房间号</NativeButton></p>) : <p>暂未找到可加入的公开房间。</p>}</div>}
    </>}
    {busy && <p role="status">正在联系 Steam，请稍候…</p>}{error && <p className="lan-error" role="alert">{error}</p>}
    <MotionPresence>{confirm && <Modal title={confirm === 'leave' ? '离开 Steam 房间？' : '退出本机启动器？'} eyebrow="" onClose={()=>setConfirm(null)} footer={<><NativeButton onClick={()=>setConfirm(null)}>取消</NativeButton><NativeButton disabled={locked} onClick={()=>void action(confirm)}>确认</NativeButton></>}><p>{confirm === 'leave' ? '如果你是房主，会关闭旧房间并结束其中的战斗。其他已保存配装不受影响。' : '本机接口将停止，可以关闭本页面；再次游玩时需重新运行启动器。'}</p></Modal>}</MotionPresence>
  </section>;
}
export function SteamInvite({ lobbyId }: { lobbyId: string }) {
  const [notice, setNotice] = useState('');
  return <div className="lan-help lan-room-settings"><p>朋友先运行自己的 Steam 启动器，在「加入 Steam 房间」粘贴下面的完整房间号；有密码时请另行告知。</p><label>Steam 房间号<input aria-label="Steam 邀请房间号" value={lobbyId} readOnly onFocus={e=>e.target.select()}/></label><NativeButton onClick={()=>{if (!navigator.clipboard) {setNotice('请选中房间号，按 Ctrl+C 复制。');return;}void navigator.clipboard.writeText(lobbyId).then(()=>setNotice('房间号已复制'),()=>setNotice('请选中房间号，按 Ctrl+C 复制。'));}}>复制 Steam 房间号</NativeButton><NativeButton onClick={()=>void steamRequest<{note:string}>('invite').then(result=>setNotice(result.note),error=>setNotice(error.message))}>尝试打开 Steam 邀请</NativeButton><p role="status">{notice}</p><p>浏览器不保证显示 Steam 覆盖层，复制房间号不依赖覆盖层。不要发送 127.0.0.1 地址，也不要发送房间侧栏的六位局域网编号。</p></div>;
}
