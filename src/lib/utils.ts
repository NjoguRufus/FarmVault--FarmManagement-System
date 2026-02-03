import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Returns the label to show for a user's role (e.g. "Broker" for employee + sales-broker). */
export function getDisplayRole(user: { role: string; employeeRole?: string }): string {
  const role = user.role;
  const empRole = (user as { employeeRole?: string }).employeeRole;
  if (role === "employee" && empRole) {
    if (empRole === "sales-broker" || empRole === "broker") return "Broker";
    if (empRole === "manager" || empRole === "operations-manager") return "Manager";
    if (empRole === "logistics-driver" || empRole === "driver") return "Driver";
  }
  return role.replace(/_/g, " ").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  labour: "Labour",
  fertilizer: "Fertilizer",
  chemical: "Chemical",
  fuel: "Fuel",
  other: "Other",
  space: "Crates Space",
  watchman: "Watchman",
  ropes: "Ropes",
  carton: "Carton",
  offloading_labour: "Offloading Labour",
  onloading_labour: "Onloading Labour",
  broker_payment: "Broker Payment",
};

/** Returns display label for an expense category. */
export function getExpenseCategoryLabel(category: string): string {
  return EXPENSE_CATEGORY_LABELS[category] ?? category.replace(/_/g, " ");
}
