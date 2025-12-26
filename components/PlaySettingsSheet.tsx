import React from 'react';
import { X } from 'lucide-react';

export type PlaySettings = {
  autoFetchMeta: boolean;
  preferHiRes: boolean;
  autoHiRes: boolean;
  personalize: boolean;
  layoutStyle: 'classic' | 'immersive';
};

interface Props {
  open: boolean;
  onClose: () => void;
  settings: PlaySettings;
  onToggle: (key: keyof PlaySettings, label: string) => void;
  onManualMatchMeta?: () => void;
  onManualHiRes?: () => void;
  onLayoutChange?: (layout: PlaySettings['layoutStyle']) => void;
}

const ToggleRow: React.FC<{ title: string; desc: string; checked: boolean; onToggle: () => void }> = ({
  title,
  desc,
  checked,
  onToggle,
}) => (
  <button
    onClick={onToggle}
    className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-neutral-800/50 hover:bg-neutral-800 active:scale-[0.99] transition-all text-left"
  >
    <div className="pr-4">
      <div className="text-white text-sm font-semibold truncate">{title}</div>
      <div className="text-xs text-slate-400 mt-1 leading-relaxed">{desc}</div>
    </div>
    <div
      className={`relative w-11 h-6 rounded-full transition-colors ${checked ? 'bg-indigo-500' : 'bg-slate-700'}`}
    >
      <div
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
      />
    </div>
  </button>
);

const PlaySettingsSheet: React.FC<Props> = ({
  open,
  onClose,
  settings,
  onToggle,
  onManualMatchMeta,
  onManualHiRes,
  onLayoutChange,
}) => {
  if (!open) return null;

  return (
    <div className="swiper-no-swiping fixed inset-0 z-[9999]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="absolute left-0 right-0 bottom-0 bg-[#121212] rounded-t-3xl border-t border-white/10 px-5 animate-in slide-in-from-bottom-10 duration-200 max-h-[75vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-white font-bold text-lg pt-3">播放页设置</h3>
            <p className="text-xs text-slate-400 mt-1">歌词封面、音质偏好与个性化样式</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors">
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            onClick={onManualMatchMeta}
            className="w-full px-3 py-3 rounded-2xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 active:scale-[0.99] transition-all"
          >
            匹配词图
          </button>
          <button
            onClick={onManualHiRes}
            className="w-full px-3 py-3 rounded-2xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 active:scale-[0.99] transition-all"
          >
            获取更高音质
          </button>
        </div>

        <div className="overflow-y-auto no-scrollbar space-y-3 flex-1 pb-10">
          <ToggleRow
            title="自动获取词图"
            desc="联网自动补全歌词和封面信息"
            checked={settings.autoFetchMeta}
            onToggle={() => onToggle('autoFetchMeta', '自动获取词图')}
          />
          <ToggleRow
            title="自动获取更高音质"
            desc="播放时自动尝试高码率资源"
            checked={settings.autoHiRes}
            onToggle={() => onToggle('autoHiRes', '自动获取更高音质')}
          />

          <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-neutral-800/50">
            <div>
              <div className="text-white text-sm font-semibold">播放页样式</div>
              <div className="text-xs text-slate-400 mt-1">经典 / 沉浸切换</div>
            </div>
            <div className="flex gap-2">
              {(['classic', 'immersive'] as PlaySettings['layoutStyle'][]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => onLayoutChange?.(mode)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold ${settings.layoutStyle === mode
                      ? 'bg-indigo-500 text-white'
                      : 'bg-white/10 text-slate-200 hover:bg-white/20'
                    }`}
                >
                  {mode === 'classic' ? '经典' : '沉浸'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlaySettingsSheet;
