import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  children?: ReactNode;
  className?: string;
}

export function PageHeader({ title, children, className }: PageHeaderProps) {
  return (
    <div className={`flex items-center gap-3 flex-wrap ${className ?? ""}`}>
      <h2 className="text-xl font-bold">{title}</h2>
      {children}
    </div>
  );
}
