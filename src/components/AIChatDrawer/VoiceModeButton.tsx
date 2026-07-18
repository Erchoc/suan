// src/components/AIChatDrawer/VoiceModeButton.tsx
import { Mic } from 'lucide-react';

export default function VoiceModeButton() {
  return (
    <button
      onClick={() => alert('语音模式即将上线，敬请期待！')}
      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-text-dim border border-border hover:border-accent/40 transition-colors"
    >
      <Mic size={12} />
      <span>语音</span>
      <span className="text-accent text-[10px]">即将上线</span>
    </button>
  );
}
