import React from "react";
import AdminFinancesPage from "@/pages/admin/AdminFinancesPage";
import { DeveloperPageShell } from "@/components/developer/DeveloperPageShell";

export default function DeveloperFinancesPage() {
  return (
    <DeveloperPageShell
      title="Platform Finances"
      description="Revenue, expenses, profitability, and burn insights for FarmVault."
    >
      <AdminFinancesPage embedded />
    </DeveloperPageShell>
  );
}

