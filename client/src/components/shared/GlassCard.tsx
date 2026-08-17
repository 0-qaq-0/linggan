import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export default function GlassCard({ children, className = '', onClick }: Props) {
  return (
    <div
      className={`glass ${className} transition-all duration-300`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
