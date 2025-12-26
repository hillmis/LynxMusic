
import { createFullBackup, importFullData } from './db';
import { getBackupList, readBackupFile, initFileSystem, safeToast } from './fileSystem';

// 定义自动备份的固定文件名
const AUTO_BACKUP_FILE = 'backup_latest.json';
// 防止 React StrictMode 下重复执行恢复
let hasRestored = false;

/**
 * 执行一次全量备份到 backup_latest.json
 * @param silent 是否静默执行（不显示 Toast 提示）
 */
export const runAutoBackup = async (silent = true) => {
    try {
        console.log('[AutoBackup] Saving data...');
        // 调用 db.ts 中的备份方法，传入特定参数以覆盖旧文件
        // 注意：这里假设 createFullBackup 支持参数对象，如果你的 db.ts 不支持，请调整 db.ts
        const success = await createFullBackup({ 
            fileName: AUTO_BACKUP_FILE, 
            overwrite: true, 
            silent 
        });
        
        if (success && !silent) {
            console.log('[AutoBackup] Save success');
        }
    } catch (e) {
        console.warn('[AutoBackup] Save failed', e);
    }
};

/**
 * 从最新的备份文件中恢复数据
 * 策略：优先寻找 backup_latest.json，如果找不到，则使用列表中最新的普通备份文件
 */
export const restoreFromLatestBackup = async () => {
    // 只有在浏览器环境且未恢复过的情况下执行
    if (typeof window === 'undefined' || hasRestored) return;

    try {
        // 1. 确保存储目录存在
        initFileSystem();
        
        // 2. 获取备份列表
        const list = getBackupList();
        if (!list || list.length === 0) return;

        // 3. 确定要恢复的文件
        let targetFile = '';
        if (list.includes(AUTO_BACKUP_FILE)) {
            // 优先使用上次自动退出的备份
            targetFile = AUTO_BACKUP_FILE;
        } else {
            // 否则取最新的手动备份（getBackupList 通常按时间倒序排列）
            const jsonFiles = list.filter(f => f.endsWith('.json'));
            if (jsonFiles.length > 0) targetFile = jsonFiles[0];
        }

        if (!targetFile) return;

        console.log(`[AutoRestore] Restoring from ${targetFile}...`);
        
        // 4. 读取文件内容
        const content = readBackupFile(targetFile);
        if (!content) return;

        // 5. 导入数据
        const res = await importFullData(content);
        
        if (res.success) {
            hasRestored = true;
            safeToast('🌸欢迎业主回家！');
            
            // 6. 触发全局事件，通知组件刷新（如播放列表、最近播放等）
            window.dispatchEvent(new Event('playlist-updated'));
            window.dispatchEvent(new Event('listen-history-updated'));
            // 如果有特定的 reload 需求，也可以在这里处理
        }
    } catch (e) {
        console.warn('[AutoRestore] Restore failed', e);
    }
};

/**
 * 开启自动备份监听
 * 在 App 挂载时调用此函数
 */
export const startAutoBackup = () => {
    if (typeof window === 'undefined') return () => {};

    const handleSave = () => {
        runAutoBackup(true);
    };

    // 1. 监听可见性变化 (主要针对移动端/PWA 切到后台)
    const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
            handleSave();
        }
    };

    // 2. 监听页面卸载 (主要针对 PC 浏览器关闭标签页)
    const handleBeforeUnload = () => {
        handleSave();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    // 可选：每隔 5 分钟自动保存一次，防止意外崩溃
    const intervalTimer = setInterval(handleSave, 5 * 60 * 1000);

    // 返回清理函数
    return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('beforeunload', handleBeforeUnload);
        clearInterval(intervalTimer);
    };
};