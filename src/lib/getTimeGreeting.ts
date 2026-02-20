/**
 * Returns a time-based greeting based on local time.
 * 05:00–11:59: morning
 * 12:00–16:59: afternoon
 * else: evening
 */
export function getTimeGreeting(): 'morning' | 'afternoon' | 'evening' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'evening';
}

export function getGreetingText(firstName: string | null): string {
  const name = firstName?.trim() || 'there';
  const period = getTimeGreeting();
  const labels = {
    morning: 'Good morning',
    afternoon: 'Good afternoon',
    evening: 'Good evening',
  };
  return `${labels[period]}, ${name} 👋`;
}
