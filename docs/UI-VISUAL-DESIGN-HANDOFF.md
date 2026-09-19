# Budget — UI & Visual Design Handoff

## Objective

Give Budget a distinct visual identity separate from Ledger and the other portfolio applications.

Budget should feel like a **calm, beautifully organized household ledger**, not a banking dashboard, fintech product, or generic administrative application.

The visual direction is:

**Warm • editorial • restrained • confident • domestic rather than corporate**

Think paper, ink, careful bookkeeping and a well-designed personal journal rather than charts, gradients and financial-product UI.

---

# 1. Brand

## Product name

**Budget**

## Logo / product mark

The logo is simply:

**B.**

The period immediately following the B is Craig's **signature orange period**.

Do not use:

- `M.B`
- a dollar sign
- wallet or money icons
- coins
- pie charts
- bank imagery
- decorative monograms

The **B.** should be allowed to stand alone as the application mark.

### Logo color

Default light-mode treatment:

- `B` — Ink `#28242A`
- `.` — Signature Orange `#E86F32`

The orange period is deliberately small. It is the visual signature, not a decorative flourish.

---

# 2. Core Palette

| Token | Hex | Purpose |
|---|---|---|
| Eggshell | `#F5F6F4` | Main application background; a very light neutral eggshell without a warm paper cast |
| Surface | `#FBFBFA` | Raised/subtle content surfaces |
| Ink | `#28242A` | Primary text, logo, important numbers |
| Oxblood | `#722F37` | Primary brand/interface accent |
| Plum | `#665064` | Secondary accent |
| Orange | `#E86F32` | Signature period and very selective highlights |
| Forest | `#3F6654` | Positive/healthy financial state |
| Negative | `#A33A3A` | Genuine negative/problem state |
| Muted | `#716F6B` | Secondary text |
| Stone | `#DEDDD7` | Rules, borders, separators |

Avoid pure white as the dominant page background and avoid pure black text.

The overall effect should be warm rather than stark.

---

# 3. Color Hierarchy

## Oxblood is the primary UI accent

Use oxblood for:

- primary actions
- selected navigation
- important headings/details
- active controls
- key emphasis

Do not flood entire screens with oxblood.

## Orange is the signature

Orange should remain scarce.

Good uses:

- the `B.` period
- tiny active indicators
- selected/focus details
- occasional micro-accent

Bad uses:

- large orange cards
- every button
- large backgrounds
- routine financial values
- decorative orange everywhere

The scarcity of orange is what makes the orange period meaningful.

## Forest

Forest represents genuinely positive financial information where color adds meaning.

Do not turn every positive dollar amount green.

## Negative red

Red means something is actually negative or requires attention.

A zero-dollar balance is **never negative**.

`$0.00` should display in normal Ink or Muted text.

The application must not reproduce the historical spreadsheet conditional-formatting problem that caused effectively-zero balances to appear red.

---

# 4. Typography

The UI should feel more editorial than Ledger.

Use a restrained serif/display face for major identity moments and a highly readable sans serif for functional UI.

Suggested direction:

- **Display / major headings:** Playfair Display
- **UI / numbers / controls:** Inter or system sans-serif

Examples:

- `B.` — display face
- page titles — display face where appropriate
- large envelope totals — strong sans-serif numeric treatment
- transaction rows — sans-serif
- labels and controls — sans-serif

Avoid excessive font weights.

Prefer hierarchy through **size, spacing and position** rather than making everything bold.

Dollar amounts should use tabular numerals where supported so columns align cleanly.

---

# 5. Overall Layout

Budget should not look like a collection of dashboard cards.

Prefer:

- generous whitespace
- thin horizontal rules
- simple lists
- typography-driven hierarchy
- aligned dollar values
- subtle surfaces
- limited borders

Avoid:

- card-inside-card layouts
- excessive rounded rectangles
- large shadows
- gradients
- colorful dashboard tiles
- fintech-style charts as decoration
- excessive icons

A screen should feel closer to a beautifully typeset household ledger than a SaaS analytics dashboard.

---

# 6. Home / Current Period

The current period should immediately answer:

**Where do we stand?**

Suggested hierarchy:

**B.**

Current Period  
August 28 – September 10

### Available
**$X,XXX.XX**

Then concise supporting information:

- Income
- Spent
- Expected income

Follow with the most useful envelope information.

The home screen does not need to display every available metric merely because the database contains it.

Prioritize information Craig and his wife need during normal household budgeting.

---

# 7. Envelopes

Envelope rows should be simple and highly scannable.

Example:

```text
Food Groceries                 $184.27
CR-V Gas                         $73.18
Christmas Gifts                 $610.00
Fast Food                       -$42.63
```

Prefer a clean list separated by whitespace or subtle Stone rules rather than individual cards.

Negative balances may use Negative `#A33A3A`.

Positive balances should generally remain Ink.

Zero balances remain neutral.

Category grouping may use subtle editorial section headings such as:

- HOUSE
- FOOD
- VEHICLES
- CHILDREN / EDUCATION
- SUBSCRIPTIONS
- SAVINGS

These headings should be quiet and useful, not dominant.

---

# 8. Envelope Detail

Envelope Detail should **explain the balance**.

Example:

```text
Food Groceries

$184.27 available

Starting balance         $126.44
Budget                    +$400.00
Spent                     -$342.17
Moved                        $0.00
────────────────────────────────
Available                 $184.27
```

Then show the transactions contributing to the period.

This screen is an important differentiator from the spreadsheet: the user should be able to understand *why* an envelope contains a particular amount without reverse-engineering formulas.

---

# 9. Transactions

Transactions should resemble a clean ledger.

Example:

```text
Kroger                             $84.21
Sep 4 · Food Groceries · Chase

Shell                              $37.18
Sep 3 · CR-V Gas · NFCU
```

Description is visually primary.

Date/category/account are secondary.

Amount is aligned consistently on the right.

Do not place every transaction in a floating card.

---

# 10. Add / Edit Transaction

The transaction form should feel fast.

Primary fields:

- Date
- Description
- Amount
- Envelope/category
- Account

Secondary/optional fields:

- Notes
- Trip
- Trip subcategory

Use clear labels rather than relying exclusively on placeholders.

Primary action:

**Save transaction**

Use Oxblood for the primary action.

Destructive actions use Negative red but should not dominate the screen.

---

# 11. Move Money

This should feel much simpler than the spreadsheet's `Adj +/-` workflow.

Present:

```text
Move money

From
Prius Gas

To
CR-V Gas

Amount
$20.00

Move $20
```

After completion, show a concise confirmation.

Internally this creates the linked zero-sum movement. The user should not need to think about positive and negative adjustment entries.

---

# 12. Navigation

Keep primary navigation minimal.

Recommended destinations:

- Home
- Envelopes
- Transactions
- Budget
- More

Reconciliation, Trips, History and Settings can live under More until usage proves one deserves permanent navigation.

Avoid oversized navigation icons or colorful icon sets.

Text labels are important.

---

# 13. Interaction Principles

Budget should feel **quiet when everything is okay**.

Do not manufacture urgency.

Negative balances are information, not moral judgments.

Expected income must look different from money that is actually available.

Do not automatically "fix" negative envelopes.

Do not use celebratory gamification for routine budgeting.

Avoid language such as:

- You're overspending!
- Bad!
- Great job!
- You're falling behind!
- Congratulations!

Prefer factual language:

- `$42.63 below zero`
- `$380 expected Friday`
- `$184.27 available`
- `$120 moved from Prius Gas`

Budget is a tool for understanding the household's money, not grading the household.

---

# 14. Responsive Behavior

Budget will likely be used substantially on phones.

Mobile layouts should therefore be first-class rather than compressed desktop layouts.

Prioritize:

- thumb-friendly transaction entry
- readable dollar amounts
- one-column envelope lists
- simple navigation
- minimal horizontal scrolling

Desktop may use additional whitespace and wider information layouts, but the conceptual hierarchy should remain identical.

---

# 15. Relationship to Ledger

Budget and Ledger can clearly belong to the same broader portfolio, but they should **not look like the same application with different data**.

Ledger is a vehicle-maintenance utility.

Budget should be warmer, quieter and more editorial.

Differentiate Budget through:

- soft eggshell background
- oxblood primary accent
- signature orange period
- typography-led presentation
- fewer cards
- fewer visible containers
- restrained icons
- financial-ledger alignment
- generous whitespace

Do not copy Ledger's page composition simply for portfolio consistency.

Consistency should come from craftsmanship and interaction quality rather than identical visual templates.

---

# 16. Implementation Priority

This visual pass should **restyle the existing successful Pass 3 functionality**, not rewrite its behavior.

Preserve:

- proven calculation engine
- transaction CRUD
- envelope calculations
- Move Money behavior
- persistence
- 2026 parity behavior
- source/migration integrity

Prioritize this order:

1. Global tokens and typography
2. `B.` product mark
3. Application shell/navigation
4. Home
5. Envelopes
6. Envelope Detail
7. Transactions
8. Add/Edit Transaction
9. Move Money
10. Responsive/mobile refinement

No additional financial functionality is required as part of this visual pass.

---

## Acceptance criteria

The visual pass is complete when:

- Budget is immediately distinguishable from Ledger.
- The product mark is exactly **B.**, with the period in Signature Orange.
- Eggshell is the dominant background rather than bright white, beige, or generic gray.
- Oxblood is the primary UI accent.
- Orange remains a scarce signature detail.
- Financial information is primarily presented through typography, lists and alignment rather than dashboard cards.
- `$0.00` is neutral and never displayed as negative/red.
- Negative envelopes remain visible without making the UI feel punitive.
- All Pass 3 functionality continues to work unchanged.
- Mobile use feels intentional rather than adapted from desktop.

**Design principle:** *A beautifully organized household ledger—not a banking dashboard.*
