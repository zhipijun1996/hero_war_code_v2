import React from 'react';
import { Socket } from 'socket.io-client';

interface HirePopupProps {
  hirePopup: { cardId: string } | null;
  setHirePopup: (popup: any) => void;
  socket: Socket;
}

const HirePopup: React.FC<HirePopupProps> = ({ hirePopup, setHirePopup, socket }) => {
  if (!hirePopup) return null;

  return (
    <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-[300] pointer-events-auto backdrop-blur-sm" onClick={() => setHirePopup(null)}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-sm w-full shadow-2xl flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-xl font-bold text-white mb-2">花费多少金币雇佣？</h3>
        <div className="grid grid-cols-4 gap-3 w-full">
          {[2, 3, 4, 5, 6, 7, 8, 9].map(amount => (
            <button
              key={amount}
              className="bg-zinc-800 hover:bg-emerald-600 text-white font-bold py-3 rounded-lg border border-zinc-700 hover:border-emerald-500 transition-colors"
              onClick={() => {
                socket.emit('select_option', 'hire');
                socket.emit('select_target', hirePopup.cardId);
                socket.emit('select_hire_cost', amount);
                setHirePopup(null);
              }}
            >
              {amount}
            </button>
          ))}
        </div>
        <button 
          className="mt-4 text-zinc-400 hover:text-white text-sm"
          onClick={() => setHirePopup(null)}
        >
          取消 (Cancel)
        </button>
      </div>
    </div>
  );
};

export default HirePopup;
