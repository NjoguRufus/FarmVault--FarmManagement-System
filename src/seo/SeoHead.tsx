import React from "react";
import { Helmet } from "react-helmet-async";
import {
  SEO_BASE_URL,
  CANONICAL_DOMAIN,
  DEFAULT_TITLE,
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  TWITTER_HANDLE,
  TITLE_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
} from "./constants";

function isNonCanonicalDomain(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host.includes("vercel.app") || host === "localhost" || host === "127.0.0.1";
}

export interface SeoHeadProps {
  /** Page title (max 60 chars for SEO). */
  title?: string;
  /** Meta description (150–160 chars). */
  description?: string;
  /** Canonical URL (defaults to current path on SEO_BASE_URL). */
  canonical?: string;
  /** Open Graph image URL. */
  image?: string;
  /** OG type: website or article. */
  ogType?: "website" | "article";
  /** Article published time (ISO string) for article ogType. */
  publishedTime?: string;
  /** Article modified time (ISO string). */
  modifiedTime?: string;
  /** Author for article. */
  author?: string;
  /** No-index this page. */
  noindex?: boolean;
  /** JSON-LD script(s) – array of object(s) to serialize. */
  jsonLd?: object | object[];
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3).trim() + "...";
}

function absoluteUrl(path: string, base: string): string {
  if (path.startsWith("http")) return path;
  const baseClean = base.replace(/\/$/, "");
  const pathClean = path.startsWith("/") ? path : `/${path}`;
  return `${baseClean}${pathClean}`;
}

export function SeoHead({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  canonical,
  image = DEFAULT_OG_IMAGE,
  ogType = "website",
  publishedTime,
  modifiedTime,
  author = "FarmVault",
  noindex = false,
  jsonLd,
}: SeoHeadProps) {
  const safeTitle = truncate(title, TITLE_MAX_LENGTH);
  const safeDescription = truncate(description, DESCRIPTION_MAX_LENGTH);
  const path = canonical ?? (typeof window !== "undefined" ? window.location.pathname || "/" : "/");
  const canonicalUrl = path.startsWith("http") ? path : absoluteUrl(path, CANONICAL_DOMAIN);
  const imageUrl = image.startsWith("http") ? image : absoluteUrl(image, CANONICAL_DOMAIN);
  
  const shouldNoindex = noindex || isNonCanonicalDomain();

  return (
    <Helmet>
      <title>{safeTitle}</title>
      <meta name="description" content={safeDescription} />
      <link rel="canonical" href={canonicalUrl} />
      {shouldNoindex && <meta name="robots" content="noindex, nofollow" />}

      {/* Open Graph */}
      <meta property="og:title" content={safeTitle} />
      <meta property="og:description" content={safeDescription} />
      <meta property="og:type" content={ogType} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={imageUrl} />
      <meta property="og:site_name" content="FarmVault" />
      <meta property="og:locale" content="en_KE" />
      {ogType === "article" && publishedTime && (
        <meta property="article:published_time" content={publishedTime} />
      )}
      {ogType === "article" && modifiedTime && (
        <meta property="article:modified_time" content={modifiedTime} />
      )}
      {ogType === "article" && author && (
        <meta property="article:author" content={author} />
      )}

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content={TWITTER_HANDLE} />
      <meta name="twitter:title" content={safeTitle} />
      <meta name="twitter:description" content={safeDescription} />
      <meta name="twitter:image" content={imageUrl} />

      {/* JSON-LD */}
      {jsonLd != null && (
        <script type="application/ld+json">
          {JSON.stringify(
            Array.isArray(jsonLd) ? jsonLd : jsonLd
          )}
        </script>
      )}
    </Helmet>
  );
}

export default SeoHead;
