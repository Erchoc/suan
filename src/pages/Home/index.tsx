import { motion } from 'framer-motion';
import { Brain, ChevronRight, FlaskConical, GitFork, Star, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { graphData, kpMap } from '../../data/kpIndex';

const features = [
  {
    icon: Brain,
    title: '知识图谱',
    desc: '覆盖人教版1-6年级全部知识点，依赖关系可视化，一眼看清知识脉络',
  },
  {
    icon: FlaskConical,
    title: '智能摸底',
    desc: '100道精准填空题，覆盖目标年级所有知识点，精准定位薄弱环节',
  },
  {
    icon: TrendingUp,
    title: '诊断报告',
    desc: '深度分析答题数据，追溯根因知识点，给出个性化学习路径建议',
  },
];

export default function Home() {
  return (
    <div className="min-h-screen pt-14 flex flex-col relative">
      {/* Warm gradient atmosphere with subtly animated light spots. */}
      <div
        className="absolute inset-x-0 top-0 h-[60vh] pointer-events-none overflow-hidden"
        aria-hidden
      >
        {/* Warm gradient background. */}
        <div className="absolute inset-0 home-warm-gradient" />
        {/* Floating light spots. */}
        <div className="home-orb home-orb-1" />
        <div className="home-orb home-orb-2" />
        <div className="home-orb home-orb-3" />
      </div>

      {/* Hero */}
      <section className="relative flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-16 sm:py-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-2xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/30 text-accent text-xs sm:text-sm mb-6 sm:mb-8">
            <Star size={12} />
            人教版 · 1-6年级 · {kpMap.size} 个知识点
          </div>

          <h1 className="font-brush text-7xl sm:text-8xl text-accent mb-3 leading-tight">算道</h1>
          <p className="font-serif text-lg sm:text-2xl text-text-dim mb-3">小学数学智能助手</p>
          <p className="text-text-dim max-w-md mx-auto mb-10 sm:mb-12 leading-relaxed text-sm sm:text-base px-2">
            精准摸底，溯源薄弱，给每个孩子定制专属的数学提升路径。 基于 {kpMap.size}{' '}
            个知识点构建的认知图谱，让学习不再走弯路。
          </p>

          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center px-4 sm:px-0">
            <Link
              to="/assessment"
              className="inline-flex items-center justify-center gap-2 px-6 sm:px-8 py-3.5 sm:py-4 bg-accent text-white font-semibold rounded-xl text-base sm:text-lg hover:bg-amber-600 transition-colors"
            >
              <FlaskConical size={20} />
              开始摸底考试
              <ChevronRight size={18} />
            </Link>
            <Link
              to="/graph"
              className="inline-flex items-center justify-center gap-2 px-6 sm:px-8 py-3.5 sm:py-4 bg-surface text-text border border-border rounded-xl text-base sm:text-lg hover:border-accent/50 hover:bg-surface2 transition-colors"
            >
              <GitFork size={20} />
              浏览知识图谱
            </Link>
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section className="px-4 sm:px-6 py-16 sm:py-20 max-w-5xl mx-auto w-full">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
          {features.map(({ icon: Icon, title, desc }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.1 }}
              className="bg-surface border border-border rounded-2xl p-5 sm:p-6 hover:border-accent/30 transition-colors"
            >
              <div className="w-11 h-11 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
                <Icon size={22} className="text-accent" />
              </div>
              <h3 className="font-semibold text-base sm:text-lg mb-2">{title}</h3>
              <p className="text-text-dim text-sm leading-relaxed">{desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Bridge knowledge point showcase. */}
      <section className="px-4 sm:px-6 py-12 sm:py-16 max-w-5xl mx-auto w-full">
        <h2 className="font-serif text-xl sm:text-2xl font-semibold mb-2 text-center">
          小升初衔接桥头堡
        </h2>
        <p className="text-text-dim text-center mb-6 sm:mb-8 text-sm">
          四大关键节点，打通小学到初中的知识断层
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {graphData.meta.bridgePoints.groups.map(group => (
            <div
              key={group.id}
              className="bg-surface border border-bridge/30 rounded-xl p-4 sm:p-5"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-bridge text-sm font-medium">🌉 {group.label}</span>
                <span className="font-semibold text-sm sm:text-base">{group.name}</span>
              </div>
              <p className="text-text-dim text-sm">{group.desc}</p>
              <p className="text-xs text-text-dim mt-2">涉及 {group.kpIds.length} 个知识点</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="text-center text-text-dim text-xs py-8 border-t border-border space-y-1">
        <div>算道 · 小学数学智能助手 · 数据来源：人教版教材知识体系</div>
        <div className="opacity-40">v{__COMMIT_HASH__}</div>
      </footer>
    </div>
  );
}
