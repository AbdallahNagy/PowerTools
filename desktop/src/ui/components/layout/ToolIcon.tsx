import type { CSSProperties } from "react";

/**
 * Draws a tool's SVG icon in the current text color by using it as a mask,
 * so one icon file works in the dark and light themes.
 */
export function ToolIcon({ src, className = "" }: { src: string; className?: string }) {
  const mask = `url("${src}") center / contain no-repeat`;
  const style: CSSProperties = { mask, WebkitMask: mask };
  return (
    <span
      aria-hidden="true"
      data-tool-icon={src}
      className={`inline-block h-5 w-5 shrink-0 bg-current opacity-80 ${className}`}
      style={style}
    />
  );
}
