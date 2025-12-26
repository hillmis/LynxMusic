import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Download,
  Pause,
  Play,
  FolderOpen,
  Share2,
  Trash2,
  RefreshCw,
  CheckCircle2,
  FileMusic,
  Film,
  Image as ImageIcon
} from 'lucide-react';
import { DownloadTask, Song } from '../types';
import {
  subscribeDownloadTasks,
  getDownloadTasks,
  removeDownloadTask,
  clearFinishedTasks,
  getDownloadConfig,
  setDownloadConcurrency,
  startAllDownloads,
  pauseAllDownloads,
  toggleDownloadTask
} from '../utils/downloadManager';
import { deleteFileSafely, safeToast, getNative } from '../utils/fileSystem';

interface DownloadManagerProps {
  onBack: () => void;
  onPlaySong?: (song: Song) => void;
}

const typeIcon = (type: DownloadTask['type']) => {
  if (type === 'mv') return <Film size={18} />;
  if (type === 'picture') return <ImageIcon size={18} />;
  return <FileMusic size={18} />;
};

const DownloadManager: React.FC<DownloadManagerProps> = ({ onBack }) => {
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [concurrency, setConcurrency] = useState<number>(() => getDownloadConfig().concurrency);
  const native = getNative();

  useEffect(() => {
    const unsubscribe = subscribeDownloadTasks(setTasks);
    return () => unsubscribe();
  }, []);

  const sorted = useMemo(
    () => [...tasks].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [tasks]
  );
  const active = useMemo(
    () => sorted.filter(t => t.status === 'pending' || t.status === 'downloading' || t.status === 'failed'),
    [sorted]
  );
  const completed = useMemo(() => sorted.filter(t => t.status === 'completed'), [sorted]);
  const hasDownloading = useMemo(() => active.some(t => t.status === 'downloading'), [active]);

  const refresh = () => setTasks(getDownloadTasks());

  const handleOpenFile = (task: DownloadTask) => {
    if (!task.path) {
      safeToast('暂无本地路径');
      return;
    }
    const opener = native?.file?.open;
    opener?.(task.path);
  };

  const handleShareFile = (task: DownloadTask) => {
    if (!task.path) {
      safeToast('暂无本地路径');
      return;
    }
    const share = native?.file?.share;
    share?.(task.path);
  };

  const handleRemove = (task: DownloadTask, withFile = false) => {
    if (withFile && task.path) deleteFileSafely(task.path);
    removeDownloadTask(task.id);
    refresh();
  };

  const handleToggle = (task: DownloadTask) => {
    toggleDownloadTask(task.id);
    refresh();
  };

  const pauseAll = () => {
    pauseAllDownloads();
    refresh();
  };

  return (
    <div className="h-full bg-[#121212] overflow-y-auto no-scrollbar pb-28 animate-in slide-in-from-right duration-300">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 bg-[#121212]/95 backdrop-blur-md px-4 py-4 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-full hover:bg-white/10 text-white">
            <ArrowLeft size={22} />
          </button>
          <div>
            <h1 className="text-lg font-bold text-white">下载与缓存</h1>
            <p className="text-[11px] text-slate-500">文件默认保存在 ~/LynxMusic/download</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { clearFinishedTasks(); refresh(); }}
            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            title="清理已完成任务"
          >
            <Trash2 size={18} />
          </button>
          <button
            onClick={refresh}
            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* 列表区域 */}
      <div className="p-4 space-y-6">
        <Section title="下载任务" icon={<Download size={16} />} emptyHint="暂无任务" count={active.length}>
          {active.map(task => (
            <DownloadItem
              key={task.id}
              task={task}
              onOpen={handleOpenFile}
              onShare={handleShareFile}
              onRemove={(withFile) => handleRemove(task, withFile)}
              onToggle={handleToggle}
            />
          ))}
        </Section>

        <Section title="下载完成" icon={<CheckCircle2 size={16} />} emptyHint="暂无完成的下载" count={completed.length}>
          {completed.map(task => (
            <DownloadItem
              key={task.id}
              task={task}
              onOpen={handleOpenFile}
              onShare={handleShareFile}
              onRemove={(withFile) => handleRemove(task, withFile)}
            />
          ))}
        </Section>
      </div>

      {/* 底部控制栏 */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-[#121212]/95 backdrop-blur-md border-t border-white/5 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-white/80">
          <span className="mr-1">并发数</span>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 5, 10].map(val => (
              <button
                key={val}
                onClick={() => {
                  setConcurrency(val);
                  setDownloadConcurrency(val);
                }}
                className={`px-2 py-1 rounded-full border text-xs ${
                  concurrency === val
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10'
                }`}
              >
                {val}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (hasDownloading) return pauseAll();
              if (!active.length) {
                safeToast('没有可开始的下载');
                return;
              }
              startAllDownloads(true);
              refresh();
            }}
            className={`px-3 py-2 rounded-full text-white text-xs font-bold active:scale-95 transition-colors ${hasDownloading ? 'bg-slate-700 hover:bg-slate-600' : 'bg-indigo-600 hover:bg-indigo-500'}`}
          >
            {hasDownloading ? (
              <span className="inline-flex items-center gap-1">
                <Pause size={14} /> 全部暂停
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Play size={14} /> 全部开始
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; icon: React.ReactNode; emptyHint: string; count?: number; children?: React.ReactNode; defaultOpen?: boolean }> = ({
  title,
  icon,
  emptyHint,
  count,
  children,
  defaultOpen = true
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const hasContent = React.Children.count(children) > 0;
  return (
    <div className="bg-slate-800/40 rounded-2xl border border-white/5 p-3">
      <button
        className="w-full flex items-center gap-2 mb-3 text-white text-sm font-bold justify-between"
        onClick={() => setOpen(o => !o)}
      >
        <span className="flex items-center gap-2">
          {icon}
          <span>{title}</span>
          {typeof count === 'number' && (
            <span className="text-[11px] text-slate-400 bg-white/5 rounded-full px-2 py-0.5">
              {count}
            </span>
          )}
        </span>
        <span className="text-[11px] text-slate-400">{open ? '收起' : '展开'}</span>
      </button>
      {open && (
        hasContent ? (
          <div className="space-y-2">{children}</div>
        ) : (
          <div className="text-center text-slate-500 text-xs py-8">{emptyHint}</div>
        )
      )}
      {!open && !hasContent && <div className="text-center text-slate-500 text-xs pb-2">{emptyHint}</div>}
    </div>
  );
};

const DownloadItem: React.FC<{
  task: DownloadTask;
  onOpen?: (task: DownloadTask) => void;
  onShare?: (task: DownloadTask) => void;
  onRemove?: (withFile?: boolean) => void;
  onToggle?: (task: DownloadTask) => void;
}> = ({ task, onOpen, onShare, onRemove, onToggle }) => {
  const statusText =
    task.status === 'completed'
      ? '已完成'
      : task.status === 'failed'
        ? '下载失败'
        : task.status === 'pending'
          ? '待下载'
          : '下载中';

  const isActive = task.status === 'pending' || task.status === 'downloading';

  return (
    <div className="flex items-center p-3 rounded-xl bg-[#121212] border border-white/5">
      <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-indigo-400 mr-3">
        {typeIcon(task.type)}
      </div>
      <div className="flex-1 min-w-0 mr-3">
        <div className="text-white text-sm font-medium truncate">{task.title}</div>
        <div className="text-[11px] text-slate-500 truncate">{task.artist || '未知歌手'}</div>
        <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${task.status === 'failed' ? 'bg-rose-500' : 'bg-indigo-500'}`}
            style={{ width: `${Math.min(100, Math.max(0, task.progress))}%` }}
          />
        </div>
        <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
          <span>{statusText}</span>
          {task.error && <span className="text-rose-400">· {task.error}</span>}
          {task.path && <span className="truncate text-slate-600">· {task.path}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {isActive && onToggle && (
          <button
            onClick={() => onToggle(task)}
            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10"
            title={task.status === 'downloading' ? '暂停' : '继续'}
          >
            {task.status === 'downloading' ? <Pause size={16} /> : <Play size={16} />}
          </button>
        )}
        {onOpen && task.path && (
          <button
            onClick={() => onOpen(task)}
            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10"
            title="打开文件"
          >
            <FolderOpen size={16} />
          </button>
        )}
        {onShare && task.path && (
          <button
            onClick={() => onShare(task)}
            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10"
            title="分享文件"
          >
            <Share2 size={16} />
          </button>
        )}
        {onRemove && (
          <button
            onClick={() => onRemove(true)}
            className="p-2 rounded-full text-slate-400 hover:text-rose-400 hover:bg-white/10"
            title="移除记录并删除文件"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
};

export default DownloadManager;
