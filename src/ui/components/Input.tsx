import type { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={`bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm outline-none focus:border-white/30 transition-colors placeholder:text-white/20 ${className ?? ""}`}
      {...props}
    />
  );
}
