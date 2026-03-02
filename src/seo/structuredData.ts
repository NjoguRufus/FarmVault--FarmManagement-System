/**
 * JSON-LD structured data for FarmVault – Organization, SoftwareApplication,
 * Article, FAQ, Breadcrumb, LocalBusiness.
 */

export interface OrganizationSchema {
  "@context": "https://schema.org";
  "@type": "Organization";
  name: string;
  url: string;
  logo?: string;
  description?: string;
  areaServed?: { "@type": "Place"; name: string };
  sameAs?: string[];
}

export interface SoftwareApplicationSchema {
  "@context": "https://schema.org";
  "@type": "SoftwareApplication";
  name: string;
  applicationCategory: string;
  operatingSystem: string;
  description: string;
  url: string;
  areaServed?: { "@type": "Country"; name: string };
  offers?: { "@type": "Offer"; price: string; priceCurrency: string };
}

export interface ArticleSchema {
  "@context": "https://schema.org";
  "@type": "Article";
  headline: string;
  description?: string;
  image?: string | string[];
  datePublished?: string;
  dateModified?: string;
  author?: { "@type": "Organization"; name: string };
  publisher?: { "@type": "Organization"; name: string; logo?: { "@type": "ImageObject"; url: string } };
}

export interface FAQSchema {
  "@context": "https://schema.org";
  "@type": "FAQPage";
  mainEntity: Array<{
    "@type": "Question";
    name: string;
    acceptedAnswer: { "@type": "Answer"; text: string };
  }>;
}

export interface BreadcrumbSchema {
  "@context": "https://schema.org";
  "@type": "BreadcrumbList";
  itemListElement: Array<{
    "@type": "ListItem";
    position: number;
    name: string;
    item?: string;
  }>;
}

export interface LocalBusinessSchema {
  "@context": "https://schema.org";
  "@type": "LocalBusiness";
  name: string;
  description?: string;
  url: string;
  areaServed?: { "@type": "Country"; name: string };
  address?: { "@type": "PostalAddress"; addressLocality: string; addressCountry: string };
  telephone?: string;
  email?: string;
}

const BASE_URL = typeof window !== "undefined" ? `${window.location.protocol}//${window.location.host}` : "https://farmvault.co.ke";

export function getOrganizationSchema(overrides?: Partial<OrganizationSchema>): OrganizationSchema {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "FarmVault",
    url: BASE_URL,
    logo: `${BASE_URL}/Logo/FarmVault_Logo dark mode.png`,
    description: "Africa's Intelligent Farm Management System. Farm management software for Kenya and East Africa.",
    areaServed: { "@type": "Place", name: "Kenya" },
    sameAs: [],
    ...overrides,
  };
}

export function getSoftwareApplicationSchema(overrides?: Partial<SoftwareApplicationSchema>): SoftwareApplicationSchema {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "FarmVault",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: "FarmVault helps Kenyan farmers manage crops, budgets, inventory, expenses and harvest logistics in one intelligent farm management system.",
    url: BASE_URL,
    areaServed: { "@type": "Country", name: "Kenya" },
    offers: { "@type": "Offer", price: "0", priceCurrency: "KES" },
    ...overrides,
  };
}

export function getArticleSchema(
  headline: string,
  options: { description?: string; image?: string; datePublished?: string; dateModified?: string }
): ArticleSchema {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline,
    description: options.description,
    image: options.image ? (options.image.startsWith("http") ? options.image : `${BASE_URL}${options.image}`) : undefined,
    datePublished: options.datePublished,
    dateModified: options.dateModified || options.datePublished,
    author: { "@type": "Organization", name: "FarmVault" },
    publisher: {
      "@type": "Organization",
      name: "FarmVault",
      logo: { "@type": "ImageObject", url: `${BASE_URL}/Logo/FarmVault_Logo dark mode.png` },
    },
  };
}

export function getFAQSchema(
  items: Array<{ question: string; answer: string }>
): FAQSchema {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(({ question, answer }) => ({
      "@type": "Question" as const,
      name: question,
      acceptedAnswer: { "@type": "Answer" as const, text: answer },
    })),
  };
}

export function getBreadcrumbSchema(
  items: Array<{ name: string; path?: string }>
): BreadcrumbSchema {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem" as const,
      position: i + 1,
      name: item.name,
      ...(item.path ? { item: `${BASE_URL}${item.path}` } : {}),
    })),
  };
}

export function getLocalBusinessSchema(
  options: { name?: string; city?: string; telephone?: string; email?: string }
): LocalBusinessSchema {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: options.name || "FarmVault",
    description: "Farm management software Kenya – crops, budget, inventory, harvest logistics.",
    url: BASE_URL,
    areaServed: { "@type": "Country", name: "Kenya" },
    address: {
      "@type": "PostalAddress",
      addressLocality: options.city || "Nairobi",
      addressCountry: "KE",
    },
    telephone: options.telephone,
    email: options.email || "hello@farmvault.co.ke",
  };
}
