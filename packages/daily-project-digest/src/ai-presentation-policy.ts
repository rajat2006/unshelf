export const lifecycleAuthorityPrompt =
  "The surrounding digest supplies delivery status separately, so never state or imply it. Before returning, rewrite any sentence containing lifecycle words or variants such as production, live, release, complete, block, open, closed, waiting, pending, queued, awaiting, delayed, dependency, paused, stalled, halted, stopped, ready, done, finished, remaining, in progress, merge, deploy, ship, land, underway, moving forward, or needs attention.";

const lifecycleState = String.raw`(?:live|released|completed|blocked|closed|open|waiting|pending|queued|paused|stalled|halted|stopped|ready(?:\s+for\s+(?:release|deployment|shipping|merging))?|done|finished|remaining|in progress|underway|awaiting\s+(?:release|deployment|merging|a prerequisite))`;
const lifecycleTransition = String.raw`(?:released|completed|blocked|closed|opened|merged|deployed|shipped|landed|paused|stalled|halted|stopped|finished)`;
const lifecyclePredicate = String.raw`(?:(?:is|are|was|were|becomes?|became|remains?|stays?)\s+(?:now\s+)?${lifecycleState}|(?:has|have|had)\s+(?:been\s+)?${lifecycleTransition})`;

const lifecycleStatusClaim = new RegExp(
  String.raw`\b(?:(?:the\s+)?(?:work|effort|project|feature|change|update|delivery|plan|overview))\s+${lifecyclePredicate}\b`,
  "i",
);

const directLifecycleStatusClaim = new RegExp(
  String.raw`^(?:(?:it|this|that)|the\s+[a-z][^.!?]{0,60})\s+${lifecyclePredicate}\b`,
  "i",
);

export function hasLifecycleStatusClaim(sentence: string): boolean {
  return (
    lifecycleStatusClaim.test(sentence) ||
    directLifecycleStatusClaim.test(sentence)
  );
}
