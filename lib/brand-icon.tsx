import { ImageResponse } from "next/og";

/**
 * The "S" app icon rendered with next/og, so we don't commit binary PNGs.
 * `maskable` adds the safe-zone padding Android adaptive icons need.
 */
export function brandIcon(size: number, opts: { maskable?: boolean; rounded?: boolean } = {}) {
  const inner = opts.maskable ? size * 0.6 : size;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#3b4fd8",
          borderRadius: opts.rounded ? size * 0.22 : 0,
        }}
      >
        <div
          style={{
            fontSize: inner * 0.62,
            fontWeight: 800,
            color: "white",
            fontFamily: "sans-serif",
            lineHeight: 1,
          }}
        >
          S
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
