/** Matches smart daily message categories → app routes (align with engagement-email-cron smartDailyPushPath). */
export function farmerInboxNavigatePath(category: string | null | undefined): string {
  switch (category) {
    case 'inventory':
      return '/inventory';
    case 'expenses':
      return '/expenses';
    case 'harvest':
      return '/harvest-sales';
    case 'cropStage':
      return '/crop-stages';
    case 'summary':
      return '/home';
    default:
      return '/home';
  }
}
