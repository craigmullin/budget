# Budget — Pass 5: Split Transactions

## Goal

Make it fast to enter a purchase while still at the store and divide one real-world charge among multiple Budget envelopes without re-entering every receipt item or doing subtraction by hand.

The primary product question is:

> Can Craig enter the total charge, identify only the unusual portions of the purchase, and save a penny-perfect split in less than a minute on his phone?

This pass establishes the accounting and review workflow that future receipt scanning could populate. It does **not** add AI or receipt-image processing.

---

## 1. Core decision

A split purchase remains **one transaction** with one merchant, date, account/payment source, note and total amount.

It contains two or more envelope allocations ("splits"). The sum of those splits must equal the transaction total exactly.

Do not create unrelated visible transactions that merely happen to share a date and merchant. Preserve the parent purchase as the thing that matches the bank or credit-card charge.

Example:

```text
Walmart                                  $32.83

Food Groceries                           $23.54
Other Groceries                            $9.29
                                         ------
Total                                    $32.83
```

The transaction list should show one Walmart charge for $32.83. Transaction detail should show the envelope breakdown.

---

## 2. Two entry modes

### Standard assignment

Preserve the existing simple path for purchases that belong to one envelope:

```text
Merchant        Walmart
Amount          $32.83
Envelope        Food Groceries
```

A user should not have to use split controls for ordinary transactions.

Provide a clear secondary action:

**Split transaction**

Activating it converts the current envelope assignment into the first split row without losing entered merchant, amount, date, account or note.

### Split assignment

In split mode, show:

- transaction total;
- one row per envelope allocation;
- envelope selector for each row;
- integer-cent amount input for each row;
- **Add split**;
- remove split;
- a live **Remaining** amount;
- **Use remainder** for one row;
- Save/Cancel.

---

## 3. Default category plus exceptions

The preferred mobile workflow is "default category plus exceptions."

For a typical Walmart purchase, Craig may treat the purchase as Food Groceries except for household or vehicle items:

```text
Walmart                                  $86.43

Food Groceries                       REMAINDER
Other Groceries                           $18.29
Subaru Repair/Maintenance                 $15.97

Food Groceries calculates to              $52.17
Remaining                                  $0.00
```

This avoids requiring Craig to add the food items or subtract exceptions manually.

The first split should default to the envelope already selected before split mode was opened. If no envelope was selected, require one rather than guessing.

Do not automatically choose a merchant-specific envelope in Pass 5.

---

## 4. "Use remainder" behavior

One and only one split row may be marked **Use remainder**.

Its amount is calculated in integer cents:

```text
remainder = transaction total - sum(all fixed split amounts)
```

Requirements:

- recalculate immediately when the total or a fixed split changes;
- show the calculated dollar amount directly in the remainder row;
- allow the user to move the remainder designation to another row;
- prevent more than one remainder row;
- if a fixed amount would make the remainder negative, show the negative result clearly and block Save;
- include the calculated remainder as an ordinary persisted split amount when saved;
- do not persist a vague "whatever is left" value as the financial record.

If the user turns off **Use remainder**, the calculated value may remain in the input as an editable fixed amount.

---

## 5. Validation and accounting rules

All currency math must use integer cents.

A split transaction may be saved only when:

- the parent total is valid;
- at least two valid split rows remain in split mode;
- every split has an active envelope;
- every persisted split amount is valid;
- the split amounts add exactly to the parent total;
- Remaining is exactly $0.00.

Do not silently round, rebalance or assign a discrepancy.

Show factual inline messages:

- `$12.14 remaining`
- `$3.00 over`
- `Choose an envelope`
- `Split amounts must equal $86.43`

A $0.00 split should normally be removed or rejected rather than persisted. Negative split amounts are out of scope for the first implementation; returns/refunds retain the existing transaction behavior and should not be mixed with a positive purchase in one split transaction.

Duplicate envelope rows should be prevented or merged. Prefer preventing selection of an envelope already used elsewhere in the same split, because one combined amount per envelope is easier to understand.

---

## 6. Tax, discounts and receipt math

Budget does not need item-level tax modeling in this pass. The user assigns portions of the **final charged total**, including tax.

For the sample receipt:

```text
Food items before tax                    $23.54
Dawn                                      $8.76
Tax associated with taxable item          $0.53
Final charge                             $32.83
```

The user may enter:

```text
Food Groceries                           $23.54
Other Groceries                            $9.29
```

Budget should not require separate tax, discount or coupon rows. The only invariant is that the final envelope splits equal the real transaction total.

---

## 7. Add and edit flows

Split capability must work from:

- Add Transaction;
- Edit Transaction;
- Transaction Detail, through the existing edit action.

Editing an existing single-envelope transaction into a split must preserve its identity/provenance and recalculate envelope balances atomically.

Editing an existing split must support:

- changing amounts;
- changing envelopes;
- adding/removing rows;
- returning to a single envelope assignment when only one allocation is needed.

Provide an explicit action such as **Use one envelope** when converting a split back to a normal transaction. Do not discard split data without confirmation if multiple allocations already contain values.

Imported historical transactions should follow existing edit restrictions and provenance rules. Do not mutate immutable source/import records merely to retrofit splits.

---

## 8. Persistence model

Use a parent transaction plus ordered split allocations, or an equivalent model that preserves these invariants:

- one stable transaction ID;
- one authoritative total in integer cents;
- one or more envelope allocation records;
- allocation sum equals the parent total;
- all writes occur atomically;
- transaction CRUD and backups preserve the complete split;
- provenance distinguishes imported and application-created data;
- both authorized household users see the same result.

A single-envelope transaction may continue using the existing representation if that reduces migration risk, provided application code exposes a consistent allocation view.

Avoid storing redundant calculated totals unless they are validated atomically.

Firestore security rules must prevent a partial or mathematically invalid split from being committed. Local SQLite/reference behavior should remain semantically equivalent where that layer still supports writable transactions.

---

## 9. Transaction list and detail presentation

### Transaction list

Keep the list compact:

```text
Walmart                         -$86.43
3 envelopes · Sep 19
```

For a single-envelope transaction, continue showing the envelope name as today.

For a split, use a quiet label such as **3 envelopes** or **Split · 3 envelopes**. Do not show every allocation in the main list.

### Transaction detail

Show the parent information first, then the breakdown:

```text
Walmart                                  $86.43
September 19, 2026 · Chase Visa

Food Groceries                           $52.17
Other Groceries                           $18.29
Subaru Repair/Maintenance                 $15.97
                                         ------
Total                                    $86.43
```

The total and breakdown must be easy to compare with the physical receipt and bank transaction.

---

## 10. Mobile interaction

This workflow is intended for use in a store parking lot, so phone ergonomics are a release requirement.

- Use numeric currency keyboards where supported.
- Keep transaction total and Remaining visible while editing splits.
- Make **Add split**, **Use remainder**, remove and Save easy to tap.
- Do not force a wide table; stack envelope and amount controls on narrow screens.
- Preserve entered data if the user navigates back accidentally within the form.
- Do not add a multi-page wizard unless implementation testing proves it is necessary.
- Follow `docs/UI-VISUAL-DESIGN-HANDOFF.md`: warm ledger aesthetic, thin rules, restrained orange, minimal card clutter.

Suggested compact flow:

```text
Add transaction

Walmart
$86.43
Chase Visa
September 19

Food Groceries
Remainder                              $52.17

Other Groceries
                                      $18.29

Subaru Repair/Maintenance
                                      $15.97

+ Add split

Remaining                               $0.00

Save transaction
```

---

## 11. Error, cancel and concurrent-edit behavior

- Cancel returns without saving any partial financial change.
- A failed write leaves the prior transaction intact.
- Split creation/edit must be atomic; never show a parent transaction with missing allocations.
- Follow the existing shared-household revision/conflict approach. If another authorized user edits the same transaction first, require reload/review instead of overwriting silently.
- A network interruption must not produce duplicated parent charges or orphaned split rows.
- Save should be idempotent against accidental double-taps.

---

## 12. Preserve existing behavior

Pass 5 must not regress:

- existing single-envelope transaction entry;
- transaction edit/delete;
- envelope calculations and detail;
- Move Money;
- Payday Budget/Pass 4;
- 2026 parity and imported provenance;
- authentication and two-user household access;
- backups;
- Firebase Spark operation;
- existing visual design.

A split purchase is spending allocated across envelopes. It is not Move Money and must not change the household unallocated pool except through the same existing transaction semantics as a normal purchase.

---

## 13. Explicitly out of scope

Do not include:

- AI receipt reading or categorization;
- receipt photo upload/storage;
- UPC lookup;
- item-by-item receipt entry;
- merchant rules or learned category defaults;
- bank/Plaid feeds;
- account reconciliation;
- CSV import;
- tax allocation automation;
- gift-purpose or vehicle-intent inference;
- complex refunds containing both positive and negative split lines;
- historical-data conversion solely to make old transactions use the new split structure.

These may build on this accounting/UI foundation later.

---

## 14. Required tests

Add focused model, persistence/rules and browser/UI tests.

At minimum verify:

1. A normal one-envelope transaction still saves unchanged.
2. A $32.83 transaction saves with $23.54 Food Groceries and $9.29 Other Groceries.
3. A $86.43 transaction with fixed exceptions of $18.29 and $15.97 calculates a $52.17 remainder.
4. Any one-cent under/over allocation is blocked.
5. More than one remainder row is impossible.
6. A negative remainder is shown and Save is blocked.
7. Add/remove/change-envelope operations update Remaining immediately.
8. Duplicate envelope rows are prevented.
9. Editing a normal transaction into a split updates every affected envelope exactly once.
10. Editing a split back to one envelope removes obsolete allocations atomically.
11. Delete removes the entire parent purchase and reverses all envelope effects exactly once.
12. Reload and the second authorized household account see the same split.
13. Concurrent edits do not silently overwrite each other.
14. Backup/export contains enough data to restore the parent transaction and all splits.
15. Mobile viewport interaction is usable without horizontal scrolling.
16. Existing parity, transaction, move, Payday Budget and Firestore rule suites continue to pass.

---

## Acceptance criteria

Pass 5 is complete when:

- A user can enter one purchase and allocate it to multiple existing envelopes.
- Single-envelope entry remains the fast default.
- **Split transaction** converts the current assignment without losing transaction fields.
- One split can use the live remainder while the user enters only exceptions.
- The displayed and persisted split sum equals the transaction total to the cent.
- Invalid or incomplete splits cannot be saved.
- The transaction appears once in the transaction list and expands to a clear breakdown in detail.
- Create, edit and delete update all affected envelope balances atomically.
- Split data survives reload, backup and access by either authorized household user.
- The workflow is comfortable on a phone.
- Existing Pass 1–4 behavior and tests remain intact.

## Stop condition

After implementation and automated tests, perform a real phone-based household test using at least:

- one ordinary single-envelope purchase;
- the $32.83 Walmart example split between Food Groceries and Other Groceries;
- one three-envelope transaction using **Use remainder**.

Stop and review that workflow with Craig before beginning receipt scanning, reconciliation or other automation.
