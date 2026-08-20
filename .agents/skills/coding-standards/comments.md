# Navigational comments

A navigational comment is adjacent maintenance guidance that preserves verified,
stable, non-obvious knowledge needed to interpret, review, or safely change code
when names, types, interfaces, and proportionate structural improvements cannot
express it adequately.

## Scope

This standard applies to human-maintained code-like artifacts, including runtime
source, tests, stylesheets, migrations and SQL, scripts, workflows, and
configuration.

Generated, vendored, minified, and lock files are excluded. License headers,
TODOs, tool directives, generated-code markers, Markdown documentation, and
ordinary public API documentation are distinct from navigational comments.
JSDoc is navigational only when its content passes the admission gate below.

## Admission gate

Add or retain a navigational comment only when all of these hold:

- Its absence creates meaningful change risk or substantial reconstruction work.
- Its local value exceeds its documentation-drift cost.
- It records a maintained constraint, policy, boundary, or rationale rather than
  incidental mechanics.
- The claim is verified from code, tests, authoritative documentation, or
  relevant history.
- Names, types, interfaces, extraction, or module boundaries cannot carry the
  meaning proportionately.

Stable knowledge is tied to a maintained contract. It survives ordinary
implementation refactoring and changes when its underlying constraint, policy,
boundary, or trade-off changes.

Purpose, phase flow, invariants, ordering, trust boundaries, concurrency,
lifecycle, and operational rationale are useful diagnostic lenses, not automatic
permission to comment.

Reject or tighten:

- narration recoverable from adjacent names, types, and statements;
- copied ADRs, tests, configuration, constants, runbooks, or other authorities;
- bare references that omit the distinct local consequence;
- issue history, temporary circumstances, incidental sequencing, and speculation;
- prose better replaced by a proportionate structural improvement; and
- repeated copies instead of one comment at the narrowest stable owner.

## Ownership and form

Write one focused comment at the narrowest stable owner. It may contain multiple
tightly coupled claims that share the same owner and lifecycle. Split claims that
belong to different owners or change independently.

Let form follow the owning seam. Module or exported-seam guidance may use a block
comment; a local ordering, concurrency, or lifecycle constraint normally belongs
in a line comment. No comment form earns admission by itself.

Authority is assigned by subject:

- `CONTEXT.md` owns canonical domain vocabulary.
- ADRs own accepted architecture, durable rationale, and trade-offs until
  superseded.
- Executable code and configuration own current mechanics and values.
- Tests specify observable behavior.
- Operational documentation owns procedures and recorded external state.
- A navigational comment owns only its adjacent local consequence, invariant, or
  hidden constraint.

A comment may include the minimum broader fact needed to make its local
consequence intelligible and may point to its authority. It must not copy or
override that authority. Reconcile conflicts by correcting the owning source or
implementation and updating or removing the comment in the same change.

## During implementation

Maintain comments across the semantic change surface: the changed behavior, its
directly coupled contracts, and every identifiable comment whose truth depends
on that behavior. The obligation ends where that causal relationship ends.

Perform a comment-impact check whenever work creates, alters, exposes, or removes
knowledge that could pass the admission gate. Use this disposition order:

1. Prefer a small, proportionate improvement to names, types, interfaces,
   extraction, or module boundaries when it fits the implementation task.
2. Add a comment when qualifying hidden knowledge remains without a stable owner.
3. Update, tighten, split, or relocate a comment when its maintained claim changes.
4. Delete a comment that has become false, obsolete, redundant, or displaced by a
   better owner.
5. Preserve qualifying knowledge when a mixed comment also contains narration or
   duplication.
6. Prefix an existing claim with `UNVERIFIED:` only under the exception below.

Revalidate the complete affected comment instead of patching one sentence inside
a broader obsolete model.

A dedicated comment-backfill task does not expand into structural redesign.
Exclude candidates whose meaning should be carried entirely by redesign.
Structural debt does not disqualify residual constraints or rationale that a
later refactor would still need to preserve.

A mechanical change that leaves qualifying knowledge and its comments unchanged
requires no comment edit.

## Unverified existing claims

`UNVERIFIED:` is a temporary quarantine marker and a narrow exception to the
verified-claim gate. It prefixes an existing source comment; it never authorizes
new speculative prose.

Use it only when:

- the comment is inside the active semantic change surface;
- proportionate checks of affected code, callers, tests, owning documentation,
  and relevant history find neither verification nor contradiction; and
- the change neither depends on nor risks violating the uncertain claim.

If the change depends on or could violate the claim, stop as blocked.

Keep investigation history in the implementation summary, not the source
comment. Every newly prefixed marker remains an unresolved review finding. A
later change to the same semantic surface must investigate again and either
verify and unmark the claim, correct or delete it with evidence, or leave it
marked if uncertainty genuinely remains.

## During review

The Standards review must perform the same comment-impact check and judge
maintenance harm and change risk rather than taxonomy, density, or prose
preference.

- Report missing commentary only when the admission gate passes.
- Treat stale or misleading commentary as a correctness defect, with severity
  based on the risk it creates.
- Report redundancy when it hides the real constraint, conflicts with an
  authority, or creates material drift risk.
- Describe the hidden knowledge, supporting evidence, maintenance risk, and
  narrowest stable owner. Exact replacement wording is optional.
- Treat every newly added `UNVERIFIED:` marker as unresolved.

A review workflow may add, update, or delete commentary directly only when it is
already authorized to edit source and evidence makes both the disposition and
wording unambiguous. Otherwise report the finding. Prefix an eligible existing
claim with `UNVERIFIED:` only when source editing is authorized and all conditions
above hold.

Do not opportunistically clean up unrelated comments outside the semantic change
surface. Mention one separately only when it creates a concrete, significant
safety or correctness risk. Do not block the active change unless that change
relies on or perpetuates the false guidance.

## Calibrated examples

- **Keep:** An authentication-factory comment explains why an injected identity
  seam exists and how it protects per-User isolation testing. That ownership and
  safety consequence are not recoverable from its signature.
- **Keep:** A polling comment records the minimum external-system behavior needed
  to explain why an apparently successful deployment must not be treated as
  immediately healthy.
- **Replace:** A module preamble mixes valid ownership and acyclicity constraints
  with an obsolete data model. Revalidate the whole comment, preserve the valid
  constraints, and remove the stale model.
- **Delete:** “Build today's capped suggestion projection” merely paraphrases the
  function name and return contract.
- **Add—ordering:**

  ```ts
  // Give each populated signal one slot before filling spare capacity in signal
  // priority order. SIGNALS therefore owns both suggestion diversity and final
  // presentation order; per-signal sorting keeps every choice deterministic.
  ```

- **Add—concurrency:**

  ```ts
  // Adds may resolve out of order. Merge this server-confirmed Item into the
  // current Focus so an older response cannot erase another confirmed Add.
  ```

- **No comment:** An exported declarative request schema whose names, structure,
  and inferred types fully express its contract.
- **No comment:** A transparent catalogue component with no hidden policy or
  local consequence.

## Guardrails

Comment count, density, file size, complexity, and style preference are never
goals. Do not add routine “comments checked” declarations.

Comment-only changes do not automatically require new tests. Verify prose against
existing authorities and run checks proportionate to any code changed. Add tests
when behavior changes or the work exposes an untested contract.
