import { motion } from 'framer-motion';
import { ChevronRight, FlaskConical, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';

const modes = [
  {
    path: '/assessment/exam',
    icon: FlaskConical,
    title: '智能考试',
    desc: '平台根据你选择的年级学期，自动从题库抽取100道精准填空题，全面诊断知识掌握情况。',
    tag: '高置信度',
    tagColor: '#2a9d8f',
    recommended: true,
  },
  {
    path: '/assessment/upload',
    icon: Upload,
    title: '试卷上传',
    desc: '上传孩子已做的试卷图片，平台通过OCR识别答案，生成诊断报告（功能即将上线）。',
    tag: '开发中',
    tagColor: '#a7a9be',
    recommended: false,
  },
];

export default function Assessment() {
  return (
    /* Mobile fills one 100dvh screen with content slightly above center and no scrolling.
       Desktop keeps min-h-screen with justify-center alignment. */
    <div
      className="flex flex-col items-center justify-center px-6
                    min-h-screen sm:min-h-screen
                    pt-16 sm:pt-14
                    pb-4 sm:pb-0"
      style={{ minHeight: 'calc(100dvh - 50px - env(safe-area-inset-bottom))' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl"
      >
        <h1 className="font-serif text-3xl font-semibold mb-2 text-center">选择诊断方式</h1>
        <p className="text-text-dim text-center mb-6 sm:mb-10">两种方式都可以生成详细的诊断报告</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {modes.map(({ path, icon: Icon, title, desc, tag, tagColor, recommended }) => (
            <Link
              key={path}
              to={path}
              className={`
                relative bg-surface border rounded-2xl p-6 flex flex-col gap-4
                hover:border-accent/50 transition-all hover:scale-[1.01]
                ${recommended ? 'border-accent/40' : 'border-border'}
              `}
            >
              {recommended && (
                <span className="absolute top-4 right-4 text-xs px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30">
                  推荐
                </span>
              )}
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ background: `${tagColor}22` }}
              >
                <Icon size={24} style={{ color: tagColor }} />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-lg">{title}</h3>
                  <span
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{ background: `${tagColor}22`, color: tagColor }}
                  >
                    {tag}
                  </span>
                </div>
                <p className="text-text-dim text-sm leading-relaxed">{desc}</p>
              </div>
              <div className="flex items-center gap-1 text-accent text-sm mt-auto">
                选择此方式 <ChevronRight size={15} />
              </div>
            </Link>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
