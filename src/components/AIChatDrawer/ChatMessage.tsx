// src/components/AIChatDrawer/ChatMessage.tsx
import ReactMarkdown from 'react-markdown';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;  // 是否正在流式输出（显示光标）
}

export default function ChatMessage({ role, content, isStreaming }: ChatMessageProps) {
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
          isUser
            ? 'bg-accent text-bg rounded-br-none'
            : 'bg-surface2 text-text rounded-bl-none border border-border'
        }`}
      >
        {isUser ? (
          <p>{content}</p>
        ) : (
          <div className="prose prose-sm prose-invert max-w-none">
            <ReactMarkdown>{content}</ReactMarkdown>
            {isStreaming && <span className="inline-block w-1 h-4 bg-text-dim animate-pulse ml-0.5" />}
          </div>
        )}
      </div>
    </div>
  );
}
