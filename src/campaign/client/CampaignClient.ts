import type { CampaignCommand, CampaignSession, CommandReceipt, CargoPreviewRequest, CargoPreviewResponse } from './Protocol';
import type {NativeFrameEventsRequest,NativePlayerFrameEvents,NativeColonyCommand,NativeAbilityCommand,NativeDevelopmentSession,NativeFleetObservations,NativeObservationRequest,NativeNavigationCommand,NativeLootCargoCommand,NativeSceneRequest,NativeSceneFrame} from './NativeProtocol';
export class CampaignApiError extends Error {
  constructor(public code: string, public uncertain: boolean) { super(code); }
}
import type { OriginalMarketVisit, OriginalMarketVisitRequest, OriginalMarketBasketRequest, OriginalMarketBasketQuote } from '../rules/OriginalMarket.mjs';
export type MarketVisit = OriginalMarketVisit & { epoch: string };
export type MarketQuote = OriginalMarketBasketQuote & { worldId: string; epoch: string };
export type MarketVisitInput = OriginalMarketVisitRequest & { worldId: string; epoch: string };
export type MarketQuoteInput = OriginalMarketBasketRequest & { worldId: string; epoch: string };
async function request<T>(token: string, path: string, command?: CampaignCommand | CargoPreviewRequest | MarketVisitInput | MarketQuoteInput | NativeObservationRequest | NativeNavigationCommand | NativeLootCargoCommand | NativeSceneRequest | NativeAbilityCommand | NativeColonyCommand | NativeFrameEventsRequest, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try { response = await fetch('/campaign-api/' + path, { method: command ? 'POST' : 'GET', cache: 'no-store',
    headers: { Authorization: 'Bearer ' + token, ...(command ? { 'Content-Type': 'application/json' } : {}) },
    ...(command ? { body: JSON.stringify(command) } : {}), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000) }); }
  catch { throw new CampaignApiError('CONNECTION_LOST', true); }
  let value: any; try { value = await response.json(); } catch { throw new CampaignApiError('INVALID_RESPONSE', true); }
  if (!response.ok) throw new CampaignApiError(value.error?.code ?? 'GATEWAY_ERROR', response.status >= 500 || response.status === 401);
  return value as T;
}
export const readSession = (token: string) => request<CampaignSession>(token, 'session');
export const sendCommand = (token: string, command: CampaignCommand) => request<CommandReceipt>(token, 'command', command);
/** Read-only failures are never ambiguous mutations and never enter pending storage. */
export async function readCargoPreview(token: string, input: CargoPreviewRequest, signal: AbortSignal): Promise<CargoPreviewResponse> {
  try { return await request<CargoPreviewResponse>(token, 'cargo-preview', input, signal); }
  catch (error) { throw new CampaignApiError(error instanceof CampaignApiError ? error.code : 'PREVIEW_UNAVAILABLE', false); }
}
export const pendingKey = (world: string, player: string) => 'campaign-pending:' + world + ':' + player;
export function readPending(world: string, player: string): CampaignCommand | null {
  const raw = sessionStorage.getItem(pendingKey(world, player)); if (!raw) return null;
  const command = JSON.parse(raw);
  if (command?.worldId !== world || typeof command.requestId !== 'string' || !Array.isArray(command.expected)) throw new Error('损坏的待确认指令，请勿另发跳跃指令；先由房主核对回执。');
  return command;
}
export const savePending = (player: string, command: CampaignCommand) => sessionStorage.setItem(pendingKey(command.worldId, player), JSON.stringify(command));
export const clearPending = (world: string, player: string) => sessionStorage.removeItem(pendingKey(world, player));
export const errorText = (error: unknown): string => {
  const code = error instanceof CampaignApiError ? error.code : null;
  const labels: Record<string, string> = {
    MARKET_UNAVAILABLE: '该市场尚无真实可交易经济数据。', MARKET_SNAPSHOT_STALE: '市场经济数据已过期，等待服务器刷新；不会使用旧价格成交。',
    MARKET_OUT_OF_REACH: '舰队还未接触市场所在天体或设施。', MARKET_ACCESS_DENIED: '当前没有入港交易许可。',
    ILLEGAL_COMMODITY: '该商品不能在公开市场交易。', INSUFFICIENT_CREDITS: '余额不足，可先在本单卖出货物。',
    INSUFFICIENT_STOCK: '市场库存不足，请撤销后重新读取。', INSUFFICIENT_CARGO: '舰队货物数量已变化。',
    BLACK_MARKET_CONSEQUENCES_UNIMPLEMENTED: '黑市交易后果尚未接入，暂不可成交。', EXOTIC_TRADE_UNIMPLEMENTED: '异域商品交易尚未接入。',
    UNAUTHENTICATED: '访问码无效或已撤销，请重新连接。', CONNECTION_LOST: '连接中断；若已发送指令，结果暂不确定。',
    VERSION_CONFLICT: '舰队状态刚刚变化，请重试。', STALE_AUTHORITY: '权威服务已重启，请刷新状态后重试。',
    IN_TRANSITION: '舰队正在跃迁，暂不能执行此操作。', ASSET_LOCKED: '舰队已进入遭遇，暂不能修改。',
    TOO_FAR: '两支舰队需要在同一地点、250 距离内汇合后才能加入。', INSUFFICIENT_FUEL: '燃料不足，无法启动跳跃。',
    NATIVE_LOOT_CLOSED: '此战利品窗口已关闭，已停止转移。', INVALID_NATIVE_LOOT_TRANSACTION: '货物操作已被服务器拒绝；此次没有提交。', REQUEST_REUSED: '同一请求编号的内容不一致，请由房主核对。',
    NATIVE_SCENE_UNAVAILABLE: '此世界缺少真实呈现数据，暂不能显示航行画面。', NATIVE_INTERACTION_OPEN: '请先结束当前交互。', NATIVE_NAVIGATION_CONTEXT_UNAVAILABLE: '战后导航保护所需状态尚未接齐。',
    NATIVE_ABILITY_SLOT_CHANGED: '能力槽位已变化，请以最新状态重新操作。', NATIVE_ABILITY_UNUSABLE: '该能力当前不可用。', NATIVE_ABILITY_UI_UNAVAILABLE: '缺少已保存的能力栏配置。',
    NATIVE_PLAYER_ABILITY_CONTEXT_UNAVAILABLE: '这支舰队的独立玩家能力上下文尚未接入。', NATIVE_ABILITY_LISTENERS_UNAVAILABLE: '该世界的能力事件监听器尚未接入。',
    NATIVE_COLONY_FINANCE_CONTEXT_UNAVAILABLE: '这位舰长的独立殖民地资金上下文尚未接入，暂不能修改。',
    FORBIDDEN: '你没有操作这支舰队或殖民地的权限。', RATE_LIMIT: '请求过于频繁，请稍后重试。',
    INVITE_EXPIRED: '邀请已经过期。', INVITE_STALE: '邀请状态已经变化。', AUTHORITY_TIMEOUT: '服务回执超时，结果尚不确定。',
  };
  return code ? (labels[code] ?? '操作未完成：' + code) : error instanceof Error ? error.message : '未知错误';
};

async function readMarketRequest<T>(token: string, path: string, input: MarketVisitInput | MarketQuoteInput, signal: AbortSignal): Promise<T> {
  try { return await request<T>(token, path, input, signal); }
  catch (error) { throw new CampaignApiError(error instanceof CampaignApiError ? error.code : 'MARKET_UNAVAILABLE', false); }
}
export const readMarketVisit = (token: string, input: MarketVisitInput, signal: AbortSignal) => readMarketRequest<MarketVisit>(token, 'market-visit', input, signal);
export const readMarketQuote = (token: string, input: MarketQuoteInput, signal: AbortSignal) => readMarketRequest<MarketQuote>(token, 'market-basket-quote', input, signal);

/** Native development transport is explicit; it never pretends to be a reference CampaignSession. */
export const readNativeDevelopmentSession=(token:string)=>request<NativeDevelopmentSession>(token,'native-session');
export const sendNativeNavigationCommand=(token:string,command:NativeNavigationCommand)=>request<CommandReceipt>(token,'native-command',command);
export async function readNativeFleetObservations(token:string,input:NativeObservationRequest,signal:AbortSignal):Promise<NativeFleetObservations>{
 try{return await request<NativeFleetObservations>(token,'native-observations',input,signal);}
 catch(error){throw new CampaignApiError(error instanceof CampaignApiError?error.code:'NATIVE_OBSERVATION_UNAVAILABLE',false);}
}

export const sendNativeLootCargoCommand=(token:string,command:NativeLootCargoCommand)=>request<CommandReceipt>(token,'native-command',command);

export async function readNativeScene(token:string,input:NativeSceneRequest,signal:AbortSignal):Promise<NativeSceneFrame>{
 try{return await request<NativeSceneFrame>(token,'native-scene',input,signal);}
 catch(error){throw new CampaignApiError(error instanceof CampaignApiError?error.code:'NATIVE_SCENE_UNAVAILABLE',false);}
}

export const sendNativeAbilityCommand=(token:string,command:NativeAbilityCommand)=>request<CommandReceipt>(token,'native-command',command);

export const sendNativeColonyCommand=(token:string,command:NativeColonyCommand)=>request<CommandReceipt>(token,'native-command',command);

/** Read-only cursor fetch. Replay IDs allow a consumer to avoid playing reconnect/retry effects twice. */
export async function readNativeFrameEvents(token:string,input:NativeFrameEventsRequest,signal:AbortSignal):Promise<NativePlayerFrameEvents>{
 try{return await request<NativePlayerFrameEvents>(token,'native-frame-events',input,signal);}
 catch(error){throw new CampaignApiError(error instanceof CampaignApiError?error.code:'NATIVE_FRAME_EVENTS_UNAVAILABLE',false);}
}
