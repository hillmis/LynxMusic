import React, { useState, useEffect } from 'react';
import {
    ChevronLeft, Smartphone, HardDrive, RefreshCw,
    Upload, Trash2, Server, Save, Info, AlertTriangle, FileJson,
    CheckCircle2, XCircle, Wifi, PanelsTopLeft, Sparkles, Heart, Star, ArrowRight,
    Maximize, Monitor // 新增图标
} from 'lucide-react';
import { importFullData, clearDatabase, createFullBackup } from '../utils/db';
import { getBackupList, readBackupFile, initFileSystem, PATHS, safeToast } from '../utils/fileSystem';
import { testApiConnection } from '../utils/api';
import { getNative } from '../utils/nativeBridge';

interface SettingsProps {
    onBack: () => void;
    overlayEnabled: boolean;
    overlaySupported?: boolean;
    overlayPermission?: boolean;
    onToggleOverlay: (enable: boolean) => void;
    onRequestOverlayPermission?: () => void;
    onCheckUpdate: () => void;
    onOpenSponsor: () => void;
}

type ConnectionStatus = 'idle' | 'testing' | 'success' | 'error';

const SETTING_FULLSCREEN_KEY = 'hm_setting_fullscreen';

const Settings: React.FC<SettingsProps> = ({
    onBack,
    overlayEnabled,
    overlaySupported = true,
    overlayPermission = false,
    onToggleOverlay,
    onRequestOverlayPermission,
    onCheckUpdate,
    onOpenSponsor
}) => {
    const [backups, setBackups] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [appVersion, setAppVersion] = useState('Loading...');
    
    // 全屏状态
    const [isFullscreen, setIsFullscreen] = useState(false);

    // API Config State
    const [apiHost, setApiHost] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [connStatus, setConnStatus] = useState<ConnectionStatus>('idle');
    const overlayAvailable = overlaySupported !== false;

    useEffect(() => {
        initFileSystem();
        loadBackups();

        // 加载全屏设置
        const savedFullscreen = localStorage.getItem(SETTING_FULLSCREEN_KEY) === 'true';
        setIsFullscreen(savedFullscreen);

        const savedHost = localStorage.getItem('setting_api_host') || '';
        const savedKey = localStorage.getItem('setting_api_key') || '';
        setApiHost(savedHost);
        setApiKey(savedKey);

        if (savedHost && savedKey) {
            setConnStatus('idle');
        }

        const fetchVersion = () => {
            const sys = (window as any).DxxSystem;
            if (sys && typeof sys.getVersion === 'function') {
                setAppVersion(sys.getVersion());
            } else {
                setAppVersion('1.0.0');
            }
        };

        fetchVersion();
        const timer = setTimeout(fetchVersion, 500);
        return () => clearTimeout(timer);
    }, []);

    const loadBackups = () => {
        const list = getBackupList();
        setBackups(list);
    };

    // --- 全屏切换逻辑 ---
    const handleToggleFullscreen = () => {
        const native = getNative();
        const nextState = !isFullscreen;
        
        setIsFullscreen(nextState);
        localStorage.setItem(SETTING_FULLSCREEN_KEY, String(nextState));
        
        // 调用原生接口设置全屏
        if (native?.control?.setFullscreen) {
            native.control.setFullscreen(nextState);
            safeToast(nextState ? '已开启全局全屏' : '已关闭全局全屏');
        } else {
            safeToast('当前环境不支持全屏控制');
        }
    };

    const handleOverlayToggle = () => {
        const native = getNative();
        if (!native) return;

        if (!overlayEnabled) {
            if (!overlayPermission) {
                native.overlay?.requestPermission?.();
                safeToast('请先授权悬浮窗权限');
                return;
            }
            const url = `${window.location.origin}${window.location.pathname}?overlay=1`;
            native.overlay?.launch(url, 360, 520, true, 100, 100);
            onToggleOverlay(true);
        } else {
            native.overlay?.close();
            onToggleOverlay(false);
        }
    };

    const overlayStatus = !overlayAvailable
        ? '不可用'
        : overlayPermission
            ? '已授权'
            : '需要授权';

   // --- API Config Handlers ---
    const handleSaveConfig = async () => {
        const host = apiHost.trim();
        const key = apiKey.trim();

        if (!host || !key) {
            safeToast('请填写完整配置');
            return;
        }

        setConnStatus('testing');

        localStorage.setItem('setting_api_host', host);
        localStorage.setItem('setting_api_key', key);

        const isConnected = await testApiConnection(host, key);

        if (isConnected) {
            setConnStatus('success');
            safeToast('配置保存成功，应用即将重启...');
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        } else {
            setConnStatus('error');
            safeToast('配置已保存，但连接测试失败，请检查');
        }
    };

    // --- Backup Handlers ---
    const handleCreateBackup = async () => {
        if (!window.confirm('确定要创建新的备份吗？')) return;
        setLoading(true);
        try {
            const success = await createFullBackup();
            if (success) {
                loadBackups();
            }
        } catch (e) {
            safeToast('备份创建失败');
        } finally {
            setLoading(false);
        }
    };

    const handleRestore = async (filename: string) => {
        if (!window.confirm(`警告：确定要用 ${filename} 恢复数据吗？\n当前应用内的歌单数据可能会被合并或覆盖。`)) return;
        setLoading(true);
        try {
            const content = readBackupFile(filename);
            if (content) {
                const result = await importFullData(content);
                safeToast(result.msg);
                if (result.success) {
                    setTimeout(() => window.location.reload(), 1500);
                }
            } else {
                safeToast('无法读取备份文件内容');
            }
        } catch (e) {
            safeToast('恢复失败');
        } finally {
            setLoading(false);
        }
    };

    const handleClearCache = async () => {
        if (!window.confirm('危险操作：确定要清空所有应用内数据吗？\n这将删除所有歌单和缓存，但不会删除 /LynxMusic 文件夹下的本地文件。')) return;
        await clearDatabase();
        safeToast('缓存已清空，App将重启');
        setTimeout(() => window.location.reload(), 1000);
    };

    return (
        <div className="h-full bg-[#121212] overflow-y-auto no-scrollbar pb-20 animate-in slide-in-from-right duration-300">
            {/* 标题栏 */}
            <div className="sticky top-0 z-10 bg-[#121212]/95 backdrop-blur border-b border-white/5 p-4 flex items-center gap-3">
                <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-white/10 text-white">
                    <ChevronLeft size={24} />
                </button>
                <h1 className="text-lg font-bold text-white">设置</h1>
            </div>

            <div className="p-6 space-y-8">
                {/* 0. 显示设置 (新功能) */}
                <section>
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                            <Monitor size={14} /> 显示设置
                        </h2>
                    </div>

                    <div className="bg-[#121212] rounded-2xl p-5 border border-white/5 shadow-lg flex items-center gap-4">
                        <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-400 shrink-0">
                            <Maximize size={22} />
                        </div>
                        <div className="flex-1 space-y-1">
                            <h3 className="text-white text-sm font-bold">应用全屏模式</h3>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                隐藏系统状态栏和导航栏，提供更沉浸的体验。
                            </p>
                        </div>
                        <button
                            onClick={handleToggleFullscreen}
                            className={`relative w-12 h-7 rounded-full transition-colors ${isFullscreen ? 'bg-indigo-500' : 'bg-slate-700'}`}
                        >
                            <span
                                className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${isFullscreen ? 'translate-x-5' : ''}`}
                            />
                        </button>
                    </div>
                </section>

                {/* 0.5 悬浮窗开关 */}
                <section>
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                            <PanelsTopLeft size={14} /> 系统悬浮窗（实验）
                        </h2>
                        <span className="text-[10px] text-slate-400">{overlayStatus}</span>
                    </div>

                    <div className="bg-[#121212] rounded-2xl p-5 border border-white/5 shadow-lg flex items-start gap-4">
                        <div className="p-3 bg-indigo-500/10 rounded-2xl text-indigo-400 shrink-0">
                            <Smartphone size={22} />
                        </div>
                        <div className="flex-1 space-y-3">
                            <div>
                                <h3 className="text-white text-sm font-bold">悬浮窗开关</h3>
                                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                                    开启后，会在桌面或其他应用上展示可拖动的悬浮窗。
                                </p>
                            </div>
                            {!overlayPermission && overlayAvailable && (
                                <button
                                    onClick={() => onRequestOverlayPermission?.()}
                                    className="px-3 py-2 rounded-xl bg-white/10 text-xs text-slate-200 font-semibold hover:bg-white/15 active:scale-[0.99] transition-colors"
                                >
                                    申请悬浮窗权限
                                </button>
                            )}
                        </div>
                        <button
                            onClick={handleOverlayToggle}
                            disabled={!overlayAvailable}
                            className={`relative w-12 h-7 rounded-full transition-colors ${overlayEnabled ? 'bg-indigo-500' : 'bg-slate-700'} disabled:opacity-50`}
                        >
                            <span
                                className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${overlayEnabled ? 'translate-x-5' : ''}`}
                            />
                        </button>
                    </div>
                </section>

                {/* 1. 音源配置 (核心功能) */}
                <section>
                   {/* ... 音源配置内容保持不变 ... */}
                   <div className="flex justify-between items-center mb-4">
                        <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                            <Server size={14} /> 音源配置
                        </h2>
                        {connStatus === 'success' && <span className="text-[10px] text-green-400 flex items-center gap-1"><CheckCircle2 size={12} /> 连接正常</span>}
                        {connStatus === 'error' && <span className="text-[10px] text-red-400 flex items-center gap-1"><XCircle size={12} /> 连接失败</span>}
                        {connStatus === 'testing' && <span className="text-[10px] text-indigo-400 flex items-center gap-1"><RefreshCw size={12} className="animate-spin" /> 测试中...</span>}
                    </div>

                    <div className={`bg-[#121212] rounded-2xl p-5 border transition-colors space-y-4 shadow-lg ${connStatus === 'error' ? 'border-red-500/30' : connStatus === 'success' ? 'border-green-500/30' : 'border-white/5'}`}>
                        {(!apiHost || !apiKey) && (
                            <div className="bg-yellow-500/10 border border-yellow-500/20 p-3 rounded-xl flex items-start gap-3 mb-2">
                                <AlertTriangle className="text-yellow-500 shrink-0" size={18} />
                                <p className="text-xs text-yellow-200/80 leading-relaxed">
                                    应用未配置音源接口，无法搜索或播放在线音乐。请填写有效的 API Host 和 Key。
                                </p>
                            </div>
                        )}

                        {connStatus === 'error' && (
                            <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-xl flex items-start gap-3 mb-2">
                                <Wifi className="text-red-500 shrink-0" size={18} />
                                <p className="text-xs text-red-200/80 leading-relaxed">
                                    连接失败。请检查：<br />1. 网络是否正常<br />2. API Host 地址是否正确 (需包含 http/https)<br />3. API Key 是否有效
                                </p>
                            </div>
                        )}

                        <div>
                            <label className="text-xs text-slate-400 block mb-1.5 ml-1">API Host (接口地址)</label>
                            <input
                                value={apiHost}
                                onChange={(e) => {
                                    setApiHost(e.target.value);
                                    if (connStatus !== 'idle') setConnStatus('idle');
                                }}
                                placeholder="https://api.example.com"
                                className="w-full bg-[#121212] text-white px-4 py-3 rounded-xl text-sm outline-none border border-white/5 focus:border-indigo-500 transition-colors placeholder:text-slate-600"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 block mb-1.5 ml-1">API Key (密钥)</label>
                            <input
                                value={apiKey}
                                onChange={(e) => {
                                    setApiKey(e.target.value);
                                    if (connStatus !== 'idle') setConnStatus('idle');
                                }}
                                placeholder="输入 API Key"
                                type="password"
                                className="w-full bg-[#121212] text-white px-4 py-3 rounded-xl text-sm outline-none border border-white/5 focus:border-indigo-500 transition-colors placeholder:text-slate-600"
                            />
                        </div>
                        <button
                            onClick={handleSaveConfig}
                            disabled={connStatus === 'testing'}
                            className={`w-full py-3 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg ${connStatus === 'success' ? 'bg-green-600 hover:bg-green-500 shadow-green-900/20' :
                                connStatus === 'error' ? 'bg-red-600 hover:bg-red-500 shadow-red-900/20' :
                                    'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/20'
                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            {connStatus === 'testing' ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                            {connStatus === 'testing' ? '正在连接...' : connStatus === 'success' ? '保存并测试成功' : '保存并测试连接'}
                        </button>
                    </div>
                </section>

                {/* 2. 存储与备份 */}
                <section>
                    <div className="flex justify-between items-end mb-4">
                        <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                            <HardDrive size={14} /> 数据备份与恢复
                        </h2>
                        <button
                            onClick={handleCreateBackup}
                            disabled={loading}
                            className="text-xs bg-[#121212] text-indigo-400 border border-indigo-500/20 px-1 rounded-full font-bold hover:bg-indigo-500 hover:text-white transition-all flex items-center gap-1.5 disabled:opacity-50 active:scale-95"
                        >
                            <Upload size={12} /> 新建备份
                        </button>
                    </div>
                    {/* ... 备份列表内容保持不变 ... */}
                    <div className="bg-[#121212] rounded-2xl overflow-hidden border border-white/5 shadow-lg">
                        {backups.length === 0 ? (
                            <div className="p-8 text-center text-slate-500">
                                <Smartphone size={32} className="mx-auto mb-2 opacity-30" />
                                <p className="text-xs">暂无本地备份文件</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-white/5 max-h-[280px] overflow-y-auto no-scrollbar">
                                {backups.map((file) => {
                                    const dateStr = file.replace('backup_', '').replace('.json', '');
                                    const formattedDate = dateStr.length >= 12
                                        ? `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)} ${dateStr.slice(9, 11)}:${dateStr.slice(11, 13)}`
                                        : file;

                                    return (
                                        <div key={file} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors group">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 shrink-0">
                                                    <FileJson size={18} />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-white text-sm font-bold truncate">{formattedDate}</p>
                                                    <p className="text-[10px] text-slate-500 mt-0.5 truncate font-mono opacity-70">{file}</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleRestore(file)}
                                                className="px-4 py-2 rounded-lg bg-slate-700/50 text-slate-300 text-xs font-bold hover:bg-white hover:text-slate-900 transition-all border border-white/5 active:scale-95"
                                            >
                                                恢复
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        <div className="bg-[#121212]/50 p-3 text-[10px] text-slate-500 border-t border-white/5 flex gap-2 items-start">
                            <Info size={12} className="shrink-0 mt-0.5 text-indigo-400" />
                            <span className="opacity-70">备份文件保存在手机存储的 <code className="text-indigo-300 mx-1">{PATHS.BACKUP}</code> 目录下。卸载应用不会自动删除这些文件。</span>
                        </div>
                    </div>
                </section>

                {/* ... 其他部分保持不变 ... */}
                {/* 3. 软件信息 (新增) */}
                <section>
                    <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wider flex items-center gap-2 mb-4">
                        <Sparkles size={14} /> 关于
                    </h2>
                    <div className="bg-[#121212] rounded-2xl overflow-hidden border border-white/5 shadow-lg divide-y divide-white/5">
                         <div
                            onClick={onOpenSponsor}
                            className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors cursor-pointer group active:bg-white/10"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400">
                                    <Info size={18} />
                                </div>
                                <span className="text-sm font-medium text-slate-200">关于应用</span>
                            </div>
                            <ArrowRight size={16} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
                        </div>
                         <div
                            onClick={onCheckUpdate}
                            className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors cursor-pointer group active:bg-white/10"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400">
                                    <RefreshCw size={18} />
                                </div>
                                <span className="text-sm font-medium text-slate-200">检查更新</span>
                            </div>
                            <ArrowRight size={16} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
                        </div>
                        <div
                           // onClick={onDependency}
                            className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors cursor-pointer group active:bg-white/10"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400">
                                    <Star size={18} />
                                </div>
                                <span className="text-sm font-medium text-slate-200">依赖&致谢</span>
                            </div>
                            <ArrowRight size={16} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
                        </div>
                       

                        <div
                            onClick={onOpenSponsor}
                            className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors cursor-pointer group active:bg-white/10"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-red-500/10 flex items-center justify-center text-red-400">
                                    <Heart size={18} />
                                </div>
                                <span className="text-sm font-medium text-slate-200">赞赏作者</span>
                            </div>
                            <ArrowRight size={16} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
                        </div>
                         
                    </div>
                </section>

                {/* 4. 危险区域 */}
                <section>
                    <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wider flex items-center gap-2 mb-4">
                        <Info size={12} />危险区域
                    </h2>
                    <div
                        onClick={handleClearCache}
                        className="bg-red-500/5 rounded-2xl p-4 border border-red-500/10 flex items-center gap-3 cursor-pointer hover:bg-red-500/10 transition-colors group active:scale-[0.99]"
                    >
                        <div className="p-3 bg-red-500/10 rounded-full text-red-500 group-hover:scale-110 transition-transform">
                            <Trash2 size={20} />
                        </div>
                        <div>
                            <h3 className="text-red-400 text-sm font-bold">清空应用缓存</h3>
                            <p className="text-red-400/50 text-xs mt-0.5">重置数据库、清空所有歌单(不删本地音频文件)</p>
                        </div>
                    </div>
                </section>
                
                {/* 5. 底部版本信息 */}
                <div className="text-center pt-4 pb-8 opacity-50">
                    <p className="text-white font-bold text-sm">LynxMusic</p>
                    <p className="text-slate-500 text-xs mt-1">Version {appVersion}</p>
                    <p className="text-slate-600 text-[10px] mt-2">Designed by hillmis For Learning</p>
                </div>
            </div>

            {/* Loading Overlay */}
            {loading && (
                <div className="absolute inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center flex-col animate-in fade-in duration-200">
                    <div className="bg-[#121212] p-6 rounded-2xl shadow-2xl flex flex-col items-center border border-white/10">
                        <RefreshCw size={32} className="text-indigo-500 animate-spin mb-4" />
                        <p className="text-white text-sm font-bold">正在处理数据...</p>
                        <p className="text-slate-500 text-xs mt-2">请勿关闭应用</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Settings;