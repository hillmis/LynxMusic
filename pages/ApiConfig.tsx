import React, { useEffect, useState } from 'react';
import { ChevronLeft, Server, RefreshCw, Save, Wifi, AlertTriangle, CheckCircle2, XCircle, FileJson } from 'lucide-react';
import { fetchJson, testApiConnection, configureApi, getCurrentApiTypeConfig, buildTypeUrl, mapFields, setCustomApiTypeConfig } from '../utils/api';

interface ApiConfigProps {
  onBack: () => void;
}

type ConnectionStatus = 'idle' | 'testing' | 'success' | 'error';

const ApiConfig: React.FC<ApiConfigProps> = ({ onBack }) => {
  const [apiHost, setApiHost] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [connStatus, setConnStatus] = useState<ConnectionStatus>('idle');
  const [apiType, setApiType] = useState('search');
  const [apiSource, setApiSource] = useState('');
  const [apiParam, setApiParam] = useState('');
  const [testUrl, setTestUrl] = useState('');
  const [debugResult, setDebugResult] = useState('');
  const [customApiTypeConfig, setCustomApiTypeConfigState] = useState<any>(null);

  useEffect(() => {
    const savedHost = localStorage.getItem('setting_api_host') || '';
    const savedKey = localStorage.getItem('setting_api_key') || '';
    const savedApiType = localStorage.getItem('setting_api_type') || 'search';
    const savedSource = localStorage.getItem('setting_api_source') || '';

    setApiHost(savedHost);
    setApiKey(savedKey);
    setApiType(savedApiType);
    setApiSource(savedSource);

    try {
      const cfg = getCurrentApiTypeConfig();
      setCustomApiTypeConfigState(cfg);
      if (!savedSource && cfg[savedApiType]?.defaultSource) {
        setApiSource(cfg[savedApiType].defaultSource);
      }
    } catch (e) {
      console.error('API config not loaded:', e);
    }

    if (savedHost && savedKey) {
      setConnStatus('idle');
      configureApi({ host: savedHost, key: savedKey });
    }
  }, []);

  const getSourceForType = (type: string, source: string) => {
    if (!customApiTypeConfig) return null;
    const cfg = customApiTypeConfig[type];
    return cfg?.sources?.find((s: any) => s.name === source) || cfg?.sources?.find((s: any) => s.name === cfg.defaultSource);
  };

  const buildUrlForType = (type: string, source: string, params: Record<string, string>) => {
    const cfg = getSourceForType(type, source);
    if (!cfg) return '';

    let url = cfg.url;
    const p = {
      ...params,
      key: params.key || apiKey || 'your-api-key'
    };
    Object.entries(p).forEach(([k, v]) => {
      url = url.replace(new RegExp(`\\{${k}\\}`), encodeURIComponent(v));
    });

    return url;
  };

  const handleSaveConfig = async () => {
    const host = apiHost.trim();
    const key = apiKey.trim();
    if (!host || !key) {
      alert('请填写完整配置');
      return;
    }

    setConnStatus('testing');
    localStorage.setItem('setting_api_host', host);
    localStorage.setItem('setting_api_key', key);
    localStorage.setItem('setting_api_type', apiType);
    localStorage.setItem('setting_api_source', apiSource);

    configureApi({ host, key });
    const isConnected = await testApiConnection(host, key);

    if (isConnected) {
      setConnStatus('success');
      alert('配置保存成功');
    } else {
      setConnStatus('error');
      alert('配置已保存，但连接测试失败，请检查');
    }
  };

  const handleTestDataType = async () => {
    try {
      const params: Record<string, string> = {};
      if (apiType === 'search' || apiType === 'mv' || apiType === 'lyrics' || apiType === 'cover') {
        params.keyword = apiParam.trim();
        if (apiType === 'lyrics' || apiType === 'cover') params.query = apiParam.trim();
      } else if (apiType === 'topCharts') {
        params.chartId = apiParam.trim();
      } else if (apiType === 'playlist') {
        if (apiSource === '秦歌单' || apiSource === 'QQ歌单') params.payload = apiParam.trim();
        else params.id = apiParam.trim();
        params.uid = apiParam.trim();
      } else {
        params.keyword = apiParam.trim();
      }

      const url = buildUrlForType(apiType, apiSource, params);
      if (!url) {
        alert('构建 URL 失败，请检查类型与来源');
        return;
      }

      setTestUrl(url);
      const res = await fetchJson(url, { timeout: 10000 });
      const mapped = mapFields(res?.data || res, apiSource, apiType);
      setDebugResult(JSON.stringify({ url, raw: res, mapped }, null, 2));
    } catch (error: any) {
      setDebugResult(String(error));
    }
  };

  if (!customApiTypeConfig) {
    return (
      <div className="h-full bg-[#121212] flex items-center justify-center text-white">
        <div className="text-center max-w-md px-6">
          <Server size={48} className="mx-auto mb-4 text-slate-400" />
          <h2 className="text-xl font-bold mb-2">需要导入 API 配置</h2>
          <p className="text-slate-400 mb-6">请导入您的 apiConfig.js 文件以启用接口配置功能</p>
          <label className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition-all active:scale-[0.98]">
            选择文件导入
            <input type="file" accept=".js" onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (!file.name.endsWith('.js')) {
                alert('请选择.js文件');
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                try {
                  let content = reader.result as string;
                  const match = content.match(/export const API_TYPE_CONFIG = (\{[\s\S]*?\n\})/s);
                  if (match) {
                    content = match[1];
                  } else {
                    const matchCommonJS = content.match(/const API_TYPE_CONFIG = (\{[\s\S]*?\n\})/s);
                    if (matchCommonJS) {
                      content = matchCommonJS[1];
                    } else {
                      throw new Error('JS文件中未找到API_TYPE_CONFIG');
                    }
                  }
                  let json;
                  try {
                    json = JSON.parse(content);
                  } catch (e) {
                    content = content.replace(/'/g, '"');
                    try {
                      json = JSON.parse(content);
                    } catch (e) {
                      try {
                        json = eval(`(${content})`);
                      } catch (e) {
                        throw new Error('无法解析API_TYPE_CONFIG对象');
                      }
                    }
                  }
                  setCustomApiTypeConfigState(json);
                  alert('API配置导入成功！');
                } catch (error) {
                  alert(`文件读取失败：${error.message || '请确保是包含 API_TYPE_CONFIG 的 JS 文件'}`);
                }
              };
              reader.readAsText(file);
            }} className="hidden" />
          </label>
          <p className="text-xs text-slate-500 mt-4">支持 .js 文件格式</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-[#121212] overflow-y-auto no-scrollbar pb-20 animate-in slide-in-from-right duration-300">
      <div className="sticky top-0 z-10 bg-[#121212]/95 backdrop-blur border-b border-white/5 p-4 flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-white/10 text-white">
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-lg font-bold text-white">接口配置</h1>
      </div>

      <div className="p-6 space-y-6">

        <section className="bg-[#121212] rounded-2xl p-5 border border-white/10 shadow-lg">
          <div className="flex items-center gap-2 mb-4">
            <RefreshCw size={16} />
            <h2 className="text-white text-sm font-bold">接口调试</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-slate-400 block mb-1">接口类型</label>
              <select value={apiType} onChange={(e) => { const nextType = e.target.value; setApiType(nextType); setApiSource(customApiTypeConfig?.[nextType]?.defaultSource || ''); }} className="w-full bg-[#0f172a] border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none">
                {Object.keys(customApiTypeConfig).map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">接口来源</label>
              <select value={apiSource} onChange={(e) => setApiSource(e.target.value)} className="w-full bg-[#0f172a] border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none">
                {(customApiTypeConfig[apiType]?.sources || []).map((src: any) => <option key={src.name} value={src.name}>{src.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-slate-400 block mb-1">参数 (keyword/id/uid/payload)</label>
              <input value={apiParam} onChange={(e) => setApiParam(e.target.value)} placeholder="例如：周杰伦" className="w-full bg-[#0f172a] border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none" />
            </div>
          </div>
          <button onClick={handleTestDataType} className="w-full bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-lg py-2">生成并测试当前接口</button>
          <div className="text-xs text-slate-400 mt-2">测试 URL：<span className="text-indigo-300 break-all">{testUrl || '请先点击测试'}</span></div>
          <textarea readOnly value={debugResult} rows={10} className="w-full bg-[#0f172a] border border-white/10 rounded-lg p-2 text-xs text-green-200 mt-2 resize-none" placeholder="调试结果..." />
        </section>

        <section className="bg-[#121212] rounded-2xl p-5 border border-white/10 shadow-lg">
          <div className="flex items-center gap-2 mb-4">
            <FileJson size={16} />
            <h2 className="text-white text-sm font-bold">导出 API 配置</h2>
          </div>
          <textarea readOnly value={JSON.stringify(customApiTypeConfig, null, 2)} rows={8} className="w-full bg-[#0f172a] border border-white/10 rounded-lg p-2 text-xs text-white mt-2 resize-none" placeholder="API_TYPE_CONFIG 配置" />
          <button onClick={() => {
            const configContent = `export const API_TYPE_CONFIG = ${JSON.stringify(customApiTypeConfig, null, 2)}`;
            const blob = new Blob([configContent], { type: 'text/javascript' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'apiConfig.js';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            alert('配置导出成功！');
          }} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg py-2 mt-2">导出配置</button>
        </section>
      </div>
    </div>
  );
};

export default ApiConfig;