import { cn } from '../../lib/utils';
import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'success';
  size?: 'sm' | 'md' | 'lg';
}

const variantClasses = {
  primary:
    'bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-500 text-white shadow-[0_10px_26px_-6px_rgba(15,26,90,0.45)] hover:shadow-[0_16px_34px_-8px_rgba(15,26,90,0.55)] hover:-translate-y-0.5 active:translate-y-0 ring-1 ring-inset ring-white/10',
  secondary:
    'bg-white text-slate-700 border border-slate-200 shadow-[0_2px_8px_-4px_rgba(15,26,90,0.15)] hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/40 hover:-translate-y-0.5',
  ghost:
    'bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700',
  success:
    'bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-[0_10px_26px_-6px_rgba(16,185,129,0.45)] hover:-translate-y-0.5 ring-1 ring-inset ring-white/10',
};

const sizeClasses = {
  sm: 'px-3.5 py-2 text-xs',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-6 py-3.5 text-sm',
};

export function Button({ variant = 'primary', size = 'md', className, children, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-bold cursor-pointer transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:transform-none',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
    >
      {children}
    </button>
  );
}
