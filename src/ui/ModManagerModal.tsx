import React, { useState } from 'react';
import { modManager, ShipSpec } from '../engine/modding/ModManager';
import { i18n } from '../engine/i18n/LocalizationManager';
import { X, Plus, Copy, Check, FileJson } from 'lucide-react';

interface ModManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectShip: (shipId: string) => void;
}

export const ModManagerModal: React.FC<ModManagerModalProps> = ({
  isOpen,
  onClose,
  onSelectShip
}) => {
  const ships = modManager.getAllShips();
  const [selectedShipId, setSelectedShipId] = useState<string>(ships[0]?.id || 'onslaught');
  const [jsonInput, setJsonInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [importError, setImportError] = useState('');

  if (!isOpen) return null;

  const currentShip = modManager.getShip(selectedShipId);

  const handleCopyJson = () => {
    if (!currentShip) return;
    navigator.clipboard.writeText(JSON.stringify(currentShip, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleImportJson = () => {
    try {
      setImportError('');
      const parsed = JSON.parse(jsonInput) as ShipSpec;
      if (!parsed.id || !parsed.nameKey || !parsed.hitpoints) {
        throw new Error('缺少必要字段 (id, nameKey, hitpoints)');
      }
      modManager.registerShip(parsed);
      setSelectedShipId(parsed.id);
      setJsonInput('');
      alert(`舰船 Mod [${parsed.id}] 导入成功！`);
    } catch (e: any) {
      setImportError(`导入失败: ${e.message}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 font-mono">
      <div className="bg-slate-900 border border-cyan-500/50 rounded-xl w-full max-w-5xl h-[85vh] flex flex-col shadow-[0_0_50px_rgba(6,182,212,0.2)]">
        {/* 弹窗头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <FileJson className="text-cyan-400" size={24} />
            <div>
              <h2 className="text-base font-bold text-slate-100">
                舰船 Mod 工作台 (Modular Ship Blueprint Registry)
              </h2>
              <p className="text-xs text-slate-400">
                纯声明式 JSON 规范，零编译脚本负担，原生支持热插拔与多语言解耦
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* 弹窗主体左右布局 */}
        <div className="flex-1 flex overflow-hidden">
          {/* 左侧：已注册舰船列表 */}
          <div className="w-72 border-r border-slate-800 p-4 overflow-y-auto space-y-2">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              已挂载战舰列表 ({ships.length})
            </div>
            {ships.map((ship) => (
              <button
                key={ship.id}
                onClick={() => setSelectedShipId(ship.id)}
                className={`w-full text-left p-3 rounded-lg border transition ${
                  selectedShipId === ship.id
                    ? 'bg-cyan-950/60 border-cyan-400 text-cyan-200'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="font-bold text-sm text-slate-100">{i18n.t(ship.nameKey)}</div>
                <div className="text-xs text-slate-500 font-mono">ID: {ship.id}</div>
                <div className="text-[11px] text-slate-400 mt-1">
                  HP: {ship.hitpoints} | 装甲: {ship.armorRating} | 幅能: {ship.maxFlux}
                </div>
              </button>
            ))}
          </div>

          {/* 右侧：战舰蓝图详情 & JSON 导入导出 */}
          <div className="flex-1 flex flex-col p-6 overflow-y-auto">
            {currentShip && (
              <div className="space-y-6">
                {/* 战舰标题与快速试驾 */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div>
                    <h3 className="text-lg font-bold text-cyan-300">
                      {i18n.t(currentShip.nameKey)}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 max-w-xl">
                      {i18n.t(currentShip.descKey)}
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        onSelectShip(currentShip.id);
                        onClose();
                      }}
                      className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-lg transition"
                    >
                      驾驶该舰进入战场
                    </button>
                    <button
                      onClick={handleCopyJson}
                      className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg transition border border-slate-700"
                    >
                      {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                      <span>{copied ? '已复制蓝图 JSON' : '复制蓝图 JSON'}</span>
                    </button>
                  </div>
                </div>

                {/* 属性网格 */}
                <div className="grid grid-cols-4 gap-3 text-xs">
                  <div className="bg-slate-950 p-3 rounded border border-slate-800">
                    <div className="text-slate-500">结构值 HP</div>
                    <div className="text-emerald-400 font-bold text-sm">{currentShip.hitpoints}</div>
                  </div>
                  <div className="bg-slate-950 p-3 rounded border border-slate-800">
                    <div className="text-slate-500">基础装甲 rating</div>
                    <div className="text-amber-400 font-bold text-sm">{currentShip.armorRating}</div>
                  </div>
                  <div className="bg-slate-950 p-3 rounded border border-slate-800">
                    <div className="text-slate-500">幅能容量 / 耗散</div>
                    <div className="text-cyan-400 font-bold text-sm">
                      {currentShip.maxFlux} / {currentShip.fluxDissipation}
                    </div>
                  </div>
                  <div className="bg-slate-950 p-3 rounded border border-slate-800">
                    <div className="text-slate-500">战术系统 System</div>
                    <div className="text-fuchsia-400 font-bold text-sm">{currentShip.systemType}</div>
                  </div>
                </div>

                {/* 挂点槽位展示 */}
                <div>
                  <div className="text-xs font-bold text-slate-300 mb-2">
                    挂点配置 ({currentShip.weaponSlots.length} 门火炮)
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {currentShip.weaponSlots.map((slot) => (
                      <div
                        key={slot.slotId}
                        className="bg-slate-950 border border-slate-800 p-2.5 rounded flex items-center justify-between"
                      >
                        <div>
                          <span className="font-bold text-slate-200">{slot.slotId}</span>
                          <span className="text-slate-500 ml-2">[{slot.mountType} {slot.slotSize}]</span>
                        </div>
                        <span className="text-cyan-400">
                          {slot.defaultWeaponId || 'EMPTY'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 自定义 Mod 蓝图导入区域 */}
                <div className="border-t border-slate-800 pt-4">
                  <div className="text-xs font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                    <Plus size={14} className="text-cyan-400" />
                    <span>导入自定义舰船 Mod 蓝图 JSON</span>
                  </div>
                  <textarea
                    value={jsonInput}
                    onChange={(e) => setJsonInput(e.target.value)}
                    placeholder='在此粘贴自定舰船 JSON (例如基于复制的蓝图调整属性后粘贴)...'
                    className="w-full h-24 bg-slate-950 border border-slate-800 rounded p-2 text-xs font-mono text-slate-300 focus:outline-none focus:border-cyan-500"
                  />
                  {importError && (
                    <div className="text-xs text-red-400 mt-1">{importError}</div>
                  )}
                  <div className="flex justify-end mt-2">
                    <button
                      onClick={handleImportJson}
                      disabled={!jsonInput.trim()}
                      className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white text-xs font-bold rounded transition"
                    >
                      注册并加载新战舰 Mod
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
