import React, { useState, useEffect } from 'react';
import { CombatEngine } from '../../engine/simulation/CombatEngine';

/**
 * 战术无线电通讯日志终端 (Tactical Radio Chatter Terminal)
 */
export const RadioChatterLog: React.FC<{ engine: CombatEngine }> = ({ engine }) => {
  const [messages, setMessages] = useState<typeof engine.radioMessages>([]);

  useEffect(() => {
    const timer = setInterval(() => {
      setMessages([...engine.radioMessages]);
    }, 120);
    return () => clearInterval(timer);
  }, [engine]);

  if (messages.length === 0) return null;

  return (
    <div className="flex flex-col-reverse gap-1.5 pointer-events-none max-w-md select-none">
      {messages.slice(-4).reverse().map((msg) => (
        <div
          key={msg.id}
          className="flex items-start gap-2 px-2.5 py-1.5 rounded bg-[#0a141c]/90 border border-[#46c8ff]/25 backdrop-blur text-[11px] shadow-lg animate-in fade-in slide-in-from-left-2 duration-200"
          style={{ borderLeftColor: `rgb(${msg.color.join(',')})`, borderLeftWidth: 3 }}
        >
          <span
            className="font-bold shrink-0 text-[10px] uppercase tracking-wider font-mono"
            style={{ color: `rgb(${msg.color.join(',')})` }}
          >
            [{msg.sender}]
          </span>
          <span className="text-[#cbf5ff]/90 leading-tight font-sans text-[11px]">
            {msg.text}
          </span>
        </div>
      ))}
    </div>
  );
};
