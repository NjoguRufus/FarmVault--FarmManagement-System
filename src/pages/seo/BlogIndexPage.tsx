import React from "react";
import { Link } from "react-router-dom";
import { SeoPageLayout } from "@/components/seo/SeoPageLayout";
import { SeoHead } from "@/seo/SeoHead";
import { getBreadcrumbSchema } from "@/seo/structuredData";
import { SEO_ROUTES } from "@/seo/routes";
import { BLOG_POSTS, BLOG_SLUGS_LIST } from "@/data/blogPosts";

const breadcrumbs = [{ name: "Home", path: "/" }, { name: "Blog" }];

export default function BlogIndexPage() {
  return (
    <SeoPageLayout>
      <SeoHead
        title="FarmVault Blog | Farm Management, Crops & Budgeting Kenya"
        description="FarmVault blog: farm management tips, crop guides, budgeting and harvest logistics for Kenyan farmers. Read and then try FarmVault free."
        canonical={SEO_ROUTES.blog}
        jsonLd={getBreadcrumbSchema(breadcrumbs)}
      />
      <article className="container mx-auto px-4 lg:px-8 max-w-4xl">
        <nav className="text-sm text-muted-foreground mb-8">
          <Link to="/" className="hover:text-foreground">Home</Link>
          <span className="mx-2">/</span>
          <span>Blog</span>
        </nav>
        <h1 className="text-4xl font-bold text-foreground mb-6">Blog</h1>
        <p className="text-lg text-muted-foreground mb-10">
          Tips and guides for farm management, crop planning, budgeting and harvest in Kenya. Use <Link to={SEO_ROUTES.farmManagementSoftwareKenya} className="text-primary hover:underline">FarmVault</Link> to put these ideas into practice.
        </p>
        <ul className="space-y-6">
          {BLOG_SLUGS_LIST.map((slug) => {
            const post = BLOG_POSTS[slug];
            if (!post) return null;
            return (
              <li key={post.slug}>
                <Link to={`/blog/${post.slug}`} className="block group">
                  <h2 className="text-xl font-semibold text-foreground group-hover:text-primary transition-colors">
                    {post.title}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">{post.datePublished}</p>
                  <p className="text-muted-foreground mt-2">{post.description}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      </article>
    </SeoPageLayout>
  );
}
