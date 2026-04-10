import type { ReactNode } from "react";

interface CardProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Card({ title, children, className }: CardProps) {
  return (
    <div className={`bg-white/5 border border-white/10 rounded-xl p-4 ${className ?? ""}`}>
      {title && (
        <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
          {title}
        </p>
      )}
      {children}
    </div>
  );
}
