import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { SEO_DEFAULTS, canonicalUrl } from '@/lib/seoConstants';

const TITLE_MAX = 60;
const DESC_MAX = 160;

export interface SeoHeadProps {
  title?: string;
  description?: string;
  canonical?: string;
  image?: string;
  noindex?: boolean;
  jsonLd?: object | object[];
}

function setMeta(name: string, content: string, property = false) {
  const attr = property ? 'property' : 'name';
  let el = document.querySelector(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setOrRemoveMeta(name: string, content: string | undefined, property = false) {
  const attr = property ? 'property' : 'name';
  const el = document.querySelector(`meta[${attr}="${name}"]`);
  if (content) {
    if (!el) {
      const m = document.createElement('meta');
      m.setAttribute(attr, name);
      m.setAttribute('content', content);
      document.head.appendChild(m);
    } else el.setAttribute('content', content);
  } else if (el) el.remove();
}

export function SeoHead({
  title,
  description,
  canonical: canonicalPath,
  image,
  noindex,
  jsonLd,
}: SeoHeadProps) {
  const location = useLocation();
  const scriptIdRef = useRef<string | null>(null);

  const fullTitle = title
    ? `${title.length > TITLE_MAX ? title.slice(0, TITLE_MAX - 3) + '...' : title} | ${SEO_DEFAULTS.siteName}`
    : SEO_DEFAULTS.defaultTitle;
  const fullDesc =
    description && description.length <= DESC_MAX
      ? description
      : (description?.slice(0, DESC_MAX - 3) + '...') || SEO_DEFAULTS.defaultDescription;
  const canonical = canonicalPath ? canonicalUrl(canonicalPath) : canonicalUrl(location.pathname);
  const imageUrl = image?.startsWith('http') ? image : canonicalUrl(image || SEO_DEFAULTS.defaultImage);

  useEffect(() => {
    document.title = fullTitle;
    setMeta('description', fullDesc);
    setMeta('robots', noindex ? 'noindex,nofollow' : 'index,follow');

    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = canonical;

    setMeta('og:title', fullTitle, true);
    setMeta('og:description', fullDesc, true);
    setMeta('og:type', 'website', true);
    setMeta('og:url', canonical, true);
    setMeta('og:image', imageUrl, true);
    setMeta('og:locale', SEO_DEFAULTS.locale, true);
    setMeta('og:site_name', SEO_DEFAULTS.siteName, true);

    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:site', SEO_DEFAULTS.twitterHandle);
    setMeta('twitter:title', fullTitle);
    setMeta('twitter:description', fullDesc);
    setMeta('twitter:image', imageUrl);
  }, [fullTitle, fullDesc, canonical, imageUrl, noindex]);

  useEffect(() => {
    if (!jsonLd) return;
    const scripts = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
    const id = 'farmvault-jsonld-' + Math.random().toString(36).slice(2);
    scriptIdRef.current = id;
    scripts.forEach((data, i) => {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.id = id + '-' + i;
      script.textContent = JSON.stringify(data);
      document.head.appendChild(script);
    });
    return () => {
      scripts.forEach((_, i) => {
        const el = document.getElementById(id + '-' + i);
        if (el) el.remove();
      });
    };
  }, [jsonLd]);

  return null;
}
