"use client";

import { useState, type CSSProperties } from "react";
import { optImg } from "@/lib/img";

// Story image that serves a resized WebP via the image CDN, falls back to the
// original source if the CDN can't process it, and renders nothing if both fail
// — so a dead/blocked image never shows a broken icon. Server-rendered src is
// the CDN URL (crawlers get the optimized one); the fallbacks run in the browser.
export default function Img({
  src,
  width,
  alt = "",
  className,
  style,
  loading = "lazy",
  fetchPriority = "auto",
}: {
  src: string | null | undefined;
  width: number;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
}) {
  const [stage, setStage] = useState(0); // 0 = CDN, 1 = original, 2 = give up
  if (!src || stage >= 2) return null;
  const resolved = stage === 0 ? optImg(src, width) : src;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolved}
      alt={alt}
      className={className}
      style={style}
      loading={loading}
      fetchPriority={fetchPriority}
      onError={() => setStage((s) => s + 1)}
    />
  );
}
