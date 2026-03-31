export type UpgradeModalOpenDetail = {
  /** Optional preselected plan in billing modal. */
  checkoutPlan?: 'basic' | 'pro';
};

const EVENT_NAME = 'fv:open-upgrade-modal';

export function openUpgradeModal(detail: UpgradeModalOpenDetail = {}): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<UpgradeModalOpenDetail>(EVENT_NAME, { detail }));
}

export function onUpgradeModalOpen(handler: (detail: UpgradeModalOpenDetail) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (evt: Event) => {
    const e = evt as CustomEvent<UpgradeModalOpenDetail>;
    handler(e.detail ?? {});
  };
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}

