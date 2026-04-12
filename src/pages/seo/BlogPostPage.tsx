import React from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { SeoPageLayout } from "@/components/seo/SeoPageLayout";
import { SeoHead } from "@/seo/SeoHead";
import { getArticleSchema, getBreadcrumbSchema } from "@/seo/structuredData";
import { SEO_ROUTES } from "@/seo/routes";
import { getBlogPost } from "@/data/blogPosts";
import { SeoInternalLinks } from "@/components/seo/SeoInternalLinks";
import { sanitizeMarketingHtml } from "@/lib/sanitizeMarketingHtml";

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const post = slug ? getBlogPost(slug) : null;

  if (!post) return <Navigate to={SEO_ROUTES.blog} replace />;

  const breadcrumbs = [
    { name: "Home", path: "/" },
    { name: "Blog", path: SEO_ROUTES.blog },
    { name: post.title },
  ];
  const jsonLd = [
    getBreadcrumbSchema(breadcrumbs),
    getArticleSchema(post.title, {
      description: post.description,
      datePublished: post.datePublished,
      dateModified: post.dateModified ?? post.datePublished,
    }),
  ];

  return (
    <SeoPageLayout>
      <SeoHead
        title={post.title}
        description={post.description}
        canonical={`/blog/${post.slug}`}
        ogType="article"
        publishedTime={post.datePublished}
        modifiedTime={post.dateModified ?? post.datePublished}
        jsonLd={jsonLd}
      />
      <article className="container mx-auto px-4 lg:px-8 max-w-4xl">
        <nav className="text-sm text-muted-foreground mb-8">
          <Link to="/" className="hover:text-foreground">Home</Link>
          <span className="mx-2">/</span>
          <Link to={SEO_ROUTES.blog} className="hover:text-foreground">Blog</Link>
          <span className="mx-2">/</span>
          <span className="line-clamp-1">{post.title}</span>
        </nav>
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-4">{post.title}</h1>
          <p className="text-muted-foreground">
            <time dateTime={post.datePublished}>{post.datePublished}</time>
            {post.dateModified && post.dateModified !== post.datePublished && (
              <span> · Updated <time dateTime={post.dateModified}>{post.dateModified}</time></span>
            )}
          </p>
        </header>
        {post.content ? (
          <div
            className="prose prose-neutral dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: sanitizeMarketingHtml(post.content) }}
          />
        ) : (
          <div className="prose prose-neutral dark:prose-invert max-w-none">
            <p className="text-muted-foreground lead">{post.description}</p>
            <p className="text-muted-foreground">
              Full article content (1200+ words) targeting long-tail keywords, with internal links to <Link to={SEO_ROUTES.farmManagementSoftwareKenya} className="text-primary hover:underline">farm management software Kenya</Link>, <Link to={SEO_ROUTES.farmExpenseTracking} className="text-primary hover:underline">expense tracking</Link>, <Link to={SEO_ROUTES.farmBudgetingSoftware} className="text-primary hover:underline">farm budgeting</Link> and <Link to={SEO_ROUTES.cropGuides} className="text-primary hover:underline">crop guides</Link>, can be added here or loaded from a CMS. Use FarmVault to plan and track your farm in one place.
            </p>
            <p className="text-muted-foreground">
              Ready to try? <Link to="/setup-company" className="text-primary font-medium hover:underline">Start your free trial</Link> or <a href="tel:+254714748299" className="text-primary font-medium hover:underline">call 0714 748299</a> for a demo.
            </p>
          </div>
        )}
        <footer className="mt-12 pt-8 border-t space-y-8">
          <Link to={SEO_ROUTES.blog} className="text-primary hover:underline">← Back to Blog</Link>
          <SeoInternalLinks />
        </footer>
      </article>
    </SeoPageLayout>
  );
}
