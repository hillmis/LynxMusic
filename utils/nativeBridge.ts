import { WebAppNativeAPI } from '../types';

type RawNative = any;

const buildBridge = (raw: RawNative): WebAppNativeAPI => ({
  app: {
    getName: () => raw?.['获取应用名称']?.() ?? '',
    getPackageName: () => raw?.['获取应用包名']?.() ?? '',
    getVersionName: () => raw?.['获取应用版名']?.() ?? '',
    getVersionCode: () => raw?.['获取应用版号']?.() ?? 0,
    getDeviceId: () => raw?.['获取设备ID']?.() ?? '',
    getSignature: () => raw?.['获取应用签名']?.() ?? '',
    getClipboard: () => raw?.['获取粘贴内容']?.() ?? '',
    copy: (text: string) =>
      raw?.['复制文本']?.(text) ?? raw?.['设置粘贴内容']?.(text),
  },

  overlay: {
    launch: (url, w, h, hideBar, x, y) =>
      raw?.['启动悬浮窗']?.(url, w, h, !!hideBar, x, y),
    close: () => raw?.['关闭悬浮窗']?.(),
    minimize: () => raw?.['最小化悬浮窗']?.(),
    resize: (w, h) => raw?.['设置悬浮窗大小']?.(w, h),
    move: (x, y) => raw?.['设置悬浮窗位置']?.(x, y),
    setFocus: (focus) => raw?.['设置悬浮窗焦点']?.(!!focus),
    showToolbar: (show) => raw?.['悬浮窗工具条']?.(!!show),
    hasPermission: () => raw?.['判断悬浮窗权限']?.() ?? false,
    requestPermission: () => raw?.['打开悬浮窗权限']?.(),
  },

  control: {
    launchApp: (pkg) => raw?.['启动指定应用']?.(pkg),
    exists: (pkg) => raw?.['判断指定应用']?.(pkg) ?? false,
    uninstall: (pkg) => raw?.['卸载指定应用']?.(pkg),
    setDownloadPrompt: (enable) => raw?.['隐藏下载提示']?.(!enable),
    setDownloadEnabled: (enable) => raw?.['关闭下载功能']?.(!enable),
    listenExternalLink: (callbackName) => raw?.['监听外部链接']?.(callbackName),
    openInBrowser: (url) => raw?.['外部浏览器打开']?.(url),
    openLocalPage: (path) => raw?.['打开指定页面']?.(path),
    loadSource: (url, html) => raw?.['加载源代码']?.(url, html),
    clearHistory: () => raw?.['清空浏览记录']?.(),
    setFullscreen: (enable) => raw?.['设置全屏模式']?.(!!enable),
    setLandscape: (enable) => raw?.['设置横屏模式']?.(!!enable),
    setPortrait: (enable) => raw?.['设置竖屏模式']?.(!!enable),
    setDarkMode: (enable) => raw?.['设置深色模式']?.(!!enable),
    setPullRefresh: (enable) => raw?.['设置下拉刷新']?.(!!enable),
    setLoadingEffect: (enable) => raw?.['设置加载效果']?.(!!enable),
    setCustomBackKey: (script) => raw?.['自定义返回键']?.(script),
    setVolumeKey: (isUp, script) => raw?.['自定义声音键']?.(!!isUp, script),
    setUserAgent: (ua) =>
      raw?.['设置自定义UA']?.(ua) ?? raw?.['设置UA']?.(ua ?? null),
    setLongPressEvent: (callbackName) => raw?.['设置长按事件']?.(callbackName),
    addShortcut: (name, icon, script, id, isLongPress) =>
      raw?.['添加快捷方式']?.(name, icon, script, id, !!isLongPress),
    removeShortcut: (id) => raw?.['移除快捷方式']?.(id),
    isShortcutSupported: () => raw?.['判断快捷方式']?.() ?? false,
  },

  system: {
    hasStorage: () => raw?.['判断存储权限状态']?.() ?? false,
    requestStorage: () => raw?.['申请存储权限']?.(),
    onStorageResult: (cb) => raw?.['存储权限回调']?.(cb),
    hasInstall: () => raw?.['判断安装权限']?.() ?? false,
    requestInstall: () => raw?.['打开安装权限']?.(),
    hasNotify: () => raw?.['判断通知权限']?.() ?? false,
    requestNotify: () => raw?.['打开通知权限']?.(),
    hasNotifyPermission: () => raw?.['判断通知权限']?.() ?? false,
    requestIgnoreBattery: () => raw?.['申请优化权限']?.(),
    setBackgroundRunning: (enable) => raw?.['设置后台状态']?.(!!enable),
    startPip: (widthRatio, heightRatio, callbackName) =>
      raw?.['启动画中画']?.(widthRatio, heightRatio, callbackName),
    isPipSupported: () => raw?.['判断画中画支持']?.() ?? false,
    toast: (msg) => raw?.['显示文本提示']?.(msg),
    shareText: (text) => raw?.['分享文本内容']?.(text),
    notify: (id, title, content, script) =>
      raw?.['发送状态栏内容']?.(id, title, content, script),
    removeNotify: (id) => raw?.['移除状态栏内容']?.(id),
    getBrightness: () => raw?.['获取亮度参数']?.() ?? 0,
    setBrightness: (val) => raw?.['设置亮度参数']?.(val),
    getVolume: () => raw?.['获取声音参数']?.() ?? 0,
    setVolume: (val) => raw?.['设置声音参数']?.(val),
    setScreenOn: (on) => raw?.['设置屏幕常亮']?.(!!on),
    setStatusBarColor: (hex) => raw?.['设置状态栏变色']?.(hex),
    isVpnActive: () => raw?.['判断抓包状态']?.() ?? false,
    getApiLevel: () => raw?.['获取系统SDK版本']?.() ?? 0,
    exit: () => raw?.['关闭应用退出']?.(),
    goHome: () => raw?.['回到系统桌面']?.(),
  },

  file: {
    getRootDir: () => raw?.['获取外部存储目录']?.() ?? '',
    getExternalFilesDir: () => raw?.['获取外部文件目录']?.() ?? '',
    getInternalFilesDir: () => raw?.['获取内部文件目录']?.() ?? '',
    getExternalDir: () => raw?.['获取外部文件目录']?.(),
    getInternalDir: () => raw?.['获取内部文件目录']?.(),
    list: (path) => raw?.['获取目录排列']?.(path) ?? '',
    read: (path) => raw?.['获取文件内容']?.(path) ?? '',
    size: (path) => raw?.['获取文件大小']?.(path) ?? -1,
    save: (path, data) => raw?.['保存指定文件']?.(path, data) ?? false,
    append: (path, data) => raw?.['文件追加保存']?.(path, data),
    delete: (path) => raw?.['删除指定文件']?.(path) ?? false,
    rename: (path, newName) => raw?.['更改指定文件名']?.(path, newName),
    exists: (path) => raw?.['判断指定文件']?.(path) ?? false,
    open: (path) => raw?.['打开指定文件']?.(path),
    share: (path) => raw?.['分享指定文件']?.(path),
    getAsset: (name) => raw?.['获取应用文件']?.(name) ?? '',
    downloadSave: (name, data) => raw?.['保存下载文件']?.(name, data),
  },

  storage: {
    set: (key, val) => raw?.['存储指定文本']?.(key, val),
    get: (key, def) => raw?.['获取指定文本']?.(key, def) ?? '',
    setBool: (key, val) => raw?.['存储指定布尔']?.(key, !!val),
    getBool: (key, def) => raw?.['获取指定布尔']?.(key, !!def) ?? false,
    remove: (key) => raw?.['删除指定存储']?.(key),
    clear: () => raw?.['清空全部存储']?.(),
  },

  expert: {
    executeJava: (code) => raw?.['执行JAVA']?.(code),
    executeShell: (path, env, cmd, cb) =>
      raw?.['执行SH命令']?.(path, env, cmd, cb),
    sendBroadcast: (action, tag, data) =>
      raw?.['设置发送广播']?.(action, tag, data),
    registerReceiver: (action, tag, cb) =>
      raw?.['设置接收广播']?.(action, tag, cb),
    stopReceiver: () => raw?.['关闭广播服务']?.(),
    setIntercept: (rules) => raw?.['设置拦截参数']?.(rules),
    setDebug: (enable) => raw?.['设置调试功能']?.(!!enable),
    clearCache: () => raw?.['设置清空缓存']?.(),
    clearWebCache: () => raw?.['设置清空缓存']?.(),
    setNoCache: (enable) => raw?.['设置缓存模式']?.(!!enable),
    getProtocol: () => raw?.['获取URL协议']?.() ?? '',
  },
});

/**
 * Ensure window.APP.ITAPI.DEV is present and returns the mapped WebAppNativeAPI.
 * Returns undefined when running outside the native shell.
 */
export const initNativeBridge = (): WebAppNativeAPI | undefined => {
  const raw: RawNative = (window as any).webapp;
  if (!raw) {
    return window.APP?.ITAPI?.DEV as WebAppNativeAPI | undefined;
  }

  if (window.APP?.ITAPI?.DEV) return window.APP.ITAPI.DEV as WebAppNativeAPI;

  const DEV = buildBridge(raw);
  window.APP = window.APP || ({} as any);
  window.APP.ITAPI = window.APP.ITAPI || ({} as any);
  window.APP.ITAPI.DEV = DEV;
  return DEV;
};

export const getNative = (): WebAppNativeAPI | undefined =>
  (window.APP?.ITAPI?.DEV as WebAppNativeAPI | undefined) ?? initNativeBridge();
