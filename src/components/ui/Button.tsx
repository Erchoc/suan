import { type HTMLMotionProps, motion } from 'framer-motion';
import { forwardRef } from 'react';

interface ButtonProps extends HTMLMotionProps<'button'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

const variantClasses = {
  primary: 'bg-accent text-bg font-semibold hover:bg-amber-400',
  secondary: 'bg-surface2 text-text border border-border hover:border-accent hover:text-accent',
  ghost: 'text-text-dim hover:text-text hover:bg-surface2',
  danger: 'bg-accent2 text-white hover:bg-red-500',
};

const sizeClasses = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-4 py-2 text-sm rounded-xl',
  lg: 'px-6 py-3 text-base rounded-xl',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', className = '', children, ...props }, ref) => {
    return (
      <motion.button
        ref={ref}
        whileTap={{ scale: 0.97 }}
        className={`
          inline-flex items-center justify-center gap-2 transition-colors duration-150 cursor-pointer
          disabled:opacity-40 disabled:cursor-not-allowed
          ${variantClasses[variant]} ${sizeClasses[size]} ${className}
        `}
        {...props}
      >
        {children}
      </motion.button>
    );
  },
);

Button.displayName = 'Button';
export default Button;
