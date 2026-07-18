// src/components/AIChatDrawer/index.tsx

import { AnimatePresence, motion } from 'framer-motion';
import { MessageSquareText, Send, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type ChatMessage as IChatMessage, streamChat } from '../../utils/aiChat';
import ChatMessage from './ChatMessage';
import VoiceModeButton from './VoiceModeButton';

interface AIChatDrawerProps {
  kpId: string;
  kpName: string;
  gradeNum: number;
  explanation?: string;
}

export default function AIChatDrawer({ kpId, kpName, gradeNum, explanation }: AIChatDrawerProps) {
  const [open, setOpen] = useState(false);
  const isDraggingRef = useRef(false);
  const [bubbleVisible, setBubbleVisible] = useState(true);
  const [messages, setMessages] = useState<IChatMessage[]>([
    {
      role: 'assistant',
      content: `你好！我是算小道老师 🧮\n\n我正在帮你学习「${kpName}」，有什么不懂的地方尽管问我！`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamingIndexRef = useRef<number>(-1);

  // Abort the previous request before resetting the conversation for a new knowledge point.
  // biome-ignore lint/correctness/useExhaustiveDependencies: The knowledge-point ID intentionally resets same-name conversations.
  useEffect(() => {
    abortRef.current?.abort();
    setMessages([
      {
        role: 'assistant',
        content: `你好！我是算小道老师 🧮\n\n我正在帮你学习「${kpName}」，有什么不懂的地方尽管问我！`,
      },
    ]);
    setLoading(false);
    setError(null);
    return () => {
      abortRef.current?.abort();
    };
  }, [kpId, kpName]);

  // Abort the streaming request when closing the drawer.
  const handleClose = useCallback(() => {
    abortRef.current?.abort();
    setOpen(false);
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const sendMessage = useCallback(
    async (text: string, retryMessages?: IChatMessage[]) => {
      if (!text.trim() || loading) return;
      setError(null);

      const userMsg: IChatMessage = { role: 'user', content: text };
      const newMessages = retryMessages ?? [...messages, userMsg];
      setMessages(newMessages);
      setInput('');
      setLoading(true);

      // Append an assistant placeholder that will receive streamed content.
      const assistantMsg: IChatMessage = { role: 'assistant', content: '' };
      setMessages(prev => [...prev, assistantMsg]);
      streamingIndexRef.current = newMessages.length;

      abortRef.current = new AbortController();

      await streamChat({
        kpId,
        kpName,
        gradeNum,
        explanation,
        messages: newMessages,
        signal: abortRef.current.signal,
        onChunk: delta => {
          setMessages(prev => {
            const updated = [...prev];
            const idx = streamingIndexRef.current;
            if (updated[idx]) {
              updated[idx] = { ...updated[idx], content: updated[idx].content + delta };
            }
            return updated;
          });
          scrollToBottom();
        },
        onDone: () => {
          setLoading(false);
          streamingIndexRef.current = -1;
        },
        onError: err => {
          setLoading(false);
          setError(err.message);
          setMessages(prev => prev.filter((_, i) => i !== streamingIndexRef.current));
          streamingIndexRef.current = -1;
        },
      });
    },
    [messages, loading, kpId, kpName, gradeNum, explanation, scrollToBottom],
  );

  return (
    <>
      {/* Draggable floating button and bubble */}
      <motion.div
        drag
        dragMomentum={false}
        dragElastic={0.1}
        dragConstraints={{ top: -500, bottom: 0, left: -300, right: 0 }}
        onDragStart={() => {
          isDraggingRef.current = true;
        }}
        onDragEnd={() => {
          setTimeout(() => {
            isDraggingRef.current = false;
          }, 50);
        }}
        className="fixed right-5 z-40 flex flex-col items-end gap-2 cursor-grab active:cursor-grabbing"
        style={{ bottom: 'calc(var(--tab-bar-h) + 2rem)', touchAction: 'none' }}
      >
        {/* Prompt bubble */}
        <AnimatePresence>
          {bubbleVisible && !open && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.9 }}
              className="max-w-48 bg-surface2 border border-border rounded-2xl rounded-br-none px-3 py-2 text-sm text-text"
              style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
              onClick={() => setBubbleVisible(false)}
            >
              我来教你～先看看这个知识点吧！
            </motion.div>
          )}
        </AnimatePresence>

        {/* Trigger button */}
        <button
          onClick={() => {
            if (!isDraggingRef.current) {
              setOpen(true);
              setBubbleVisible(false);
            }
          }}
          className="w-12 h-12 bg-accent rounded-full flex items-center justify-center hover:bg-accent/90 outline-none"
          style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.25)' }}
          aria-label="打开 AI 对话"
        >
          <MessageSquareText size={22} className="text-bg" />
        </button>
      </motion.div>

      {/* Drawer */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/40"
              onClick={handleClose}
            />

            {/* Drawer panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 z-50 w-80 bg-surface border-l border-border flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🧮</span>
                  <span className="font-medium text-text text-sm">算小道 AI 老师</span>
                </div>
                <div className="flex items-center gap-2">
                  <VoiceModeButton />
                  <button
                    onClick={handleClose}
                    className="text-text-dim hover:text-text transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Message list */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
                {messages.map((msg, i) => (
                  <ChatMessage
                    key={i}
                    role={msg.role as 'user' | 'assistant'}
                    content={msg.content}
                    isStreaming={loading && i === streamingIndexRef.current}
                  />
                ))}
                {error && (
                  <div className="text-red-400 text-xs text-center py-2">
                    {error}
                    <button
                      onClick={() => {
                        setError(null);
                        const lastUser = [...messages].reverse().find(m => m.role === 'user');
                        if (lastUser) sendMessage(lastUser.content, messages);
                      }}
                      className="ml-2 underline"
                    >
                      重试
                    </button>
                  </div>
                )}
                {loading && streamingIndexRef.current === -1 && (
                  <p className="text-text-dim text-xs text-center py-2">算小道正在思考…</p>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message input */}
              <div className="px-4 py-3 border-t border-border flex-shrink-0">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
                    placeholder="输入你的问题..."
                    disabled={loading}
                    className="flex-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-dim focus:outline-none focus:border-accent/60 disabled:opacity-50"
                  />
                  <button
                    onClick={() => sendMessage(input)}
                    disabled={loading || !input.trim()}
                    className="w-9 h-9 bg-accent rounded-lg flex items-center justify-center text-bg hover:bg-accent/90 disabled:opacity-40 transition-colors flex-shrink-0"
                  >
                    <Send size={15} />
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
