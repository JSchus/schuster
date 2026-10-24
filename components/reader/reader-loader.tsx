"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { Reader } from "./reader";

/**
 * Client-only entry: the reader depends on localStorage, the Cache API and
 * browser-only libraries (epub.js, pdf.js), so it never renders on the server.
 */
const LazyReader = dynamic(() => import("./reader").then((m) => m.Reader), {
  ssr: false,
  loading: () => <div className="fixed inset-0 bg-background" />,
});

export function ReaderLoader(props: ComponentProps<typeof Reader>) {
  return <LazyReader {...props} />;
}
