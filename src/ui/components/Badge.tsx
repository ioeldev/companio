import type { ReactNode } from "react";

type Variant = "default" | "success" | "warning" | "error" | "info";

const classes: Record<Variant, string> = {
  default: "bg-white/10 text-white/60",
  success: "bg-green-500/20 text-green-400",
  warning: "bg-yellow-500/20 text-yellow-400",
  error: "bg-red-500/20 text-red-400",
  info: "bg-blue-500/20 text-blue-400",
};

interface BadgeProps {
  children: ReactNode;
  variant?: Variant;
}

export function Badge({ children, variant = "default" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${classes[variant]}`}
    >
      {children}
    </span>
  );
}
