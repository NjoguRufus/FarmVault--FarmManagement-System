import React from "react";
import { cn } from "@/lib/utils";

export interface OptimizedImageProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "loading"> {
  /** Main image src (JPEG/PNG). */
  src: string;
  /** Optional WebP source for smaller size and faster LCP. */
  webpSrc?: string;
  /** When true, use fetchpriority="high" and loading="eager" for LCP image. */
  priority?: boolean;
  /** When true, use loading="lazy" and decoding="async". Default true when priority is false. */
  lazy?: boolean;
}

/**
 * Performance-optimized image: WebP when available, lazy loading for below-the-fold,
 * fetchpriority for LCP. Use priority={true} only for the main LCP image (e.g. hero).
 */
export function OptimizedImage({
  src,
  webpSrc,
  priority = false,
  lazy = !priority,
  className,
  alt = "",
  ...rest
}: OptimizedImageProps) {
  const imgProps = {
    ...rest,
    alt,
    className: cn(className),
    decoding: "async" as const,
    loading: priority ? ("eager" as const) : lazy ? ("lazy" as const) : undefined,
    fetchPriority: priority ? ("high" as const) : undefined,
  };

  if (webpSrc) {
    return (
      <picture>
        <source type="image/webp" srcSet={webpSrc} />
        <img src={src} {...imgProps} />
      </picture>
    );
  }

  return <img src={src} {...imgProps} />;
}
