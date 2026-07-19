/**
 * Pure helpers shared by the app's guided, multi-step flows (pickup,
 * return, and any future wizard). Deliberately small — this is not a
 * generic workflow engine, just the handful of decisions that came up
 * more than once: where to resume after a refresh, whether a single
 * unambiguous option should be pre-selected, and how to count what's
 * still left to do.
 */

/**
 * Given whether each step is already complete (as known from data that
 * exists before the user does anything this session — i.e. what was
 * already saved server-side), returns the step index to open first.
 * This is what makes "resume at the first incomplete step after
 * refresh" possible: call it once, in a lazy `useState` initializer, so
 * it never overrides a user's in-session navigation.
 */
export function resolveInitialStep(completedSteps: boolean[]): number {
  const firstIncomplete = completedSteps.findIndex((done) => !done)
  if (firstIncomplete === -1) return Math.max(0, completedSteps.length - 1)
  return firstIncomplete
}

/**
 * A single-option choice (one available vehicle, one branch, one
 * checklist template...) shouldn't force a click. Returns true only
 * when there's exactly one option and nothing is selected yet — it
 * never overrides an existing or a multi-option selection.
 */
export function shouldAutoSelectSingleOption(optionCount: number, hasSelection: boolean): boolean {
  return optionCount === 1 && !hasSelection
}

export interface RequirementItem {
  label: string
  done: boolean
}

/** Count of items still outstanding, for a persistent "N things left" strip. */
export function unresolvedCount(items: RequirementItem[]): number {
  return items.filter((item) => !item.done).length
}
