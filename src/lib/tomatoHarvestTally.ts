export function harvestOrdinalTitle(harvestNumber: number): string {
  const n = Math.max(1, Math.floor(harvestNumber));
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th Harvest`;
  switch (n % 10) {
    case 1:
      return `${n}st Harvest`;
    case 2:
      return `${n}nd Harvest`;
    case 3:
      return `${n}rd Harvest`;
    default:
      return `${n}th Harvest`;
  }
}
