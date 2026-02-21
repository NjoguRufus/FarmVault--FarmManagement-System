import React, { useEffect, useRef } from "react";

export const ACTIONS = {
  PREV: "prev",
  NEXT: "next",
  CLOSE: "close",
} as const;

export const EVENTS = {
  TARGET_NOT_FOUND: "target_not_found",
  STEP_AFTER: "step_after",
  TOUR_END: "tour_end",
} as const;

export const STATUS = {
  FINISHED: "finished",
  SKIPPED: "skipped",
  RUNNING: "running",
} as const;

export type CallBackProps = {
  action?: (typeof ACTIONS)[keyof typeof ACTIONS];
  index?: number;
  status?: (typeof STATUS)[keyof typeof STATUS];
  type?: (typeof EVENTS)[keyof typeof EVENTS];
};

type JoyrideProps = {
  steps?: unknown[];
  run?: boolean;
  stepIndex?: number;
  callback?: (data: CallBackProps) => void;
  [key: string]: unknown;
};

// Temporary local fallback for environments where `react-joyride` isn't installed.
// It safely terminates a started tour so the app remains usable.
export default function JoyrideShim({
  run = false,
  stepIndex = 0,
  callback,
}: JoyrideProps) {
  const notifiedRef = useRef(false);

  useEffect(() => {
    if (!run) {
      notifiedRef.current = false;
      return;
    }

    if (notifiedRef.current || !callback) {
      return;
    }

    notifiedRef.current = true;
    callback({
      action: ACTIONS.CLOSE,
      index: stepIndex,
      status: STATUS.SKIPPED,
      type: EVENTS.TOUR_END,
    });
  }, [run, stepIndex, callback]);

  return null;
}
