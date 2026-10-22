import type { ReactNode } from "react";

export function Phone({ children, className = "", style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`phone ${className}`} style={style}>
      <div className="phone-screen">{children}</div>
    </div>
  );
}
