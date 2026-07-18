interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export default function Card({ children, className = '', onClick }: CardProps) {
  const classes = `bg-surface border border-border rounded-2xl ${onClick ? 'cursor-pointer hover:border-accent/50 transition-colors' : ''} ${className}`;

  if (onClick) {
    return (
      <button type="button" className={`${classes} w-full text-left`} onClick={onClick}>
        {children}
      </button>
    );
  }

  return <div className={classes}>{children}</div>;
}
