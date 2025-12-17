// 基础路径配置 - 严格对齐 Android Fusion App 路径
const ROOT_PATH = '/storage/emulated/0/HillMusic';
export const PATHS = {
    ROOT: ROOT_PATH,
    BACKUP: `${ROOT_PATH}/backup`,
    SONGS: `${ROOT_PATH}/song`,
    LYRICS: `${ROOT_PATH}/lyric`,
    COVERS: `${ROOT_PATH}/cover`,
};

// 检查并申请权限
const checkPermission = (): boolean => {
    if (!window.webapp) return false;
    try {
        // bestow 返回 true 代表有权限
        if (!window.webapp.bestow()) {
            window.webapp.rights(); // 申请权限
            window.webapp.toast('请授予存储权限以进行下载或备份');
            return false;
        }
    } catch (e) {
        console.warn('权限检查接口调用失败', e);
        // 某些环境下 bestlow 可能不存在，默认返回 true 尝试执行
        return true;
    }
    return true;
};

// 初始化目录结构
export const initFileSystem = () => {
    if (!checkPermission()) return;

    const dirs = Object.values(PATHS);
    dirs.forEach(dir => {
        try {
            // Android 端 makedir 应处理文件夹已存在的情况
            // 某些版本如果文件夹已存在会报错，所以加 try catch
            window.webapp?.makedir(dir);
        } catch (e) {
            // console.warn(`Create dir failed: ${dir}`, e);
        }
    });
};

// 保存备份文件 (JSON)
export const saveBackupToFile = (data: string): boolean => {
    if (!checkPermission()) return false;

    // 确保目录存在
    try { window.webapp?.makedir(PATHS.BACKUP); } catch (e) { }

    // 生成带时间戳的文件名
    const now = new Date();
    const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const filename = `backup_${timestamp}.json`;
    const fullPath = `${PATHS.BACKUP}/${filename}`;

    try {
        const success = window.webapp?.savefile(fullPath, data);
        if (success) {
            window.webapp?.toast(`备份成功: ${filename}`);
        } else {
            window.webapp?.toast('备份写入失败，请检查手机空间');
        }
        return !!success;
    } catch (e) {
        console.error(e);
        window.webapp?.toast('备份过程出错');
        return false;
    }
};

// 获取备份列表
export const getBackupList = (): string[] => {
    if (!checkPermission()) return [];

    try {
        const filesStr = window.webapp?.listfile(PATHS.BACKUP);
        if (!filesStr || filesStr === 'null') return [];

        // 假设 listfile 返回 "/" 分割的字符串
        return filesStr.split(/[\\/]/)
            .filter(f => f.includes('backup_') && f.endsWith('.json'))
            .sort()
            .reverse(); // 最新的在前
    } catch (e) {
        return [];
    }
};

// 读取备份内容
export const readBackupFile = (filename: string): string | null => {
    if (!checkPermission()) return null;
    const path = `${PATHS.BACKUP}/${filename}`;
    try {
        return window.webapp?.gainfile(path) || null;
    } catch (e) {
        window.webapp?.toast('读取文件失败');
        return null;
    }
};

// 下载歌曲 (保存到 HillMusic/song)
// contentBase64: 音频文件的纯 Base64 字符串 (不带 data:audio/mp3;base64, 前缀)
export const saveDownloadedSong = (filename: string, contentBase64: string): string | null => {
    if (!checkPermission()) return null;

    // 确保目录
    try { window.webapp?.makedir(PATHS.SONGS); } catch (e) { }

    // 清理文件名非法字符
    const safeName = filename.replace(/[\\/:*?"<>|]/g, '_');
    const fullPath = `${PATHS.SONGS}/${safeName}`;

    try {
        // 直接调用 savefile，传入完整路径和纯 Base64 数据
        const success = window.webapp?.savefile(fullPath, contentBase64);
        // savefile 通常没有返回值或返回 undefined，需要通过文件是否存在来判断，或者默认成功
        // 这里假设没有抛出异常即为成功
        window.webapp?.toast(`下载成功: ${safeName}`);
        return fullPath;
    } catch (e: any) {
        console.error(e);
        window.webapp?.toast('文件保存失败: ' + e.message);
    }
    return null;
};

// 辅助：将 Blob 转 Base64 (纯数据部分)
export const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result as string;
            // 移除 data URL 前缀，只保留 Base64 编码部分
            const base64 = result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};