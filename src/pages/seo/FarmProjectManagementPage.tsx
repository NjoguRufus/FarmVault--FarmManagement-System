import React from "react";
import { Link } from "react-router-dom";
import { PillarPageTemplate } from "@/components/seo/PillarPageTemplate";
import { SEO_ROUTES } from "@/seo/routes";

const breadcrumbs = [{ name: "Home", path: "/" }, { name: "Farm Project Management Software" }];
const faqs = [
  { question: "What is farm project management?", answer: "Farm project management is the practice of planning and tracking distinct farm activities—e.g. a tomato block, a maize plot—from land prep to harvest. You assign tasks, track progress and link everything to costs and yields." },
  { question: "How is it different from general project management?", answer: "Farm project management is built around crops, blocks, seasons and agronomic stages. It ties to inputs, labour and harvests rather than generic tasks. Tools like FarmVault are designed for this workflow." },
  { question: "Does FarmVault support project management?", answer: "Yes. FarmVault lets you create projects (e.g. per crop or block), plan activities, track crop stages and link operations, expenses and harvests to each project. You get a clear view per project and across the farm." },
  { question: "Can my team use it?", answer: "FarmVault supports multiple users and roles. You can assign tasks and let managers or workers update progress. Permissions help keep data accurate and visible to the right people." },
];

export default function FarmProjectManagementPage() {
  return (
    <PillarPageTemplate
      title="Farm Project Management Software | Plan & Track Crops Kenya"
      description="Farm project management for Kenya: plan crops and blocks, track tasks and stages. Link to expenses and harvests. Try FarmVault free."
      canonical={SEO_ROUTES.farmProjectManagement}
      breadcrumbs={breadcrumbs}
      faqs={faqs}
    >
      <h1 className="text-4xl font-bold text-foreground mb-6 tracking-tight">Farm Project Management Software</h1>
      <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
        Farm project management brings structure to your farm work. By organising activities into projects—for example by crop or block—you can plan tasks, track progress and see how each part of the farm performs in terms of cost and yield.
      </p>
      <div className="prose prose-neutral dark:prose-invert max-w-none mb-12">
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Why use project management on the farm</h2>
        <p className="text-muted-foreground leading-relaxed">
          When each crop or block is a project with its own plan, costs and harvests, you can compare performance and improve <Link to={SEO_ROUTES.farmBudgetingSoftware} className="text-primary hover:underline">budgeting</Link>. Project-based <Link to={SEO_ROUTES.cropMonitoringSoftware} className="text-primary hover:underline">crop monitoring</Link> and <Link to={SEO_ROUTES.farmExpenseTracking} className="text-primary hover:underline">expense tracking</Link> make it clear which varieties and practices are profitable.
        </p>
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Features that matter</h2>
        <p className="text-muted-foreground leading-relaxed">
          Look for project and block setup, task or activity tracking, links to operations and labour, and reporting per project. FarmVault combines this with <Link to={SEO_ROUTES.farmInventoryManagement} className="text-primary hover:underline">inventory</Link> and <Link to={SEO_ROUTES.farmHarvestManagement} className="text-primary hover:underline">harvest management</Link> so you have one system for the whole operation.
        </p>
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Get started</h2>
        <p className="text-muted-foreground leading-relaxed">
          Start with FarmVault for free. Create your first project, add blocks and activities, and begin logging progress and costs. As you build history, project management becomes the backbone of your farm data.
        </p>
        <div className="rounded-xl border bg-muted/30 p-6 my-10">
          <div className="h-48 bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-sm">[Project management screenshot]</div>
        </div>
      </div>
    </PillarPageTemplate>
  );
}
