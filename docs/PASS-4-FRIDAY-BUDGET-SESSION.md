# Budget — Pass 4: Friday Budget Session

## Goal

Implement the real household budgeting ritual as a first-class workflow in Budget.

Pass 1 proved that the calculation engine reproduces the 2026 spreadsheet. Pass 2 exposed the data through a read-only UI. Pass 3 made transactions and envelope movements writable and persistent. The visual pass established Budget's distinct `B.` identity.

Pass 4 should make the **Friday Budget Session** easier than performing the same work in the spreadsheet.

The primary product question is:

> Can Craig's wife sit down on Friday, review the household's position, adjust the normal envelope allocations where necessary, finish the budget, and understand exactly where the household stands?

Do not implement reconciliation or historical imports as part of this pass.

---

## 1. Important domain distinction

A **Budget Session** is not the same thing as an **Allocation Period**.

- **Allocation Period** is the established budgeting/calculation period used by the spreadsheet model.
- **Budget Session** is the real-world event when the household sits down to make allocation decisions, normally on Friday.

Do not force the session date to redefine the underlying allocation-period math.

Store both concepts explicitly.

---

## 2. Preserve the existing default-allocation workflow

The spreadsheet currently provides a major convenience: normal `Budget` / add-to-envelope amounts can effectively be copied forward rather than manually re-entered for every envelope.

**Do not replace this with a workflow that requires typing every allocation every Friday.**

Each envelope/category should support an **active default allocation amount**.

These defaults are the application equivalent of the baseline values maintained in the workbook's `2026 Final` configuration.

When a new Friday Budget Session starts:

1. Load all active envelopes.
2. Pre-populate each envelope's proposed allocation with its active default amount.
3. Let the user review the full budget.
4. The user changes only the amounts that need to differ for this session.
5. Recalculate totals immediately as values change.
6. Commit the final allocations only when the session is finished.

The normal experience should therefore be **review and modify exceptions**, not re-enter the household budget from scratch.

---

## 3. Default allocations

Default allocation amounts must be persisted independently from individual session allocations.

Conceptually:

```text
Envelope                Default
Food Groceries          $200.00
CR-V Gas                 $40.00
Christmas                $25.00
Vacation                  $0.00
...
```

A session allocation is a snapshot/decision for that specific session. Changing a session amount must **not automatically change the stored default**.

Defaults should eventually be editable through Settings or an equivalent configuration screen.

For Pass 4, provide enough UI to inspect and edit defaults if necessary, but do not turn default management into a large configuration subsystem.

### Reset behavior

Provide a clear action such as:

**Reset to defaults**

This restores the current draft session's proposed allocations to the active defaults.

Resetting a draft does not affect historical completed sessions or the stored defaults themselves.

---

## 4. Starting a Friday Budget Session

The Budget destination should make it obvious whether there is:

- no current session;
- a draft/in-progress session; or
- a completed session for the relevant period.

Starting a new session should create a **draft**, not immediately alter envelope balances.

Suggested heading:

```text
Friday Budget
September 12, 2026
```

The exact wording can adapt responsively, but the workflow should remain obvious.

A draft must survive navigation, refresh, sign-out/sign-in, and use from the other authorized household account.

There must not be separate conflicting Friday budgets simply because Craig and his wife use different authorized logins.

---

## 5. Money available now vs. expected later

Budget must distinguish between:

1. **Money actually available now**
2. **Expected income that has not yet arrived**

This distinction is important because household income does not necessarily arrive on one synchronized schedule.

Expected income is a projection. It must not silently become spendable money before it actually posts/is recognized as available.

Suggested summary:

```text
Available to budget       $2,140.17
Expected later              $380.00
```

If useful, the UI may also show a projected position after expected income, but that number must be clearly labeled as projected.

Never combine actual available money and expected income into one ambiguous total.

---

## 6. Main allocation interface

The core screen should be fast to scan and edit.

Suggested structure:

```text
Friday Budget — September 12

Available to budget                      $2,140.17
Allocated                                $1,875.00
Remaining                                  $265.17
Expected later                              $380.00

Envelope                    Available       Add
Food Groceries               -$84.21      $200.00
CR-V Gas                      $31.17       $40.00
Mortgage                       $0.01      $XXX.XX
Christmas                    $418.20       $25.00
Vacation                     $750.00        $0.00
```

Exact responsive layout is Roger's implementation choice, but preserve the conceptual hierarchy.

On mobile, each row may stack rather than forcing a three-column table.

### Required information per envelope

At minimum show:

- envelope/category name;
- current available balance before this session's allocation;
- proposed amount to add during this session.

Optionally show projected balance after allocation if it improves usability without clutter.

---

## 7. Live calculations

As allocation values change, immediately update:

- total proposed allocation;
- amount remaining to allocate;
- projected envelope balance where displayed.

Use the existing integer-cent calculation conventions.

Do not introduce floating-point currency math.

A user must be able to see the consequence of a change before finishing the session.

---

## 8. Negative envelopes are allowed

Budget must not require every envelope to reach zero or become positive.

The household may intentionally leave an envelope negative because additional income is expected later or because available household money is being prioritized elsewhere.

Therefore:

- allow a completed session with negative envelopes;
- do not automatically pull money from other envelopes;
- do not block completion;
- do not show punitive warnings;
- do not use moralizing language.

Factual information is appropriate, for example:

```text
3 envelopes remain below zero
```

This is information, not an error condition.

---

## 9. Over-allocation

If proposed allocations exceed money currently available, clearly show the resulting negative remainder.

Example:

```text
Remaining to allocate   -$125.00
```

Do not silently change allocations to force the total to zero.

Because expected income is separate from available money, the UI can help explain that expected income may improve the projected position without pretending it has already arrived.

Whether completion is allowed while allocations exceed currently available funds should follow the existing household model rather than imposing conventional budgeting-app rules. Prefer warning/information over blocking unless a proven accounting invariant requires otherwise.

---

## 10. Review before completion

Finishing a session should include a concise review step.

Example:

```text
Review Friday Budget

Available before             $2,140.17
Allocated                    $1,875.00
Remaining                      $265.17
Expected later                 $380.00

27 envelopes funded
14 unchanged
3 remain below zero
```

Primary action:

**Finish Budget Session**

Allow the user to return to editing before committing.

---

## 11. Completing the session

When the user finishes the Budget Session:

1. Persist the finalized session.
2. Persist the final allocation amount for each applicable envelope for that session/period.
3. Apply those allocations through the existing proven envelope calculation model.
4. Recalculate affected envelope balances.
5. Make the resulting values immediately visible throughout Home, Envelopes and Envelope Detail.
6. Preserve the session as historical evidence of the decisions made that Friday.

Do not mutate historical source/import records to represent new application activity.

Application-created records should be distinguishable from migrated spreadsheet records through provenance/source metadata.

---

## 12. Draft behavior

Budget Sessions should support a persistent draft state.

A user may start the Friday budget, leave, and return later.

Draft allocations must not affect actual envelope balances until the session is completed.

If another authorized household user opens the same draft, they should see the same household session rather than an independent personal copy.

Avoid complicated collaborative editing in Pass 4. Shared persisted state is sufficient.

---

## 13. Completed-session behavior

A completed session should be viewable afterward.

Show at least:

- session date;
- allocation period;
- total allocated;
- remaining amount at completion;
- expected income recorded at the time if applicable;
- per-envelope allocations.

Do not require a sophisticated historical reporting interface yet.

If editing a completed session is supported, it must be explicit and auditable rather than silently overwriting the original decisions. If that creates unnecessary complexity for Pass 4, completed sessions may initially be immutable and correction can be deferred.

---

## 14. Expected income

Support expected income as a distinct concept rather than treating it as a posted transaction.

Useful fields may include:

- source;
- expected amount;
- expected date;
- optional note/status.

Expected income should be visible during budgeting but excluded from actual available-money calculations until it becomes real income according to the application's accounting rules.

Do not duplicate a posted income transaction merely because it was previously expected.

The detailed expected-income lifecycle can evolve later; Pass 4 needs only enough behavior to accurately support the Friday decision process.

---

## 15. UI / visual requirements

Follow `docs/UI-VISUAL-DESIGN-HANDOFF.md`.

In particular:

- preserve the `B.` mark with the signature orange period;
- use the warm Paper/cream background;
- Oxblood is the primary interface accent;
- orange remains scarce;
- favor typography, whitespace and thin rules over dashboard cards;
- negative balances are visible but not punitive;
- `$0.00` remains neutral;
- optimize the workflow for phone use as well as desktop.

The Budget Session should feel like a beautifully organized household ledger, not a fintech wizard.

---

## 16. Preserve existing functionality

Pass 4 must not regress:

- 2026 spreadsheet parity;
- transaction CRUD;
- transaction persistence;
- envelope calculations;
- Move Money behavior;
- imported provenance;
- authentication/access restrictions;
- existing production functionality.

Add tests around the new session/default-allocation behavior rather than replacing the existing parity tests.

---

## 17. Explicitly out of scope

Do **not** include the following in Pass 4:

- account reconciliation workflow;
- 2014–2025 historical imports;
- Plaid or bank feeds;
- CSV bank import;
- AI categorization;
- automated financial advice;
- forecasting beyond the simple expected-income distinction needed for the session;
- gamification;
- complex analytics/reporting;
- major redesign of unrelated screens.

These should not delay validation of the Friday Budget Session.

---

## 18. Validation / parallel-run test

Before considering Pass 4 complete, perform at least one representative Friday Budget Session against the spreadsheet workflow.

Recommended test:

1. Begin with the same household state in the spreadsheet and Budget.
2. Start a Budget Session.
3. Confirm the session pre-populates the expected default allocations.
4. Modify several allocations from their defaults.
5. Leave at least one envelope unchanged.
6. Include at least one negative envelope.
7. Include expected income if applicable.
8. Complete the session.
9. Compare resulting Budget allocations and ending envelope balances against the spreadsheet.

The release gate is penny-for-penny agreement for the equivalent allocation decisions.

Any discrepancy should be surfaced and explained rather than normalized silently.

---

## Acceptance criteria

Pass 4 is complete when:

- A user can start a persistent Friday Budget Session.
- New sessions are pre-populated from active default envelope allocations.
- The user normally changes only exceptions rather than typing every allocation.
- `Reset to defaults` restores the draft allocations appropriately.
- Session edits do not silently modify the stored defaults.
- Current available money and expected income are clearly distinct.
- Allocation totals and remaining money update immediately while editing.
- Negative envelopes are allowed and treated as information.
- A review step appears before completion.
- Completing a session updates envelope calculations throughout the application.
- The completed session and its per-envelope decisions are persisted.
- Draft sessions survive reload/navigation and are shared household state for the authorized users.
- Existing Pass 1–3 functionality and parity tests continue to pass.
- A representative spreadsheet-vs-app Friday session produces penny-for-penny equivalent results.

## Stop condition

Once the Friday Budget Session passes the parallel-run validation, **stop and review the workflow with Craig before beginning reconciliation or historical migration work.**

The next likely milestone after approval is **Pass 5: account reconciliation**.
