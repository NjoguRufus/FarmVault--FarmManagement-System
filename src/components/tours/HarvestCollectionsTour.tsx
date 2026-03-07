/**
 * Harvest Collections guided tour — Joyride wrapper.
 * Renders when run is true and steps are non-empty. Parent owns state and step filtering.
 */

import React from 'react';
import Joyride, { CallBackProps, Step } from 'react-joyride';
import { HARVEST_TOUR_JOYRIDE_CONFIG } from '@/tours/harvestCollectionsTour';

const NAVBAR_HEIGHT = 64;

export interface HarvestCollectionsTourProps {
  run: boolean;
  steps: Step[];
  stepIndex: number;
  onCallback: (data: CallBackProps) => void;
}

export function HarvestCollectionsTour({
  run,
  steps,
  stepIndex,
  onCallback,
}: HarvestCollectionsTourProps) {
  if (steps.length === 0) return null;

  return (
    <Joyride
      steps={steps}
      run={run && stepIndex < steps.length}
      stepIndex={stepIndex}
      callback={onCallback}
      continuous
      showProgress
      showSkipButton
      disableOverlayClose
      scrollToFirstStep
      disableScrollParentFix={false}
      scrollOffset={NAVBAR_HEIGHT}
      spotlightPadding={HARVEST_TOUR_JOYRIDE_CONFIG.spotlightPadding}
      floaterProps={{
        offset: NAVBAR_HEIGHT,
        disableAnimation: false,
      }}
      locale={HARVEST_TOUR_JOYRIDE_CONFIG.locale}
      styles={HARVEST_TOUR_JOYRIDE_CONFIG.styles}
    />
  );
}
