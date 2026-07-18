interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export default function Card({ children, className = '', onClick }: CardProps) {
  return (
    <div
      className={`bg-surface border border-border rounded-2xl ${onClick ? 'cursor-pointer hover:border-accent/50 transition-colors' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
