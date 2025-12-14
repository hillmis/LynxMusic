import React, { useState } from 'react';
import { Folder, FileMusic, Upload, AlertCircle } from 'lucide-react';

const Local: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const fileList = Array.from(e.target.files).filter(file => file.type.startsWith('audio/'));
      setFiles(prev => [...prev, ...fileList]);
    }
  };

  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-32 p-6">
      <h1 className="text-2xl font-bold text-white mb-6 pt-2">本地音乐</h1>

      {/* Upload/Scan Section */}
      <div className="mb-8 p-6 border-2 border-dashed border-slate-700 rounded-2xl flex flex-col items-center justify-center bg-slate-800/30 text-center">
        <div className="w-12 h-12 bg-slate-700 rounded-full flex items-center justify-center mb-3">
            <Upload className="text-indigo-400" size={24} />
        </div>
        <h3 className="text-white font-medium mb-1">扫描本地文件</h3>
        <p className="text-slate-400 text-xs mb-4">从您的设备导入音频文件</p>
        
        <label className="cursor-pointer bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-full text-sm font-medium transition-colors">
          <span>选择文件</span>
          <input 
            type="file" 
            multiple 
            accept="audio/*" 
            className="hidden" 
            onChange={handleFileChange}
          />
        </label>
      </div>

      {/* Folder Structure Visualization */}
      <div className="mb-6">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Folder size={18} className="text-indigo-400" /> 文件夹
        </h2>
        <div className="space-y-2">
            <div className="flex items-center p-3 bg-slate-800 rounded-lg">
                <Folder className="text-yellow-500 mr-3" size={20} />
                <span className="text-slate-200">/Music/Downloads</span>
            </div>
             <div className="flex items-center p-3 bg-slate-800 rounded-lg">
                <Folder className="text-yellow-500 mr-3" size={20} />
                <span className="text-slate-200">/Music/Favorites</span>
            </div>
        </div>
      </div>

      {/* File List */}
      <div>
        <h2 className="text-lg font-bold text-white mb-4">已导入曲目 ({files.length})</h2>
        {files.length === 0 ? (
          <div className="flex flex-col items-center py-10 opacity-50">
            <AlertCircle size={48} className="text-slate-500 mb-2" />
            <p className="text-slate-500">暂无本地音乐文件。</p>
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((file, idx) => (
              <div key={idx} className="flex items-center p-3 bg-slate-800/50 rounded-xl hover:bg-slate-800 transition-colors">
                <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center mr-3">
                  <FileMusic className="text-indigo-400" size={20} />
                </div>
                <div className="flex-1 overflow-hidden">
                  <h3 className="text-sm font-medium text-white truncate">{file.name}</h3>
                  <p className="text-xs text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Local;