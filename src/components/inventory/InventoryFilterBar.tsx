import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { InventoryCategory } from '@/types';

export type InventoryFilterBarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  category: InventoryCategory | 'all';
  onCategoryChange: (value: InventoryCategory | 'all') => void;
  categories: (InventoryCategory | string)[];
};

export function InventoryFilterBar(props: InventoryFilterBarProps) {
  const { search, onSearchChange, category, onCategoryChange, categories } = props;

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search inventory by name, category or unit…"
          className="pl-9"
        />
      </div>
      <div className="w-full md:w-56">
        <Select
          value={category}
          onValueChange={(value) => onCategoryChange(value as InventoryCategory | 'all')}
        >
          <SelectTrigger>
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {String(cat).charAt(0).toUpperCase() + String(cat).slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

