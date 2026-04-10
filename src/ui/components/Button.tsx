import type { ButtonHTMLAttributes } from "react";

type Variant = "default" | "ghost" | "danger" | "success";
type Size = "sm" | "md";

const variantClasses: Record<Variant, string> = {
  default: "bg-white/10 hover:bg-white/20 text-white/80",
  ghost: "text-white/40 hover:bg-white/5 hover:text-white/60",
  danger: "text-red-400 hover:text-red-300 hover:bg-red-400/10",
  success: "text-green-400 hover:text-green-300 hover:bg-green-400/10",
};

const sizeClasses: Record<Size, string> = {
  sm: "text-xs px-2.5 py-1",
  md: "text-sm px-4 py-1.5",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({
  variant = "default",
  size = "sm",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`rounded transition-colors disabled:opacity-50 ${variantClasses[variant]} ${sizeClasses[size]} ${className ?? ""}`}
      {...props}
    >
      {children}
    </button>
  );
}
