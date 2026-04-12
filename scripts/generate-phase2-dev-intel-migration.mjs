import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const srcPath = path.join(
  root,
  "supabase/migrations/20260329120000_developer_company_farm_intelligence.sql",
);
const outPath = path.join(
  root,
  "supabase/migrations/20260412170000_phase2_developer_intelligence_soft_delete.sql",
);

const s = fs.readFileSync(srcPath, "utf8");
const start = s.indexOf(
  "create or replace function public.get_developer_company_farm_intelligence",
);
const grant = s.indexOf(
  "grant execute on function public.get_developer_company_farm_intelligence",
);
if (start < 0 || grant < 0) throw new Error("Could not locate function boundaries");

let body = s.slice(start, grant).trim();

/** @param {RegExp} re */
function r(re, rep) {
  const n = body.replace(re, rep);
  if (n === body) {
    console.warn("WARN: pattern had no match:", re.toString());
  }
  body = n;
}

// Metrics: active projects count
r(
  /\(select count\(\*\)::bigint from projects\.projects p where p\.company_id = p_company_id\)/g,
  "(select count(*)::bigint from projects.projects p where p.company_id = p_company_id and p.deleted_at is null)",
);

// Harvest totals: only harvests tied to a non-deleted project
r(
  /from harvest\.harvests h where h\.company_id = p_company_id/g,
  "from harvest.harvests h join projects.projects p_hp on p_hp.id = h.project_id and p_hp.deleted_at is null where h.company_id = p_company_id",
);

// Expense metrics
r(
  /from finance\.expenses e where e\.company_id = p_company_id/g,
  "from finance.expenses e where e.company_id = p_company_id and e.deleted_at is null",
);

// Collections count
r(
  /\(select count\(\*\)::bigint from harvest\.harvest_collections hc where hc\.company_id = p_company_id\)/g,
  "(select count(*)::bigint from harvest.harvest_collections hc where hc.company_id = p_company_id and hc.deleted_at is null)",
);

// last_activity maxima
r(
  /\(select max\(p\.updated_at\) from projects\.projects p where p\.company_id = p_company_id\)/g,
  "(select max(p.updated_at) from projects.projects p where p.company_id = p_company_id and p.deleted_at is null)",
);
r(
  /\(select max\(h\.created_at\) from harvest\.harvests h where h\.company_id = p_company_id\)/g,
  "(select max(h.created_at) from harvest.harvests h join projects.projects p_hp on p_hp.id = h.project_id and p_hp.deleted_at is null where h.company_id = p_company_id)",
);
r(
  /\(select max\(e\.created_at\) from finance\.expenses e where e\.company_id = p_company_id\)/g,
  "(select max(e.created_at) from finance.expenses e where e.company_id = p_company_id and e.deleted_at is null)",
);
r(
  /\(select max\(hc\.created_at\) from harvest\.harvest_collections hc where hc\.company_id = p_company_id\)/g,
  "(select max(hc.created_at) from harvest.harvest_collections hc where hc.company_id = p_company_id and hc.deleted_at is null)",
);

// Project rollups list
r(
  /from projects\.projects p\n    where p\.company_id = p_company_id\n    order by p\.updated_at/g,
  "from projects.projects p\n    where p.company_id = p_company_id and p.deleted_at is null\n    order by p.updated_at",
);

// Rollup subqueries on project p (active list only) — harvest_count / spend already scoped by p.id

// Recent harvests
r(
  /from harvest\.harvests h\n    left join projects\.projects pr on pr\.id = h\.project_id\n    where h\.company_id = p_company_id/g,
  "from harvest.harvests h\n    left join projects.projects pr on pr.id = h.project_id\n    where h.company_id = p_company_id and (pr.id is null or pr.deleted_at is null)",
);

// Dynamic expense list WHERE
r(
  /from finance\.expenses e\n        left join projects\.projects pr on pr\.id = e\.project_id\n        where e\.company_id = \$1/g,
  "from finance.expenses e\n        left join projects.projects pr on pr.id = e.project_id\n        where e.company_id = $1 and e.deleted_at is null",
);

// Category breakdown
r(
  /from finance\.expenses e\n    where e\.company_id = p_company_id\n    group by e\.category/g,
  "from finance.expenses e\n    where e.company_id = p_company_id and e.deleted_at is null\n    group by e.category",
);

// Collections block WHERE hc.company_id = $1 (execute replace format)
r(
  /where hc\.company_id = \$1\n        order by %s desc nulls last\n        limit 80/g,
  "where hc.company_id = $1 and hc.deleted_at is null\n        order by %s desc nulls last\n        limit 80",
);

// Timeline union branches
r(
  /from projects\.projects p\n          where p\.company_id = \$1\n        union all/g,
  "from projects.projects p\n          where p.company_id = $1 and p.deleted_at is null\n        union all",
);
r(
  /from finance\.expenses e\n          left join projects\.projects pr on pr\.id = e\.project_id\n          where e\.company_id = \$1\n        union all/g,
  "from finance.expenses e\n          left join projects.projects pr on pr.id = e.project_id\n          where e.company_id = $1 and e.deleted_at is null\n        union all",
);
r(
  /from harvest\.harvests h\n      left join projects\.projects pr on pr\.id = h\.project_id\n      where h\.company_id = \$1\n    union all/g,
  "from harvest.harvests h\n      left join projects.projects pr on pr.id = h.project_id\n      where h.company_id = $1 and (pr.id is null or pr.deleted_at is null)\n    union all",
);
r(
  /from harvest\.harvest_collections hc\n      left join projects\.projects pr on __FV_HC_PR_ON__\n      where hc\.company_id = \$1\n    union all/g,
  "from harvest.harvest_collections hc\n      left join projects.projects pr on __FV_HC_PR_ON__\n      where hc.company_id = $1 and hc.deleted_at is null\n    union all",
);

const out =
  `-- Phase 2 follow-up: developer company intelligence excludes soft-deleted rows (projects, expenses,\n` +
  `-- collections) and harvests on deleted projects. Regenerated from 20260329120000 body via scripts/generate-phase2-dev-intel-migration.mjs.\n\n` +
  `begin;\n\n` +
  body +
  `\n\ngrant execute on function public.get_developer_company_farm_intelligence(uuid) to authenticated;\n\n` +
  `commit;\n\nnotify pgrst, 'reload schema';\n`;

fs.writeFileSync(outPath, out);
console.log("Wrote", outPath, "chars", out.length);
