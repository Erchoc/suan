import { useState } from 'react';
import { Upload, FileImage, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import Button from '../../components/ui/Button';

export default function UploadConfig() {
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    setFiles(prev => [...prev, ...dropped]);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    setFiles(prev => [...prev, ...selected]);
  };

  const handleAnalyze = () => {
    setAnalyzing(true);
    // Mock 进度动画
    let p = 0;
    const timer = setInterval(() => {
      p += Math.random() * 15;
      if (p >= 100) {
        p = 100;
        clearInterval(timer);
      }
      setProgress(Math.min(p, 100));
    }, 300);
  };

  return (
    <div className="min-h-screen pt-24 flex justify-center px-6 py-10">
      <div className="w-full max-w-2xl">
        <h1 className="font-serif text-2xl font-semibold mb-1">上传试卷</h1>
        <p className="text-text-dim text-sm mb-2">功能即将上线</p>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent2/10 border border-accent2/30 text-accent2 text-xs mb-8">
          ⚠️ 当前为占位 UI，OCR 分析能力尚未接入
        </div>

        {/* 上传区域 */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`
            border-2 border-dashed rounded-2xl p-12 text-center transition-colors cursor-pointer
            ${dragging ? 'border-accent bg-accent/5' : 'border-border hover:border-border/80'}
          `}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <input
            id="file-input"
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileInput}
          />
          <Upload size={40} className="mx-auto mb-4 text-text-dim" />
          <p className="text-text-dim">拖拽试卷图片到此处，或点击上传</p>
          <p className="text-xs text-text-dim mt-1">支持 JPG、PNG，可多张</p>
        </div>

        {/* 已上传文件列表 */}
        {files.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-3 bg-surface border border-border rounded-xl px-4 py-3">
                <FileImage size={18} className="text-text-dim" />
                <span className="text-sm flex-1">{f.name}</span>
                <span className="text-xs text-text-dim">{(f.size / 1024).toFixed(0)} KB</span>
                <button
                  onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                  className="text-text-dim hover:text-accent2 transition-colors text-sm"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 分析按钮 */}
        {files.length > 0 && !analyzing && (
          <div className="mt-6">
            <Button variant="primary" size="lg" onClick={handleAnalyze}>
              开始分析
            </Button>
          </div>
        )}

        {/* 分析进度 */}
        {analyzing && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 bg-surface border border-border rounded-xl p-5"
          >
            <div className="flex items-center gap-3 mb-3">
              <Loader2 size={16} className="text-accent animate-spin" />
              <span className="text-sm">正在分析试卷…</span>
              <span className="ml-auto text-sm text-accent">{progress.toFixed(0)}%</span>
            </div>
            <div className="h-2 bg-surface2 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-accent rounded-full"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            {progress >= 100 && (
              <p className="mt-3 text-sm text-text-dim text-center">
                ✅ 分析完成（Mock 数据，真实功能即将上线）
              </p>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
