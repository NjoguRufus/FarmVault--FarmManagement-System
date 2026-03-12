import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { listSuppliers } from '@/services/suppliersService';
import type { Supplier } from '@/types';
import { AlertTriangle } from 'lucide-react';

export default function InventorySuppliersPage() {
  const { user } = useAuth();
  const companyId = user?.companyId ?? null;

  const {
    data: suppliers = [],
    isLoading,
    error,
  } = useQuery<Supplier[]>({
    queryKey: ['suppliers', companyId ?? 'none'],
    queryFn: () => listSuppliers(companyId ?? ''),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inventory Suppliers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View suppliers linked to your inventory items.
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="fv-card p-6 text-sm text-muted-foreground">
          Loading suppliers…
        </div>
      )}

      {error && !isLoading && (
        <div className="fv-card p-6 flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" />
          Failed to load suppliers. Please try again.
        </div>
      )}

      {!isLoading && !error && (
        <div className="fv-card overflow-x-auto">
          {suppliers.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">
              No suppliers found.
            </div>
          ) : (
            <table className="fv-table min-w-full">
              <thead>
                <tr>
                  <th className="text-left">Name</th>
                  <th className="text-left">Contact</th>
                  <th className="text-left hidden md:table-cell">Location</th>
                  <th className="text-left hidden md:table-cell">Phone</th>
                  <th className="text-left hidden lg:table-cell">Email</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.id}>
                    <td className="text-sm font-medium text-foreground">{s.name}</td>
                    <td className="text-sm text-muted-foreground">{s.contact || '—'}</td>
                    <td className="text-sm text-muted-foreground hidden md:table-cell">
                      {s.location ?? '—'}
                    </td>
                    <td className="text-sm text-muted-foreground hidden md:table-cell">
                      {s.phone ?? '—'}
                    </td>
                    <td className="text-sm text-muted-foreground hidden lg:table-cell">
                      {s.email ?? '—'}
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

