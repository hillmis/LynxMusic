import React, { useCallback, useEffect, useMemo, useState } from 'react';
// 新增 ChevronLeft, ChevronRight 图标
import { ArrowLeft, Calendar, CheckCircle2, Gift, Coins, Zap, Loader2, Download, ShieldCheck, ChevronLeft, ChevronRight, SunIcon } from 'lucide-react';
import { safeToast } from '../utils/fileSystem';
import { getListenRecords } from '../utils/db';
import { getNative } from '../utils/nativeBridge';
import { DOWNLOAD_COST, REWARD_EVENTS, addPointsBalance, getDownloadChances, getPointsBalance, hasDownloadPrivilege, redeemDownloadChance, unlockDownloadPrivilege } from '../utils/rewards';

interface CheckInProps {
  onBack: () => void;
}

type TaskItem = {
  id: string;
  title: string;
  points: number;
  type?: 'daily' | 'once';
  description?: string;
  requirement?: TaskRequirement;
};

type TaskRequirement =
  | { type: 'sign' }
  | { type: 'listen_minutes'; minutes: number }
  | { type: 'discover_visit' }
  | { type: 'collect_count'; count: number }
  | { type: 'quark_transfer'; link?: string }
  | { type: 'manual'; hint?: string };

const TASK_SOURCE_URLS = [
  'https://raw.gitmirror.com/hillmis/versionControl/main/LynxMusicTask.json',
  'https://gcore.jsdelivr.net/gh/hillmis/versionControl@main/LynxMusicTask.json',
  'https://hub.gitmirror.com/https://github.com/hillmis/versionControl/raw/main/LynxMusicTask.json'
];

const SIGN_POINTS = 10;
const QUARK_PACKAGE = 'com.quark.browser';
const QUARK_STORE_URL = 'market://details?id=com.quark.browser';
const STORAGE_KEYS = {
  points: 'hm_points_balance_v2',
  signIns: 'hm_sign_in_history_v2',
  taskProgress: 'hm_task_progress_v2',
  discoverVisit: 'hm_discover_visit_v1',
  collectStat: 'hm_collect_stat_v1',
  quarkTransfer: 'hm_quark_transfer_v1'
};
const SHARE_TEXT = `来Lynx Music遇见知音，下载更新地址：\nhttps://pan.quark.cn/s/be0691bb5331#/`;

const DEFAULT_TASKS: TaskItem[] = [
  {
    id: 'daily_sign',
    title: '每日签到',
    points: SIGN_POINTS,
    type: 'daily',
    description: '登录后签到领取基础积分',
    requirement: { type: 'sign' }
  },
  {
    id: 'listen_30',
    title: '收听满 30 分钟',
    points: 20,
    type: 'daily',
    description: '任意播放累计 30 分钟',
    requirement: { type: 'listen_minutes', minutes: 30 }
  },
  {
    id: 'explore',
    title: '浏览发现页',
    points: 5,
    type: 'daily',
    description: '打开发现页看看今日推荐',
    requirement: { type: 'discover_visit' }
  },
  {
    id: 'collect_new',
    title: '收藏 3 首新歌',
    points: 10,
    type: 'daily',
    description: '把喜欢的歌曲加入收藏或歌单',
    requirement: { type: 'collect_count', count: 3 }
  }
];

// --- 辅助函数 ---

const handleShareApp = async () => {
  const native = getNative();
  const text = SHARE_TEXT;

  try {
    if (native?.system?.shareText) {
      native.system.shareText(text);
      return true;
    } else if (navigator.share) {
      await navigator.share({
        title: 'Lynx Music',
        text: text,
      });
      return true;
    } else {
      native?.app?.copy?.(text);
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      }
      safeToast?.('已复制分享文案，请手动发送给好友');
      return true;
    }
  } catch (err) {
    console.error('分享失败', err);
    return false;
  }
};

const formatDateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const readStoredJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const readStoredSet = (key: string) => new Set<string>(readStoredJson<string[]>(key, []));

const normalizeRequirement = (raw: any): TaskRequirement | undefined => {
  if (!raw) return undefined;
  const type = raw.type || raw.kind;
  if (type === 'listen_minutes' || type === 'listen') {
    const minutes = Number(raw.minutes ?? raw.value ?? raw.min ?? 0);
    if (Number.isFinite(minutes) && minutes > 0) return { type: 'listen_minutes', minutes };
  }
  if (type === 'discover_visit' || type === 'discover') return { type: 'discover_visit' };
  if (type === 'collect_count' || type === 'collect') {
    const count = Number(raw.count ?? raw.value ?? 0);
    if (Number.isFinite(count) && count > 0) return { type: 'collect_count', count };
  }
  if (type === 'quark_transfer') {
    const link = typeof raw.link === 'string' ? raw.link : typeof raw.url === 'string' ? raw.url : undefined;
    return { type: 'quark_transfer', link };
  }
  if (type === 'sign') return { type: 'sign' };
  if (typeof raw === 'string') return { type: 'manual', hint: raw };
  if (typeof raw?.hint === 'string') return { type: 'manual', hint: raw.hint };
  return undefined;
};

const normalizeTasks = (raw: any): TaskItem[] => {
  const source = Array.isArray(raw?.tasks) ? raw.tasks : Array.isArray(raw) ? raw : [];
  return source
    .map((item: any, idx: number): TaskItem | null => {
      const title = typeof item?.title === 'string' ? item.title : typeof item?.name === 'string' ? item.name : `任务 ${idx + 1}`;
      const id = String(item?.id || item?.key || title || idx);
      const rawPoints = Number(item?.points ?? item?.reward ?? item?.rewardPoints ?? 0);
      const points = Number.isFinite(rawPoints) && rawPoints > 0 ? rawPoints : SIGN_POINTS;
      const type: TaskItem['type'] = item?.type === 'once' ? 'once' : 'daily';
      const description = typeof item?.description === 'string' ? item.description : undefined;
      const requirement = normalizeRequirement(item?.requirement ?? item?.require ?? item?.condition);
      if (!id || !title) return null;
      return { id, title, points, type, description, requirement };
    })
    .filter(Boolean) as TaskItem[];
};

const mergeTasks = (remote: TaskItem[]) => {
  const existedIds = new Set(DEFAULT_TASKS.map(t => t.id));
  const extras = remote.filter(t => !existedIds.has(t.id));
  return [...DEFAULT_TASKS, ...extras];
};

const CheckIn: React.FC<CheckInProps> = ({ onBack }) => {
  const todayKey = useMemo(() => formatDateKey(new Date()), []);

  const [points, setPoints] = useState(() => getPointsBalance());
  const [downloadChances, setDownloadChances] = useState(() => getDownloadChances());
  const [privileged, setPrivileged] = useState(() => hasDownloadPrivilege());
  const [privilegeCode, setPrivilegeCode] = useState('');
  const [privilegeLoading, setPrivilegeLoading] = useState(false);
  const [signIns, setSignIns] = useState<Set<string>>(() => readStoredSet(STORAGE_KEYS.signIns));
  
  // 新增：当前查看的月份状态
  const [viewDate, setViewDate] = useState(new Date());

  const [tasks, setTasks] = useState<TaskItem[]>(DEFAULT_TASKS);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);
  
  const [taskProgress, setTaskProgress] = useState<Record<string, string>>(() =>
    readStoredJson(STORAGE_KEYS.taskProgress, {})
  );
  
  const [listenMinutes, setListenMinutes] = useState(0);
  const [collectCount, setCollectCount] = useState(0);
  const [discoverVisited, setDiscoverVisited] = useState(false);
  const [quarkInstalled, setQuarkInstalled] = useState(false);
  const [quarkTransferDone, setQuarkTransferDone] = useState(() => readStoredJson<string | null>(STORAGE_KEYS.quarkTransfer, null) === todayKey);

  // --- 获取远程任务 ---
  useEffect(() => {
    const loadTasks = async () => {
      setLoadingTasks(true); 
      setTaskError(null);
      try {
        const tryFetchList = async () => {
          for (const base of TASK_SOURCE_URLS) {
            try {
              const resp = await fetch(`${base}?t=${Date.now()}`, { mode: 'cors' });
              if (!resp.ok) continue;
              const json = await resp.json();
              if (json) return json;
            } catch {
              continue;
            }
          }
          throw new Error('所有任务源不可用');
        };
        const data = await tryFetchList();
        const parsed = normalizeTasks(data);
        if (parsed.length > 0) {
          setTasks(prev => mergeTasks(parsed));
        }
      } catch (err) {
        console.warn('远程任务加载失败，仅显示内置任务', err);
        setTaskError('加载更多任务失败');
      } finally {
        setLoadingTasks(false);
      }
    };
    loadTasks();
  }, []);

  // ... (中间 Effects 保持不变) ...

  useEffect(() => {
    const handlePointsChange = (e: any) => setPoints(typeof e?.detail?.balance === 'number' ? e.detail.balance : getPointsBalance());
    const handleChanceChange = (e: any) => setDownloadChances(typeof e?.detail?.chances === 'number' ? e.detail.chances : getDownloadChances());
    const handlePrivilegeChange = (e: any) => setPrivileged(e?.detail?.privileged ?? hasDownloadPrivilege());
    window.addEventListener(REWARD_EVENTS.pointsChanged, handlePointsChange);
    window.addEventListener(REWARD_EVENTS.chanceChanged, handleChanceChange);
    window.addEventListener(REWARD_EVENTS.privilegeChanged, handlePrivilegeChange);
    return () => {
      window.removeEventListener(REWARD_EVENTS.pointsChanged, handlePointsChange);
      window.removeEventListener(REWARD_EVENTS.chanceChanged, handleChanceChange);
      window.removeEventListener(REWARD_EVENTS.privilegeChanged, handlePrivilegeChange);
    };
  }, []);

  const syncDailyProgress = useCallback(async () => {
    try {
      const records = await getListenRecords({ includeCleared: true });
      const totalSeconds = records
        .filter(r => (r.dayKey || formatDateKey(new Date(r.ts))) === todayKey)
        .reduce((acc, cur) => acc + (cur.playedSeconds || 0), 0);
      setListenMinutes(Math.floor(totalSeconds / 60));
    } catch {
      setListenMinutes(0);
    }

    const collect = readStoredJson<{ date: string; count: number } | null>(STORAGE_KEYS.collectStat, null);
    if (collect && collect.date === todayKey) {
      setCollectCount(Math.max(0, Number(collect.count) || 0));
    } else {
      setCollectCount(0);
    }

    const visit = readStoredJson<{ date: string } | null>(STORAGE_KEYS.discoverVisit, null);
    setDiscoverVisited(!!visit && visit.date === todayKey);
  }, [todayKey]);

  useEffect(() => {
    const native = getNative();
    setQuarkInstalled(!!native?.control?.exists?.(QUARK_PACKAGE));
    syncDailyProgress();
    const handleUpdate = () => syncDailyProgress();
    window.addEventListener('listen-history-updated', handleUpdate);
    window.addEventListener('playlist-updated', handleUpdate);
    window.addEventListener('hm-discover-visited', handleUpdate);
    return () => {
      window.removeEventListener('listen-history-updated', handleUpdate);
      window.removeEventListener('playlist-updated', handleUpdate);
      window.removeEventListener('hm-discover-visited', handleUpdate);
    };
  }, [syncDailyProgress]);

  // ... (addPoints, handleRedeem, handleUnlock, handleOpenPrivilegeLink, persist functions 保持不变) ...

  const addPoints = (delta: number) => {
    const next = addPointsBalance(delta);
    setPoints(next);
  };

  const handleRedeemDownloadChance = () => {
    if (privileged) {
      safeToast?.('已开启特权下载，无需兑换次数');
      return;
    }
    const res = redeemDownloadChance();
    if (!res.ok) {
      const balance = typeof res.balance === 'number' ? res.balance : getPointsBalance();
      const gap = Math.max(0, DOWNLOAD_COST - balance);
      safeToast?.(`积分不足，还差 ${gap} 分可兑换下载次数`);
      return;
    }
    setPoints(res.balance);
    setDownloadChances(res.chances);
    safeToast?.('兑换成功，已增加 1 次下载次数');
  };

  const handleUnlockPrivilege = async () => {
    if (privileged) {
      safeToast?.('已开启特权下载，无需再输入');
      return;
    }
    const code = privilegeCode.trim();
    if (!code) {
      safeToast?.('请输入特权口令');
      return;
    }
    setPrivilegeLoading(true);
    try {
      const ok = await unlockDownloadPrivilege(code);
      if (!ok) {
        safeToast?.('口令无效，请确认后重试');
        return;
      }
      setPrivileged(true);
      setPrivilegeCode('');
      safeToast?.('特权已开启，下载不再受次数限制');
    } finally {
      setPrivilegeLoading(false);
    }
  };

  const handleOpenPrivilegeLink = () => {
    const url = 'https://link3.cc/liu13';
    const native = getNative();
    native?.control?.openInBrowser?.(url);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const persistSignIns = (list: Set<string>) => {
    const arr = Array.from(list);
    setSignIns(list);
    localStorage.setItem(STORAGE_KEYS.signIns, JSON.stringify(arr));
  };

  const persistTaskProgress = (map: Record<string, string>) => {
    setTaskProgress(map);
    localStorage.setItem(STORAGE_KEYS.taskProgress, JSON.stringify(map));
  };

  const signedToday = signIns.has(todayKey);

  // 新增：切换月份函数
  const changeMonth = (delta: number) => {
    setViewDate(prev => {
      const next = new Date(prev);
      next.setMonth(prev.getMonth() + delta);
      return next;
    });
  };

  // 修改：日历生成逻辑使用 viewDate 而不是 new Date()
  const monthCalendar = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const realToday = new Date(); // 用于判断是否为过去时间，仍然对比真实今天

    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const currentDayDate = new Date(year, month, day);
      const key = formatDateKey(currentDayDate);
      const checked = signIns.has(key);
      // 如果日期比真实的今天早（或者就是今天），且没签到，就显示灰色
      // 这里 isPast 用于显示“过去的、不可操作的样式”或者“已过期的空状态”
      // 简单起见，只要时间 <= 今天，就是 past
      const isPast = currentDayDate.getTime() < new Date(realToday.getFullYear(), realToday.getMonth(), realToday.getDate()).getTime(); 
      const isToday = key === todayKey;

      return { day, key, checked, isPast, isToday };
    });
  }, [signIns, viewDate, todayKey]);

  // ... (Task functions 保持不变) ...

  const isTaskCompleted = (task: TaskItem) => {
    const state = taskProgress[task.id];
    if (!state) return false;
    if (task.type === 'daily') {
      return state === todayKey;
    }
    return true;
  };

  const markQuarkTransferDone = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.quarkTransfer, JSON.stringify(todayKey));
    } catch { }
    setQuarkTransferDone(true);
  }, [todayKey]);

  const getQuarkLink = (task?: TaskItem) => {
    const link = task?.requirement && task.requirement.type === 'quark_transfer' && task.requirement.link;
    return link || '';
  };

  const copyQuarkLink = (link: string) => {
    const native = getNative();
    native?.app?.copy?.(link);
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(link).catch(() => { });
    }
  };

  const openQuarkApp = (link: string) => {
    const native = getNative();
    const opened = native?.control?.openInBrowser?.(link)
    return opened !== false;
  };

  const openQuarkStore = () => {
    const native = getNative();
    native?.control?.openInBrowser?.(QUARK_STORE_URL);
  };

  const handleQuarkTransfer = async (task?: TaskItem) => {
    const link = getQuarkLink(task);
    if (!link) {
      safeToast?.('未配置夸克转存链接');
      return;
    }
    copyQuarkLink(link);
    safeToast?.('夸克转存链接已复制');
    if (quarkInstalled) {
      const ok = openQuarkApp(link);
      if (!ok) safeToast?.('正在打开夸克，请完成转存后返回领取');
    } else {
      safeToast?.('未检测到夸克，将跳转下载');
      openQuarkStore();
    }
  };

 const checkQuarkTransfer = async (task?: TaskItem) => {
    const link = getQuarkLink(task);
    const native = getNative();
    
    // 1. 优先尝试读取剪贴板 (如果用户正好复制了相关内容，直接秒过)
    const clip = native?.app?.getClipboard?.();
    if (typeof clip === 'string' && (clip.includes('pan.quark.cn') || (link && clip.includes(link)))) {
      markQuarkTransferDone();
      return true;
    }

    // 2. 移除弹窗，改为提示并延时
    safeToast?.('正在验证转存结果，请稍候...');
    
    // 延迟 4000 毫秒 (4秒)，给予用户足够的时间跳转应用并完成操作
    // 同时也作为一种"防刷"机制
    await new Promise(resolve => setTimeout(resolve, 4000));

    // 3. 延时结束后自动标记完成
    markQuarkTransferDone();
    return true;
  };

  const requirementStatus = (task: TaskItem): { ok: boolean; message?: string; progress?: string } => {
    const req = task.requirement;
    if (!req) return { ok: true };
    switch (req.type) {
      case 'sign':
        return { ok: signedToday, message: signedToday ? undefined : '请先完成签到' };
      case 'listen_minutes': {
        const ok = listenMinutes >= req.minutes;
        return { ok, message: ok ? undefined : `今日收听 ${listenMinutes} / ${req.minutes} 分钟`, progress: `进度 ${listenMinutes}/${req.minutes} 分钟` };
      }
      case 'discover_visit': {
        const ok = discoverVisited;
        return { ok, message: ok ? undefined : '去“发现”页逛逛即可完成', progress: discoverVisited ? '已访问发现页' : '未访问发现页' };
      }
      case 'collect_count': {
        const ok = collectCount >= req.count;
        return { ok, message: ok ? undefined : `今日收藏 ${collectCount} / ${req.count} 首`, progress: `进度 ${collectCount}/${req.count}` };
      }
      case 'quark_transfer': {
        const ok = quarkTransferDone;
        const progress = quarkInstalled ? '已检测到夸克应用' : '未安装夸克';
        if (!req.link) {
          return { ok: false, message: '任务未配置夸克链接', progress };
        }
        const linkInfo = req.link ? `已填链接: ${req.link}` : '';
        return { ok, message: ok ? undefined : '在夸克完成转存后点击领取', progress: linkInfo || progress };
      }
      case 'manual':
      default:
        return { ok: true, progress: req.hint };
    }
  };

  const completeTask = async (task: TaskItem) => {
    if (isTaskCompleted(task)) return;
    
    // 处理分享任务
    if (task.id === 'share_app') {
        const success = await handleShareApp();
        // 分享动作由用户触发即可，不强求回调验证，直接给分
        if (!success) return; 
    } else {
        const status = requirementStatus(task);
        if (!status.ok) {
          if (task.requirement?.type === 'quark_transfer') {
            await handleQuarkTransfer(task);
            const done = await checkQuarkTransfer(task);
            if (!done) return;
          } else {
            safeToast?.(status.message || '未满足任务要求');
            return;
          }
        }
    }

    const next = { ...taskProgress, [task.id]: task.type === 'daily' ? todayKey : 'done' };
    persistTaskProgress(next);
    addPoints(task.points);
    safeToast?.(`完成任务 +${task.points} 积分`);
  };

  const handleSign = () => {
    if (signedToday) {
      safeToast?.('今天已经签到过了');
      return;
    }
    const next = new Set(signIns);
    next.add(todayKey);
    persistSignIns(next);
    addPoints(SIGN_POINTS);
    
    const signTaskIds = tasks.filter(t => /签到/.test(t.title) || t.requirement?.type === 'sign').map(t => t.id);
    if (signTaskIds.length) {
      const updated = { ...taskProgress };
      signTaskIds.forEach(id => {
        updated[id] = todayKey;
      });
      persistTaskProgress(updated);
    }
    safeToast?.(`签到成功 +${SIGN_POINTS} 积分`);
  };

  const signedCount = useMemo(() => monthCalendar.filter(d => d.checked).length, [monthCalendar]);

  return (
    <div className="h-full overflow-y-auto no-scrollbar bg-[#121212] pb-20 animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#121212]/80 backdrop-blur-md p-4 flex items-center gap-4 border-b border-white/5">
        <button onClick={onBack} className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors">
          <ArrowLeft size={24} className="text-white" />
        </button>
        <h1 className="text-lg font-bold text-white">福利中心</h1>
      </div>

      <div className="p-5 space-y-8">
        {/* Points Card (保持不变) */}
        <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-3xl p-6 shadow-xl relative overflow-hidden">
          <div className="absolute -right-6 -top-6 opacity-20">
            <Gift size={140} className="text-white rotate-12" />
          </div>
          <div className="relative">
            <div className="flex items-center gap-2 mb-1 opacity-90">
              <Coins size={16} className="text-yellow-300" />
              <span className="text-indigo-100 text-sm font-medium">我的积分</span>
            </div>
            <h2 className="text-4xl font-black text-white mb-4 tracking-tight">{points.toLocaleString()}</h2>
            <div className="flex items-center justify-between text-xs text-indigo-100/90 mb-3">
              <span className="flex items-center gap-2">
                <Download size={14} />
                {privileged ? '特权已开启，下载无限制' : `可用下载次数：${downloadChances}`}
              </span>
              {!privileged && <span className="px-2 py-1 rounded-full bg-white/15 text-[11px]">{DOWNLOAD_COST} 积分 / 次</span>}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleRedeemDownloadChance}
                disabled={privileged}
                className={`flex-1 px-2 py-2.5 rounded-xl text-sm font-bold shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2 ${
                  privileged ? 'bg-white/15 text-white cursor-not-allowed' : 'bg-white text-indigo-700 hover:bg-indigo-50'
                }`}
              >
                <Gift size={16} /> 兑换次数
              </button>
              <button
                onClick={handleSign}
                className={`flex-1 px-2 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                  signedToday
                    ? 'bg-white/15 text-white cursor-not-allowed border border-white/15'
                    : 'bg-[#121212] text-white border border-white/20 hover:bg-white/10 active:scale-95'
                }`}
              >
                <Calendar size={16} /> {signedToday ? '今日已签到' : '立即签到'}
              </button>
            </div>
            <p className="text-xs text-indigo-100/80 mt-3">本月已打卡 {signedCount} 天</p>
          </div>
        </div>

      


        {/* Tasks List (保持不变) */}
        <div>
          <div className="flex items-center gap-2 mb-4 px-1">
            <SunIcon className="text-blue-400" size={20} />
            <h3 className="text-white font-bold">今日任务</h3>
          </div>
          
          <div className="space-y-3">
            {tasks.map(task => {
                const completed = isTaskCompleted(task);
                const status = requirementStatus(task);
                return (
                  <div
                    key={task.id}
                    className="flex items-center justify-between bg-[#121212]/60 p-4 rounded-2xl border border-white/5 hover:bg-[#121212]/40 transition-colors gap-4"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          completed ? 'bg-green-500/15 text-green-400' : 'bg-[#0f0f0f] text-slate-500'
                        }`}
                      >
                        {completed ? <CheckCircle2 size={20} /> : <Zap size={20} />}
                      </div>
                      <div className="min-w-0 space-y-1">
                        <p className={`text-sm font-bold truncate ${completed ? 'text-slate-500 line-through' : 'text-white'}`}>
                          {task.title}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                          <span className="flex items-center gap-1 text-yellow-400 whitespace-nowrap">
                            <Coins size={10} /> +{task.points} 积分
                          </span>
                          {task.type === 'once' && <span className="px-2 py-[1px] rounded-full bg-white/10 whitespace-nowrap">限一次</span>}
                        </div>
                        {task.description && (
                          <p className="text-[11px] text-slate-500 line-clamp-2 leading-5 break-words">{task.description}</p>
                        )}
                        {status.message && !status.ok && (
                          <p className="text-[11px] text-amber-400 line-clamp-2 leading-5 break-words">{status.message}</p>
                        )}
                      </div>
                    </div>
                    <button
                      disabled={completed}
                      onClick={() => completeTask(task)}
                      className={`px-2 py-1.5 rounded-full text-xs font-bold transition-all ${
                        completed
                          ? 'bg-[#0f0f0f] text-slate-500 cursor-not-allowed'
                          : 'bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95'
                      }`}
                    >
                      {completed ? '已完成' : '去完成'}
                    </button>
                  </div>
                );
              })}

              {loadingTasks && (
                <div className="flex items-center justify-center py-4 text-slate-500 text-xs gap-2">
                   <Loader2 className="animate-spin" size={14} /> 正在获取更多任务...
                </div>
              )}
              
              {!loadingTasks && taskError && (
                 <div className="text-center py-2 text-[10px] text-slate-600">
                    部分远程任务加载失败，请检查网络
                 </div>
              )}
          </div>
        </div>

        
        {/* Sign-In Calendar (修改点) */}
         <div>
          <div className="flex items-center justify-between mb-4 px-1">
            <div className="flex items-center gap-2">
              <Calendar className="text-blue-400" size={20} />
              <h3 className="text-white font-bold">月签到打卡记录</h3>
            </div>
          {/* 切换月份的控件 */}
            <div className="flex items-center gap-2 bg-[#121212]/60 px-2 py-1 rounded-lg border border-white/5">
              <button 
                onClick={() => changeMonth(-1)} 
                className="p-1 hover:bg-white/10 rounded-md transition-colors text-slate-400 hover:text-white"
              >
                <ChevronLeft size={16} />
              </button>
              
              {/* --- 修改开始：添加 onDoubleClick 和 cursor-pointer --- */}
              <span 
                onClick={() => {
                    setViewDate(new Date()); // 重置为今天
                    safeToast?.('已回到本月'); // 给出提示
                }}
                className="text-xs font-bold text-slate-300 min-w-[5rem] text-center select-none cursor-pointer"
              >
                {viewDate.getFullYear()}年{viewDate.getMonth() + 1}月
              </span>
              {/* --- 修改结束 --- */}

              <button 
                onClick={() => changeMonth(1)} 
                className="p-1 hover:bg-white/10 rounded-md transition-colors text-slate-400 hover:text-white"
              >
                <ChevronRight size={16} />
              </button>
            </div>

          </div>
          <div className="bg-[#121212]/60 p-5 rounded-2xl border border-white/5">
            <div className="grid grid-cols-7 gap-2">
              {monthCalendar.map((d) => (
                <div
                  key={d.key}
                  className={`aspect-square rounded-md flex items-center justify-center text-xs font-bold transition-all relative ${
                    d.checked
                      ? 'bg-indigo-500 text-white shadow-[0_10px_30px_rgba(99,102,241,0.45)]'
                      : d.isToday
                        ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/50'
                        : d.isPast
                          ? 'bg-slate-800/40 text-slate-600'
                          : 'bg-[#0d0d0d] text-slate-500 border border-white/5'
                  }`}
                >
                  {d.day}
                </div>
              ))}
            </div>
             <div className="flex justify-end items-center gap-2 mt-4 text-[10px] text-slate-500">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-indigo-500 rounded-sm" />
                <span>已签到</span>
              </div>
              <div className="flex items-center gap-1 ml-2">
                 <div className="w-2 h-2 bg-indigo-500/20 border border-indigo-500/50 rounded-sm" />
                <span>今天</span>
              </div>
            </div>
          </div>
        </div>

          {/* 特权口令 (保持不变) */}
        <div className="bg-[#121212]/60 p-5 rounded-2xl border border-white/5 space-y-3">
             <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="text-emerald-400" size={18} />
              <h3 className="text-white font-bold text-sm">特权口令</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleOpenPrivilegeLink}
                className="text-[11px] px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-100 border border-indigo-500/30 hover:bg-indigo-500/30 active:scale-95 transition-all"
              >
                获取口令
              </button>
              <span className={`text-[11px] px-2 py-1 rounded-full ${privileged ? 'bg-emerald-500/20 text-emerald-200' : 'bg-white/10 text-slate-300'}`}>
                {privileged ? '已开启' : '待解锁'}
              </span>
            </div>
          </div>
          <p className="text-[11px] text-slate-400">
            输入特权口令可免除下载次数限制。
          </p>
          <div className="flex gap-2">
            <div className="flex-1 bg-[#0d0d0d] border border-white/10 rounded-xl px-3 py-2.5">
             
              <input
                value={privilegeCode}
                onChange={(e) => setPrivilegeCode(e.target.value)}
                disabled={privileged || privilegeLoading}
                placeholder="输入口令解锁无限下载"
                className="w-full bg-transparent text-white outline-none text-sm placeholder:text-slate-600"
              />
            </div>
            <button
              onClick={handleUnlockPrivilege}
              disabled={privileged || privilegeLoading}
              className={`px-4 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-95 ${
                privileged ? 'bg-white/10 text-white cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/30'
              }`}
            >
              {privilegeLoading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
              {privilegeLoading ? '验证中' : '激活'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CheckIn;