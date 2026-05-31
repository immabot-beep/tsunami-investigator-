
# Tsunami Investigator

A Muddy Waters-style forensic research report generator, powered by Claude. Paste any SEC filing, earnings transcript, news article, or short-seller note — the app runs a multi-stage AI pipeline and produces a structured investigative report.

---

## What it does

The app takes source material about a publicly-traded company and runs it through six sequential AI analysis stages:

| Stage | What happens |
|---|---|
| 0 | Extracts a company snapshot (CEO, auditor, revenue, controversies, etc.) |
| 1 | Identifies every specific claim made by management |
| 2 | Scans for red flags (accounting, governance, disclosure, related parties…) |
| 3 | Detects contradictions between management claims and the evidence |
| 4 | Synthesizes a core "bear thesis" in the style of Muddy Waters Research |
| 5 | Writes a full investigative report with investor risk analysis and open questions |

The output report has nine tabs: Snapshot · Core Thesis · Red Flags · Claims · Contradictions · Mgmt vs Reality · Questions for Management · Investor Risks · Conclusion.

Each red flag is labeled with an **epistemic badge** (Verified Fact / Inference / Hypothesis / Open Question) and a **severity level** (High / Medium / Low) so you always know how confident the AI is in each finding.

---

## Getting started

### Prerequisites

- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com) (`sk-ant-...`)
- A React environment (the component is a single `.jsx` file)

### Installation

```bash
# Clone the repo
git clone https://github.com/your-username/tsunami-investigator.git
cd tsunami-investigator

# Install dependencies
npm install

# Start the dev server
npm run dev
```

### Usage

1. Open the app in your browser.
2. Paste your **Anthropic API key** (`sk-ant-...`) and click **Save key**.
3. Enter the **company name** and optional **ticker symbol**.
4. Paste your source material into the text box — the more text, the deeper the analysis. Supported inputs:
   - News articles
   - SEC filing text (10-K, 10-Q, 8-K excerpts)
   - Earnings call transcripts
   - Short-seller reports
   - Press releases or analyst notes
   - Any combination of the above pasted together
5. Click **Generate investigative report** and wait ~60–90 seconds while the pipeline runs.

---

## File structure

```
tsunami_investigator_v3.jsx   ← single-file React component, drop into any React app
README.md
```

---

## Tech stack

- **React** (hooks only, no external state management)
- **Anthropic Claude API** (`claude-sonnet-4-20250514`) — called directly from the browser
- **Tabler Icons** (`ti-*` CSS classes) for UI icons
- Plain inline CSS with design token variables (`--color-text-primary`, `--font-sans`, etc.)

No build configuration is included — drop `tsunami_investigator_v3.jsx` into any React scaffold (Vite, Create React App, Next.js, or a Claude artifact environment).

---

## Changelog — v2 → v3

All bugs identified in v2 have been fixed:

**Bug fixes**

- **`setStage(6)` out of bounds** — the pipeline previously called `setStage(6)` after the final stage completed, which is out of bounds for the 6-item `STAGES` array (indices 0–5). The progress bar and stage list would never show a fully-complete state. Fixed by removing the erroneous `setStage` call at completion and instead relying on `progress === 100` to render all stages as done (green ✓).

- **Management claims not displayed** — the pipeline extracted management claims in Stage 1 and stored them in `report.management_claims`, but there was no tab in `ReportView` to render them. The data was silently discarded. Fixed by adding a **Claims** tab with a full card-per-claim layout showing speaker, claim type badge, quantitative marker, source, and hedging language.

- **API key validation too permissive** — the "Save key" button previously accepted any string starting with `sk-`, which would pass validation but fail at the first API call. Fixed: validation now requires the correct `sk-ant-` prefix.

- **Word count showing "0 min read"** — short texts (under 375 words) displayed "0 min read". Fixed: now displays `< 1 min read` when the calculated reading time rounds to zero.

**Additions in v3**

- `ClaimTypeBadge` component for color-coded claim type labels (financial / accounting / operational / guidance / capital / other)
- `CLAIM_TYPE_COLORS` constant for consistent badge theming
- `contradiction_with_mgmt` field is now surfaced in the red flag expanded view
- `source_of_evidence` field is now shown on contradiction cards
- `short_interest_note` and `key_filing_notes` are now rendered in the Snapshot tab
- Snapshot tab shows `fiscal_year_end` field (was extracted but not displayed)
- Multi-paragraph text fields use `whiteSpace: pre-line` so paragraph breaks render correctly
- Contradiction source text truncation increased from 3,000 to 4,000 characters

---

## Known limitations

- **No export** — the generated report cannot be saved to PDF or copied as markdown. All findings live only in-memory for the session.
- **No streaming** — each stage waits for the full API response before advancing. Long source texts can make individual stages feel slow.
- **Browser-only** — the API key is held in React state and is not persisted. Refreshing the page clears it.
- **Source text is partially truncated in Stage 3** — the contradiction-detection stage only passes the first 4,000 characters of source text. For very long filings, some contradictions may be missed.

---

## Disclaimer

This tool is for **research assistance only**. It does not constitute investment advice or a recommendation to buy or sell any security. All findings are AI-generated inferences from the source material you provide and must be independently verified by a qualified human analyst before being acted upon. Epistemic labels (Verified Fact, Inference, Hypothesis, Open Question) are applied by the model and may be incorrect.

---
👤 Author

Built by Brian as a portfolio project for real estate investment and data analytics

LinkedIn: https://www.linkedin.com/in/brianztp
🔗 Live demo: https://student-housing-dashboard-htev5kxd4hzyz6jnyjdbuc.streamlit.app
| 💻 Code: https://github.com/immabot-beep/student-housing-dashboard

## License

MIT
