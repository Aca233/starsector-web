import { decodeGameState } from './GameStateCodec';
import type { GameState } from './GameState';

export interface SaveStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export interface SaveStatus { state: 'saved' | 'memory-only' | 'blocked'; message: string }

/** Storage is injected; the game domain does not know about localStorage. */
export class GameSaveStore {
  private observed: string | null = null;
  private blocked = false;
  public status: SaveStatus = { state: 'memory-only', message: '尚未保存' };

  constructor(private readonly storage: () => SaveStorage, private readonly key: string) {}

  public load(): GameState | null {
    try { this.observed = this.storage().getItem(this.key); }
    catch { this.status = { state: 'memory-only', message: '浏览器存储不可用，本次仅保存在内存中。' }; return null; }
    if (this.observed === null) return null;
    try {
      const state = decodeGameState(JSON.parse(this.observed));
      this.status = { state: 'saved', message: '已读取存档；未完成的战斗从战前检查点重新开始。' };
      return state;
    } catch (error) { this.protect(error); return null; }
  }

  public protect(error: unknown): void {
    this.blocked = true;
    this.status = { state: 'blocked', message: `${error instanceof Error ? error.message : String(error)} 自动保存已停用，未覆盖原存档。` };
  }

  public save(state: GameState): boolean {
    if (this.blocked) return false;
    try {
      const storage = this.storage();
      if (storage.getItem(this.key) !== this.observed) {
        this.protect(new Error('存档已被其他页面修改，请刷新后再继续。'));
        return false;
      }
      const serialized = JSON.stringify(decodeGameState(state));
      storage.setItem(this.key, serialized);
      this.observed = serialized;
      this.status = { state: 'saved', message: '已自动保存战前检查点 / 战后结算；不保存战斗中途状态。' };
      return true;
    } catch (error) {
      this.status = { state: 'memory-only', message: `保存失败，本次进度仅在内存中：${error instanceof Error ? error.message : String(error)}` };
      return false;
    }
  }

  /** Only called after the user explicitly confirms replacement of the current save. */
  public replace(state: GameState): boolean {
    try { this.observed = this.storage().getItem(this.key); this.blocked = false; }
    catch { /* save() reports storage unavailability without destroying the current value. */ }
    return this.save(state);
  }
}
