import type { CSSProperties } from "react";

/**
 * Draws a tool's SVG icon in the current text color by using it as a mask,
 * so one icon file works in the dark and light themes.
 */
export function ToolIcon({
  src,
  className = "",
  untrusted = false,
}: {
  src: string;
  className?: string;
  /** The icon is a data URL from a community tool. It is drawn as an <img>, which never runs script inside the SVG. */
  untrusted?: boolean;
}) {
  if (untrusted) {
    return (
      <img
        src={src}
        alt=""
        aria-hidden="true"
        data-tool-icon={src}
        className={`inline-block h-5 w-5 shrink-0 object-contain ${className}`}
      />
    );
  }
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
