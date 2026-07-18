// src/pages/Preview/FAQView.tsx
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { KnowledgeCard } from '../../types';
import { usePreviewStore } from '../../stores/previewStore';

interface FAQViewProps {
  sessionId: string;
  kpId: string;
  card: KnowledgeCard | null;
  onContinue: () => void;
}

export default function FAQView({ sessionId, kpId, card, onContinue }: FAQViewProps) {
  const { selectFAQ } = usePreviewStore();
  const faqSelectedIds = usePreviewStore(s => s.getSession(sessionId)?.faqSelectedIds[kpId] ?? []);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  // 无 FAQ 时直接继续
  if (!card || card.faqs.length === 0) {
    return (
      <div className="text-center py-6">
        <button
          onClick={onContinue}
          className="px-6 py-2.5 bg-accent text-bg rounded-xl font-medium hover:bg-accent/90 transition-colors"
        >
          继续 →
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-surface rounded-2xl border border-border p-5">
        <p className="text-lg font-medium text-text mb-4">💬 有没有搞不懂的地方？</p>
        <div className="space-y-2">
          {card.faqs.map((faq, i) => {
            const isOpen = openIndex === i;
            const wasSelected = faqSelectedIds.includes(i);

            return (
              <div key={i} className="border border-border rounded-xl overflow-hidden">
                <button
                  onClick={() => {
                    setOpenIndex(isOpen ? null : i);
                    if (!wasSelected) selectFAQ(sessionId, kpId, i);
                  }}
                  className="w-full text-left px-4 py-3 flex items-center justify-between gap-2 hover:bg-surface2 transition-colors"
                >
                  <span className={`text-sm ${wasSelected ? 'text-text-dim' : 'text-text'}`}>
                    {wasSelected && '✓ '}{faq.question}
                  </span>
                  {isOpen ? (
                    <ChevronUp size={14} className="text-text-dim flex-shrink-0" />
                  ) : (
                    <ChevronDown size={14} className="text-text-dim flex-shrink-0" />
                  )}
                </button>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: 'auto' }}
                      exit={{ height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 pt-1 text-sm text-text-dim border-t border-border">
                        <div className="prose prose-sm prose-invert max-w-none">
                          <ReactMarkdown>{faq.answer}</ReactMarkdown>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>

      <button
        onClick={onContinue}
        className="w-full py-3 bg-accent text-bg rounded-xl font-medium hover:bg-accent/90 transition-colors"
      >
        没有疑问，继续 →
      </button>
    </div>
  );
}
