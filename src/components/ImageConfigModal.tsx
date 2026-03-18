import { useState } from 'react';
import { Socket } from 'socket.io-client';
import { Image as ImageIcon, X } from 'lucide-react';
import { ImageConfig } from '../shared/types';

interface ImageConfigModalProps {
  socket: Socket;
  currentConfig?: ImageConfig;
  onClose: () => void;
}

export default function ImageConfigModal({ socket, currentConfig, onClose }: ImageConfigModalProps) {
  const [config, setConfig] = useState<ImageConfig>(currentConfig || {
    heroTokens: Array(12).fill(''),
    heroCards: Array(12).fill(''),
    actionCards: Array(50).fill(''),
    t1Cards: Array(12).fill(''),
    t2Cards: Array(12).fill(''),
    t3Cards: Array(4).fill('')
  });

  const [activeTab, setActiveTab] = useState<'heroes' | 'action' | 'treasures'>('heroes');

  const handleSave = () => {
    socket.emit('update_image_config', config);
    onClose();
  };

  const updateArray = (key: keyof ImageConfig, index: number, value: string) => {
    setConfig(prev => {
      const newArray = [...prev[key]];
      newArray[index] = value;
      return { ...prev, [key]: newArray };
    });
  };

  const batchUpdate = (key: keyof ImageConfig, value: string) => {
    const urls = value.split('\n').map(s => s.trim()).filter(Boolean);
    setConfig(prev => {
      const newArray = [...prev[key]];
      urls.forEach((url, i) => {
        if (i < newArray.length) newArray[i] = url;
      });
      return { ...prev, [key]: newArray };
    });
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
            <ImageIcon size={20} className="text-indigo-400" />
            Image Configuration
          </h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex border-b border-zinc-800">
          <button 
            className={`px-6 py-3 text-sm font-medium transition-colors ${activeTab === 'heroes' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-zinc-400 hover:text-zinc-200'}`}
            onClick={() => setActiveTab('heroes')}
          >
            Heroes (Tokens & Cards)
          </button>
          <button 
            className={`px-6 py-3 text-sm font-medium transition-colors ${activeTab === 'action' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-zinc-400 hover:text-zinc-200'}`}
            onClick={() => setActiveTab('action')}
          >
            Action Cards (50)
          </button>
          <button 
            className={`px-6 py-3 text-sm font-medium transition-colors ${activeTab === 'treasures' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-zinc-400 hover:text-zinc-200'}`}
            onClick={() => setActiveTab('treasures')}
          >
            Treasure Cards
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {activeTab === 'heroes' && (
            <div className="grid grid-cols-2 gap-8">
              <div>
                <h3 className="text-zinc-300 font-medium mb-4">Hero Tokens (12)</h3>
                <textarea 
                  placeholder="Paste up to 12 URLs separated by newlines to batch update..."
                  className="w-full h-24 bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-200 mb-4 focus:ring-1 focus:ring-indigo-500 outline-none"
                  onChange={(e) => batchUpdate('heroTokens', e.target.value)}
                />
                <div className="flex flex-col gap-2">
                  {config.heroTokens.map((url, i) => (
                    <input 
                      key={i}
                      type="text"
                      value={url}
                      onChange={(e) => updateArray('heroTokens', i, e.target.value)}
                      placeholder={`Hero ${i+1} Token URL`}
                      className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded p-2 text-xs text-zinc-300 outline-none focus:border-indigo-500"
                    />
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-zinc-300 font-medium mb-4">Hero Lv3 Cards (12)</h3>
                <textarea 
                  placeholder="Paste up to 12 URLs separated by newlines to batch update..."
                  className="w-full h-24 bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-200 mb-4 focus:ring-1 focus:ring-indigo-500 outline-none"
                  onChange={(e) => batchUpdate('heroCards', e.target.value)}
                />
                <div className="flex flex-col gap-2">
                  {config.heroCards.map((url, i) => (
                    <input 
                      key={i}
                      type="text"
                      value={url}
                      onChange={(e) => updateArray('heroCards', i, e.target.value)}
                      placeholder={`Hero ${i+1} Card URL`}
                      className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded p-2 text-xs text-zinc-300 outline-none focus:border-indigo-500"
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'action' && (
            <div>
              <h3 className="text-zinc-300 font-medium mb-4">Action Cards (50)</h3>
              <textarea 
                placeholder="Paste up to 50 URLs separated by newlines to batch update..."
                className="w-full h-32 bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-200 mb-4 focus:ring-1 focus:ring-indigo-500 outline-none"
                onChange={(e) => batchUpdate('actionCards', e.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                {config.actionCards.map((url, i) => (
                  <input 
                    key={i}
                    type="text"
                    value={url}
                    onChange={(e) => updateArray('actionCards', i, e.target.value)}
                    placeholder={`Action Card ${i+1} URL`}
                    className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded p-2 text-xs text-zinc-300 outline-none focus:border-indigo-500"
                  />
                ))}
              </div>
            </div>
          )}

          {activeTab === 'treasures' && (
            <div className="grid grid-cols-3 gap-6">
              <div>
                <h3 className="text-zinc-300 font-medium mb-4">T1 Cards (12)</h3>
                <textarea 
                  placeholder="Batch update..."
                  className="w-full h-24 bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-200 mb-4 focus:ring-1 focus:ring-indigo-500 outline-none"
                  onChange={(e) => batchUpdate('t1Cards', e.target.value)}
                />
                <div className="flex flex-col gap-2">
                  {config.t1Cards.map((url, i) => (
                    <input 
                      key={i}
                      type="text"
                      value={url}
                      onChange={(e) => updateArray('t1Cards', i, e.target.value)}
                      placeholder={`T1 Card ${i+1}`}
                      className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded p-2 text-xs text-zinc-300 outline-none focus:border-indigo-500"
                    />
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-zinc-300 font-medium mb-4">T2 Cards (12)</h3>
                <textarea 
                  placeholder="Batch update..."
                  className="w-full h-24 bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-200 mb-4 focus:ring-1 focus:ring-indigo-500 outline-none"
                  onChange={(e) => batchUpdate('t2Cards', e.target.value)}
                />
                <div className="flex flex-col gap-2">
                  {config.t2Cards.map((url, i) => (
                    <input 
                      key={i}
                      type="text"
                      value={url}
                      onChange={(e) => updateArray('t2Cards', i, e.target.value)}
                      placeholder={`T2 Card ${i+1}`}
                      className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded p-2 text-xs text-zinc-300 outline-none focus:border-indigo-500"
                    />
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-zinc-300 font-medium mb-4">T3 Cards (4)</h3>
                <textarea 
                  placeholder="Batch update..."
                  className="w-full h-24 bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-200 mb-4 focus:ring-1 focus:ring-indigo-500 outline-none"
                  onChange={(e) => batchUpdate('t3Cards', e.target.value)}
                />
                <div className="flex flex-col gap-2">
                  {config.t3Cards.map((url, i) => (
                    <input 
                      key={i}
                      type="text"
                      value={url}
                      onChange={(e) => updateArray('t3Cards', i, e.target.value)}
                      placeholder={`T3 Card ${i+1}`}
                      className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded p-2 text-xs text-zinc-300 outline-none focus:border-indigo-500"
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-zinc-800 flex justify-end gap-3 bg-zinc-900/50 rounded-b-xl">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-indigo-500/20"
          >
            Save & Apply
          </button>
        </div>
      </div>
    </div>
  );
}
