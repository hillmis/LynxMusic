const STORAGE_KEYS = {
  points: 'hm_points_balance_v2',
  downloadChances: 'hm_download_chances_v1',
  privilege: 'hm_download_privilege_v1',
};

export const DOWNLOAD_COST = 5; // 积分兑换 1 次下载机会的成本
export const REWARD_EVENTS = {
  pointsChanged: 'hm_points_changed',
  chanceChanged: 'hm_download_chance_changed',
  privilegeChanged: 'hm_download_privilege_changed',
};

// 可自行替换/扩展特权口令
const PRIVILEGE_CODES = [''];
const REMOTE_KEY_SOURCES = [
  'https://raw.gitmirror.com/hillmis/versionControl/main/lmkey.json', // raw.githubusercontent.com的镜像[citation:1]
  'https://gcore.jsdelivr.net/gh/hillmis/versionControl@main/lmkey.json', // jsDelivr的国内可用域名[citation:6][citation:8]
  'https://hub.gitmirror.com/https://github.com/hillmis/versionControl/raw/main/lmkey.json' // 通用加速方案[citation:1]
];
const readNumber = (key: string, fallback = 0) => {
  const val = Number(localStorage.getItem(key));
  return Number.isFinite(val) ? val : fallback;
};

const emit = (type: string, detail?: any) => {
  try {
    window.dispatchEvent(new CustomEvent(type, { detail }));
  } catch { }
};

export const getPointsBalance = () => readNumber(STORAGE_KEYS.points, 0);

export const setPointsBalance = (next: number) => {
  const safe = Math.max(0, Math.floor(next));
  localStorage.setItem(STORAGE_KEYS.points, String(safe));
  emit(REWARD_EVENTS.pointsChanged, { balance: safe });
  return safe;
};

export const addPointsBalance = (delta: number) => {
  const current = getPointsBalance();
  return setPointsBalance(current + delta);
};

export const getDownloadChances = () => readNumber(STORAGE_KEYS.downloadChances, 0);

export const setDownloadChances = (next: number) => {
  const safe = Math.max(0, Math.floor(next));
  localStorage.setItem(STORAGE_KEYS.downloadChances, String(safe));
  emit(REWARD_EVENTS.chanceChanged, { chances: safe });
  return safe;
};

export const addDownloadChances = (delta: number) => {
  const current = getDownloadChances();
  return setDownloadChances(current + delta);
};

export const consumeDownloadChance = () => {
  const current = getDownloadChances();
  if (current <= 0) return false;
  setDownloadChances(current - 1);
  return true;
};

export const redeemDownloadChance = (cost = DOWNLOAD_COST) => {
  const balance = getPointsBalance();
  if (balance < cost) return { ok: false, balance };
  const nextBalance = setPointsBalance(balance - cost);
  const nextChances = addDownloadChances(1);
  return { ok: true, balance: nextBalance, chances: nextChances };
};

export const hasDownloadPrivilege = () => localStorage.getItem(STORAGE_KEYS.privilege) === '1';

const parseRemoteCodes = (raw: any): string[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean).map(v => v.toUpperCase());
  if (typeof raw === 'object') {
    const possible = raw.codes || raw.keys || raw.list || raw.data;
    if (Array.isArray(possible)) return possible.map(String).filter(Boolean).map(v => v.toUpperCase());
  }
  if (typeof raw === 'string') return raw.split(/[,;\\s]+/).map(v => v.trim()).filter(Boolean).map(v => v.toUpperCase());
  return [];
};

export const fetchRemotePrivilegeCodes = async (): Promise<string[]> => {
  for (const base of REMOTE_KEY_SOURCES) {
    try {
      const resp = await fetch(`${base}?t=${Date.now()}`, { mode: 'cors', redirect: 'follow' });
      // 某些镜像会返回 opaque，无 CORS 头，直接跳过
      if (!resp.ok || resp.type === 'opaque') continue;
      const data = await resp.json();
      const parsed = parseRemoteCodes(data);
      if (parsed.length) return parsed;
    } catch {
      continue;
    }
  }
  return [];
};

export const unlockDownloadPrivilege = async (code: string) => {
  const input = (code || '').trim().toUpperCase();
  if (!input) return false;

  // 先尝试远端校验
  const remoteList = await fetchRemotePrivilegeCodes();
  const allowList = remoteList.length ? remoteList : PRIVILEGE_CODES;

  if (!allowList.includes(input)) return false;
  localStorage.setItem(STORAGE_KEYS.privilege, '1');
  emit(REWARD_EVENTS.privilegeChanged, { privileged: true });
  return true;
};

export const revokeDownloadPrivilege = () => {
  localStorage.removeItem(STORAGE_KEYS.privilege);
  emit(REWARD_EVENTS.privilegeChanged, { privileged: false });
};
