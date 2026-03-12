import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useInventoryCategories } from '@/hooks/useInventoryReadModels';
import { AlertTriangle } from 'lucide-react';

export default function InventoryCategoriesPage() {
  const { user } = useAuth();
  const companyId = user?.companyId ?? null;
  const { categories, isLoading, error } = useInventoryCategories(companyId);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inventory Categories</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View the master list of inventory categories configured for your company.
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="fv-card p-6 text-sm text-muted-foreground">
          Loading categories…
        </div>
      )}

      {error && !isLoading && (
        <div className="fv-card p-6 flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" />
          Failed to load categories. Please try again.
        </div>
      )}

      {!isLoading && !error && (
        <div className="fv-card overflow-x-auto">
          {categories.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">
              No inventory categories configured yet.
            </div>
          ) : (
            <table className="fv-table min-w-full">
              <thead>
                <tr>
                  <th className="text-left">Name</th>
                  <th className="text-left">Description</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => (
                  <tr key={cat.id}>
                    <td className="text-sm font-medium text-foreground">
                      {cat.name}
                    </td>
                    <td className="text-sm text-muted-foreground">
                      {cat.description ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

