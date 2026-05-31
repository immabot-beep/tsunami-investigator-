import { useState, useCallback } from "react";

// ─── Constants ─────────────────────────────────────────────────────────────────

const STAGES = [
  { id: "read",          label: "Reading your sources",          icon: "ti-file-text" },
  { id: "claims",        label: "Extracting management claims",  icon: "ti-quote" },
  { id: "redflags",      label: "Scanning for red flags",        icon: "ti-alert-triangle" },
  { id: "contradictions",label: "Detecting contradictions",      icon: "ti-arrows-diff" },
  { id: "thesis",        label: "Synthesizing bear thesis",      icon: "ti-bulb" },
  { id: "report",        label: "Writing investigative report",  icon: "ti-report" },
];

const EPISTEMIC_COLORS = {
  VERIFIED_FACT: { bg: "#EAF3DE", text: "#3B6D11", border: "#639922", label: "Verified Fact" },
  INFERENCE:     { bg: "#E6F1FB", text: "#185FA5", border: "#378ADD", label: "Inference" },
  HYPOTHESIS:    { bg: "#FAEEDA", text: "#854F0B", border: "#BA7517", label: "Hypothesis" },
  OPEN_QUESTION: { bg: "#FAECE7", text: "#993C1D", border: "#D85A30", label: "Open Question" },
};

const SEVERITY_COLORS = {
  HIGH:   { bg: "#FCEBEB", text: "#A32D2D", border: "#E24B4A" },
  MEDIUM: { bg: "#FAEEDA", text: "#854F0B", border: "#EF9F27" },
  LOW:    { bg: "#E6F1FB", text: "#185FA5", border: "#378ADD" },
};

const CLAIM_TYPE_COLORS = {
  financial:   { bg: "#EAF3DE", text: "#3B6D11", border: "#639922" },
  accounting:  { bg: "#FCEBEB", text: "#A32D2D", border: "#E24B4A" },
  operational: { bg: "#E6F1FB", text: "#185FA5", border: "#378ADD" },
  guidance:    { bg: "#FAEEDA", text: "#854F0B", border: "#BA7517" },
  capital:     { bg: "#FAECE7", text: "#993C1D", border: "#D85A30" },
  other:       { bg: "var(--color-background-secondary)", text: "var(--color-text-secondary)", border: "var(--color-border-tertiary)" },
};

// ─── API ───────────────────────────────────────────────────────────────────────

async function callClaude(apiKey, messages, systemPrompt) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      system: systemPrompt,
      messages,
    }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

function stripJson(raw) {
  return raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
}

// ─── Pipeline ──────────────────────────────────────────────────────────────────

async function runPipeline(apiKey, companyName, ticker, sourceText, setStage, setProgress, setReport, setError) {
  try {
    const context = `Company: ${companyName}${ticker ? ` (${ticker})` : ""}

SOURCE MATERIAL PROVIDED BY USER:
${sourceText}`;

    // ── Stage 0: Snapshot ────────────────────────────────────────────────────
    setStage(0);
    setProgress(10);

    const snapshotRaw = await callClaude(
      apiKey,
      [{ role: "user", content: `Based ONLY on the source material below, extract basic company information.

${context}

Return ONLY this JSON:
{
  "company_name": "",
  "ticker": "",
  "sector": "",
  "description": "2 sentence business description",
  "ceo": "",
  "cfo": "",
  "auditor": "",
  "exchange": "",
  "revenue": "",
  "market_cap": "",
  "fiscal_year_end": "",
  "recent_controversies": ["list any mentioned"],
  "short_interest_note": "",
  "key_filing_notes": ["any notable filing observations"]
}

If a field is not mentioned in the source, write "Not mentioned in sources".` }],
      "You are a financial data extractor. Extract only what is explicitly stated in the provided source material. Return only valid JSON, no markdown."
    );

    let companyInfo;
    try {
      companyInfo = JSON.parse(stripJson(snapshotRaw));
    } catch {
      companyInfo = {
        company_name: companyName,
        ticker: ticker || "N/A",
        sector: "See source material",
        description: sourceText.slice(0, 200) + "...",
        ceo: "Not mentioned", cfo: "Not mentioned", auditor: "Not mentioned",
        exchange: "Not mentioned", revenue: "Not mentioned", market_cap: "Not mentioned",
        fiscal_year_end: "Not mentioned", recent_controversies: [], short_interest_note: "",
        key_filing_notes: [],
      };
    }

    // ── Stage 1: Management claims ───────────────────────────────────────────
    setStage(1);
    setProgress(25);

    const claimsRaw = await callClaude(
      apiKey,
      [{ role: "user", content: `You are a forensic analyst. Read the source material below and extract every specific claim made by management or the company about financial performance, accounting, operations, metrics, or business outlook.

${context}

Return ONLY a JSON array of claims found in the text:
[
  {
    "claim_id": "c001",
    "speaker": "who said it (CEO/CFO/Company/PR/etc)",
    "claim": "the specific claim paraphrased precisely",
    "source": "which document or section this came from",
    "claim_type": "financial|accounting|operational|guidance|capital|other",
    "quantitative": true or false,
    "hedging_language": "any qualifying words like 'we believe' or 'approximately' used"
  }
]

Extract 5-12 claims. Only use what is in the source material.` }],
      "You are a forensic financial analyst. Extract only claims explicitly present in the provided source material. Return only valid JSON array."
    );

    let claims = [];
    try { claims = JSON.parse(stripJson(claimsRaw)); } catch { claims = []; }

    // ── Stage 2: Red flags ───────────────────────────────────────────────────
    setStage(2);
    setProgress(42);

    const redFlagsRaw = await callClaude(
      apiKey,
      [{ role: "user", content: `You are a short-seller analyst reading source material about ${companyName}. Identify every red flag, warning sign, inconsistency, or concern visible in this material.

Look for:
- Unusual or aggressive accounting treatments
- Off-balance-sheet items or hidden liabilities
- Management compensation tied to specific metrics
- Related party transactions
- Disclosure omissions or language changes
- Regulatory inquiries or SEC comment letters
- Auditor concerns or changes
- Insider selling patterns
- Capital structure complexity
- Contradictions between different statements
- Unusually positive language without supporting evidence

${context}

Return ONLY a JSON array:
[
  {
    "flag_id": "rf001",
    "category": "accounting|governance|operations|disclosure|related_party|capital_structure|valuation|management_credibility",
    "title": "Short 5-8 word title",
    "concern": "Specific concern in 2-3 sentences",
    "supporting_evidence": "Exact passage or data point from source that supports this",
    "source": "Which document/section this evidence came from",
    "contradiction_with_mgmt": "How this conflicts with any management claim if applicable",
    "epistemic_category": "VERIFIED_FACT|INFERENCE|HYPOTHESIS|OPEN_QUESTION",
    "confidence_score": 1,
    "severity": "HIGH|MEDIUM|LOW",
    "requires_human_review": true,
    "human_review_note": "Specifically what a human analyst should verify"
  }
]

Identify 5-10 flags. Be specific. Frame weak findings as HYPOTHESIS. Never allege fraud directly.` }],
      "You are a forensic short-seller analyst. Be specific and evidence-based. Only use what is in the source material. Return only valid JSON array."
    );

    let redFlags = [];
    try { redFlags = JSON.parse(stripJson(redFlagsRaw)); } catch { redFlags = []; }

    // ── Stage 3: Contradictions ──────────────────────────────────────────────
    setStage(3);
    setProgress(58);

    const contradictionsRaw = await callClaude(
      apiKey,
      [{ role: "user", content: `Compare the management claims against the red flags and source material for ${companyName}. Identify specific contradictions where what management says does not match what documents, filings, or data show.

Management claims found:
${JSON.stringify(claims.slice(0, 6), null, 2)}

Red flags found:
${JSON.stringify(redFlags.slice(0, 6), null, 2)}

Original source:
${sourceText.slice(0, 4000)}

Return ONLY a JSON array of contradictions:
[
  {
    "contradiction_id": "cx001",
    "management_claim": "What management claimed",
    "observable_evidence": "What the documents or data actually show",
    "discrepancy_explanation": "Why this is a meaningful discrepancy in 2-3 sentences",
    "significance": "MATERIAL|NOTABLE|MINOR",
    "source_of_evidence": "Specific document or filing reference"
  }
]

Find 3-6 contradictions. Only use what is in the provided material.` }],
      "You are a forensic researcher identifying contradictions. Be precise. Only use provided source material. Return only valid JSON array."
    );

    let contradictions = [];
    try { contradictions = JSON.parse(stripJson(contradictionsRaw)); } catch { contradictions = []; }

    // ── Stage 4: Thesis ──────────────────────────────────────────────────────
    setStage(4);
    setProgress(72);

    const thesis = await callClaude(
      apiKey,
      [{ role: "user", content: `Write the core concern thesis for an investigative report on ${companyName}.

Top red flags: ${JSON.stringify(redFlags.slice(0, 4))}
Key contradictions: ${JSON.stringify(contradictions.slice(0, 3))}
Company context: ${JSON.stringify(companyInfo)}

Write exactly 3 paragraphs:
1. Why this company warrants scrutiny based on the evidence
2. The central structural concern and how the issues connect to each other
3. The potential downside scenario and who bears the risk

Rules:
- Use language like "appears to", "the evidence suggests", "raises the question whether"
- Do NOT allege fraud or make defamatory claims
- Be analytically precise, not sensational
- Style like Muddy Waters Research notes
- ~200-250 words total

Return ONLY the thesis text, no JSON, no headers.` }],
      "You are a senior short-seller analyst. Write a precise, analytical, evidence-led concern thesis. Never make defamatory claims."
    );

    // ── Stage 5: Full report ─────────────────────────────────────────────────
    setStage(5);
    setProgress(86);

    const reportRaw = await callClaude(
      apiKey,
      [{ role: "user", content: `Write a complete investigative report for ${companyName} based on this analysis.

Company info: ${JSON.stringify(companyInfo)}
Red flags: ${JSON.stringify(redFlags)}
Contradictions: ${JSON.stringify(contradictions)}
Management claims: ${JSON.stringify(claims)}
Core thesis: ${thesis}

Write all sections. Return ONLY this JSON:
{
  "why_scrutiny": "2-3 paragraphs explaining why this company warrants closer examination. Reference specific evidence.",
  "management_vs_reality": [
    {
      "claim": "What management stated",
      "counterpoint": "What the evidence shows instead",
      "source": "Document or filing reference"
    }
  ],
  "questions_for_management": [
    "Specific question 1 that management has not answered?",
    "Specific question 2?"
  ],
  "risks_to_investors": "2 paragraphs on specific risk exposure for investors or creditors based on the findings",
  "conclusion": "2-paragraph cautionary conclusion framing the overall picture"
}

Be specific and evidence-led. No defamatory language. Frame weak claims as hypotheses.` }],
      "You are writing an investigative financial research report. Be precise and evidence-based. Return only valid JSON."
    );

    let reportSections;
    try {
      reportSections = JSON.parse(stripJson(reportRaw));
    } catch {
      reportSections = {
        why_scrutiny: "See red flags section for detailed findings.",
        management_vs_reality: [],
        questions_for_management: [],
        risks_to_investors: "See findings section.",
        conclusion: "This company warrants further investigation based on the findings above.",
      };
    }

    // ── Done ─────────────────────────────────────────────────────────────────
    // FIX: was setStage(6) which is out of bounds for a 6-item array (indices 0–5).
    // Setting progress to 100 and leaving stage at 5 correctly shows all stages complete.
    setProgress(100);

    setReport({
      generated_at: new Date().toISOString(),
      company_info: companyInfo,
      core_thesis: thesis,
      red_flags: redFlags,
      contradictions,
      management_claims: claims,   // FIX: was extracted but never surfaced in UI — now passed through and rendered
      report_sections: reportSections,
    });

  } catch (err) {
    setError(err.message || "Something went wrong. Check your API key and try again.");
  }
}

// ─── Small UI components ───────────────────────────────────────────────────────

function EpistemicBadge({ category }) {
  const c = EPISTEMIC_COLORS[category] || EPISTEMIC_COLORS.HYPOTHESIS;
  return (
    <span style={{ display: "inline-block", fontSize: 10, fontWeight: 500, padding: "2px 8px", borderRadius: 4, background: c.bg, color: c.text, border: `0.5px solid ${c.border}`, letterSpacing: "0.03em", textTransform: "uppercase" }}>
      {c.label}
    </span>
  );
}

function SeverityBadge({ severity }) {
  const c = SEVERITY_COLORS[severity] || SEVERITY_COLORS.LOW;
  return (
    <span style={{ display: "inline-block", fontSize: 10, fontWeight: 500, padding: "2px 8px", borderRadius: 4, background: c.bg, color: c.text, border: `0.5px solid ${c.border}`, letterSpacing: "0.03em", textTransform: "uppercase" }}>
      {severity}
    </span>
  );
}

function ClaimTypeBadge({ type }) {
  const c = CLAIM_TYPE_COLORS[type] || CLAIM_TYPE_COLORS.other;
  return (
    <span style={{ display: "inline-block", fontSize: 10, fontWeight: 500, padding: "2px 8px", borderRadius: 4, background: c.bg, color: c.text, border: `0.5px solid ${c.border}`, letterSpacing: "0.03em", textTransform: "uppercase" }}>
      {type}
    </span>
  );
}

function ConfidenceDots({ score }) {
  return (
    <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: i <= score ? "#378ADD" : "var(--color-border-tertiary)" }} />
      ))}
    </span>
  );
}

// ─── RedFlagCard ───────────────────────────────────────────────────────────────

function RedFlagCard({ flag, index }) {
  const [expanded, setExpanded] = useState(false);
  const leftColor = flag.severity === "HIGH" ? "#E24B4A" : flag.severity === "MEDIUM" ? "#EF9F27" : "#378ADD";
  return (
    <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderLeft: `3px solid ${leftColor}`, borderRadius: "var(--border-radius-lg)", padding: "1rem 1.25rem", marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "var(--color-text-secondary)", fontFamily: "monospace" }}>RF-{String(index+1).padStart(2,"0")}</span>
          <SeverityBadge severity={flag.severity} />
          <EpistemicBadge category={flag.epistemic_category} />
        </div>
        <ConfidenceDots score={flag.confidence_score} />
      </div>
      <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 6px", color: "var(--color-text-primary)" }}>{flag.title}</p>
      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 8px", lineHeight: 1.6 }}>{flag.concern}</p>
      {flag.supporting_evidence && (
        <button onClick={() => setExpanded(!expanded)} style={{ fontSize: 12, color: "#378ADD", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          {expanded ? "Hide evidence ↑" : "Show evidence ↓"}
        </button>
      )}
      {expanded && (
        <div style={{ marginTop: 8, padding: "10px 12px", background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
          <strong style={{ color: "var(--color-text-primary)" }}>Evidence:</strong> {flag.supporting_evidence}
          {flag.source && <div style={{ marginTop: 4, color: "#185FA5" }}>Source: {flag.source}</div>}
          {flag.contradiction_with_mgmt && (
            <div style={{ marginTop: 6, padding: "6px 10px", background: "#FCEBEB", borderRadius: "var(--border-radius-md)", color: "#A32D2D", fontSize: 11 }}>
              Conflicts with management: {flag.contradiction_with_mgmt}
            </div>
          )}
          {flag.requires_human_review && (
            <div style={{ marginTop: 6, padding: "6px 10px", background: "#FAEEDA", borderRadius: "var(--border-radius-md)", color: "#854F0B", fontSize: 11 }}>
              ⚠ Human review required: {flag.human_review_note}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── PipelineProgress ──────────────────────────────────────────────────────────

function PipelineProgress({ stage, progress }) {
  const done = progress === 100;
  return (
    <div style={{ padding: "1.5rem 0" }}>
      <div style={{ height: 3, background: "var(--color-background-secondary)", borderRadius: 2, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ height: "100%", width: `${progress}%`, background: "#E24B4A", borderRadius: 2, transition: "width 0.6s ease" }} />
      </div>
      {STAGES.map((s, i) => {
        // FIX: when done, show all stages as completed (green ✓)
        const isComplete = done || i < stage;
        const isActive   = !done && i === stage;
        return (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "7px 0", opacity: (!done && i > stage) ? 0.3 : 1 }}>
            <div style={{
              width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
              background: isComplete ? "#EAF3DE" : isActive ? "#FCEBEB" : "var(--color-background-secondary)",
              border: `0.5px solid ${isComplete ? "#639922" : isActive ? "#E24B4A" : "var(--color-border-tertiary)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {isComplete
                ? <span style={{ fontSize: 12, color: "#3B6D11" }}>✓</span>
                : <i className={`ti ${s.icon}`} style={{ fontSize: 12, color: isActive ? "#A32D2D" : "var(--color-text-secondary)" }} aria-hidden="true" />
              }
            </div>
            <span style={{ fontSize: 13, color: isActive ? "var(--color-text-primary)" : "var(--color-text-secondary)", fontWeight: isActive ? 500 : 400 }}>
              {s.label}
              {isActive && <span style={{ marginLeft: 8, fontSize: 11, color: "#A32D2D" }}>● running</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── ReportView ────────────────────────────────────────────────────────────────

function ReportView({ report, onReset }) {
  const { company_info: co, core_thesis, red_flags, contradictions, management_claims, report_sections: rs } = report;
  const [activeSection, setActiveSection] = useState("snapshot");

  // FIX: added "claims" tab — management_claims were extracted in the pipeline but never displayed
  const sections = [
    { id: "snapshot",      label: "Snapshot",                            icon: "ti-building" },
    { id: "thesis",        label: "Core thesis",                         icon: "ti-target" },
    { id: "redflags",      label: `Red flags (${red_flags.length})`,     icon: "ti-alert-triangle" },
    { id: "claims",        label: `Claims (${(management_claims||[]).length})`, icon: "ti-quote" },
    { id: "contradictions",label: "Contradictions",                      icon: "ti-arrows-diff" },
    { id: "mgmtvreality",  label: "Mgmt vs reality",                     icon: "ti-scale" },
    { id: "questions",     label: "Questions",                           icon: "ti-help" },
    { id: "risks",         label: "Risks",                               icon: "ti-shield-exclamation" },
    { id: "conclusion",    label: "Conclusion",                          icon: "ti-flag" },
  ];

  const highFlags      = red_flags.filter(f => f.severity === "HIGH").length;
  const requiresReview = red_flags.filter(f => f.requires_human_review).length;

  return (
    <div style={{ fontFamily: "var(--font-sans)" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "0.5px solid var(--color-border-tertiary)", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, background: "#FCEBEB", border: "0.5px solid #E24B4A", borderRadius: "var(--border-radius-md)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <i className="ti ti-alert-octagon" style={{ fontSize: 18, color: "#A32D2D" }} aria-hidden="true" />
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 500, fontSize: 16, color: "var(--color-text-primary)" }}>
              {co.company_name}{co.ticker && co.ticker !== "N/A" ? ` (${co.ticker})` : ""}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)" }}>
              Investigative report · {new Date(report.generated_at).toLocaleDateString()}
            </p>
          </div>
        </div>
        <button onClick={onReset} style={{ fontSize: 12, padding: "6px 12px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>
          ↺ New report
        </button>
      </div>

      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Red flags",      value: red_flags.length,           color: "#A32D2D" },
          { label: "High severity",  value: highFlags,                  color: "#A32D2D" },
          { label: "Contradictions", value: contradictions.length,      color: "#993C1D" },
          { label: "Mgmt claims",    value: (management_claims||[]).length, color: "#185FA5" },
          { label: "Needs review",   value: requiresReview,             color: "#185FA5" },
        ].map(m => (
          <div key={m.label} style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "10px 14px" }}>
            <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)" }}>{m.label}</p>
            <p style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 500, color: m.color }}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 2, overflowX: "auto", marginBottom: 20, borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
        {sections.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)} style={{ padding: "8px 10px", fontSize: 12, fontWeight: activeSection === s.id ? 500 : 400, border: "none", borderBottom: activeSection === s.id ? "2px solid #E24B4A" : "2px solid transparent", background: "transparent", cursor: "pointer", color: activeSection === s.id ? "var(--color-text-primary)" : "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
            <i className={`ti ${s.icon}`} style={{ fontSize: 12, marginRight: 4 }} aria-hidden="true" />{s.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ minHeight: 300 }}>

        {/* ── Snapshot ── */}
        {activeSection === "snapshot" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              {[["Company", co.company_name], ["Ticker", co.ticker], ["Sector", co.sector], ["CEO", co.ceo], ["CFO", co.cfo], ["Auditor", co.auditor], ["Exchange", co.exchange], ["Revenue", co.revenue], ["Market cap", co.market_cap], ["Fiscal year end", co.fiscal_year_end]].map(([k,v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "0.5px solid var(--color-border-tertiary)", fontSize: 13 }}>
                  <span style={{ color: "var(--color-text-secondary)" }}>{k}</span>
                  <span style={{ fontWeight: 500, color: "var(--color-text-primary)", textAlign: "right", maxWidth: "60%" }}>{v || "N/A"}</span>
                </div>
              ))}
            </div>
            <div style={{ padding: "12px 16px", background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-lg)", fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.7, marginBottom: 16 }}>
              {co.description}
            </div>
            {co.short_interest_note && (
              <div style={{ padding: "8px 12px", background: "#FAEEDA", border: "0.5px solid #EF9F27", borderRadius: "var(--border-radius-md)", fontSize: 12, color: "#854F0B", marginBottom: 12 }}>
                Short interest: {co.short_interest_note}
              </div>
            )}
            {co.key_filing_notes?.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <p style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 6, textTransform: "uppercase" }}>Key filing notes</p>
                {co.key_filing_notes.map((n,i) => (
                  <div key={i} style={{ padding: "6px 10px", borderLeft: "3px solid #378ADD", marginBottom: 5, fontSize: 13, color: "var(--color-text-secondary)" }}>{n}</div>
                ))}
              </div>
            )}
            {co.recent_controversies?.length > 0 && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 6, textTransform: "uppercase" }}>Recent controversies</p>
                {co.recent_controversies.map((c,i) => (
                  <div key={i} style={{ padding: "8px 12px", borderLeft: "3px solid #E24B4A", marginBottom: 6, fontSize: 13, color: "var(--color-text-secondary)" }}>{c}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Core thesis ── */}
        {activeSection === "thesis" && (
          <div>
            <div style={{ padding: "16px 20px", background: "#FCEBEB", border: "0.5px solid #E24B4A", borderLeft: "4px solid #E24B4A", borderRadius: "var(--border-radius-lg)", marginBottom: 16 }}>
              <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 500, color: "#A32D2D", textTransform: "uppercase", letterSpacing: "0.05em" }}>Core concern thesis</p>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8, color: "#501313", whiteSpace: "pre-line" }}>{core_thesis}</p>
            </div>
            {rs.why_scrutiny && (
              <div style={{ padding: "14px 16px", background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-lg)", fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.7, marginBottom: 16, whiteSpace: "pre-line" }}>
                {rs.why_scrutiny}
              </div>
            )}
            <div style={{ padding: "10px 14px", background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-lg)", fontSize: 12, color: "var(--color-text-secondary)" }}>
              This thesis represents analytical inference based on provided source materials only. It is not investment advice or a definitive factual determination. Human review is required before acting on any findings.
            </div>
          </div>
        )}

        {/* ── Red flags ── */}
        {activeSection === "redflags" && (
          <div>
            {red_flags.length === 0
              ? <p style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>No red flags identified in source material.</p>
              : red_flags.map((flag, i) => <RedFlagCard key={flag.flag_id || i} flag={flag} index={i} />)
            }
          </div>
        )}

        {/* ── Management claims (FIX: new tab) ── */}
        {activeSection === "claims" && (
          <div>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 16 }}>
              All specific claims found in the source material attributed to management or the company. Quantitative claims are marked with a <strong style={{ color: "#3B6D11" }}>Q</strong>.
            </p>
            {(!management_claims || management_claims.length === 0)
              ? <p style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>No management claims extracted from source material.</p>
              : management_claims.map((c, i) => (
                <div key={c.claim_id || i} style={{ marginBottom: 10, padding: "12px 14px", background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: "var(--color-text-secondary)", fontFamily: "monospace" }}>
                      {c.claim_id || `C-${String(i+1).padStart(2,"0")}`}
                    </span>
                    <ClaimTypeBadge type={c.claim_type || "other"} />
                    {c.quantitative && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: "#EAF3DE", color: "#3B6D11", border: "0.5px solid #639922" }}>Q</span>
                    )}
                    <span style={{ fontSize: 12, color: "var(--color-text-secondary)", marginLeft: "auto" }}>{c.speaker || "Company"}</span>
                  </div>
                  <p style={{ margin: "0 0 6px", fontSize: 13, color: "var(--color-text-primary)", lineHeight: 1.6 }}>{c.claim}</p>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                    {c.source && (
                      <span style={{ fontSize: 11, color: "#185FA5" }}>Source: {c.source}</span>
                    )}
                    {c.hedging_language && c.hedging_language !== "none" && c.hedging_language !== "None" && (
                      <span style={{ fontSize: 11, color: "#854F0B" }}>Hedge: "{c.hedging_language}"</span>
                    )}
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {/* ── Contradictions ── */}
        {activeSection === "contradictions" && (
          <div>
            {contradictions.length === 0
              ? <p style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>No contradictions identified in source material.</p>
              : contradictions.map((c,i) => (
                <div key={c.contradiction_id || i} style={{ marginBottom: 14, background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", overflow: "hidden" }}>
                  <div style={{ padding: "8px 14px", background: c.significance === "MATERIAL" ? "#FCEBEB" : c.significance === "NOTABLE" ? "#FAEEDA" : "var(--color-background-secondary)", borderBottom: "0.5px solid var(--color-border-tertiary)", display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11, fontFamily: "monospace", color: "var(--color-text-secondary)" }}>CX-{String(i+1).padStart(2,"0")}</span>
                    <span style={{ fontSize: 10, fontWeight: 500, padding: "2px 8px", borderRadius: 4, background: c.significance === "MATERIAL" ? "#FCEBEB" : "#FAEEDA", color: c.significance === "MATERIAL" ? "#A32D2D" : "#854F0B", textTransform: "uppercase" }}>{c.significance}</span>
                  </div>
                  <div style={{ padding: "12px 14px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase" }}>Management claimed</p>
                        <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-primary)", lineHeight: 1.6 }}>{c.management_claim}</p>
                      </div>
                      <div>
                        <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 500, color: "#A32D2D", textTransform: "uppercase" }}>Evidence shows</p>
                        <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-primary)", lineHeight: 1.6 }}>{c.observable_evidence}</p>
                      </div>
                    </div>
                    {c.discrepancy_explanation && (
                      <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--color-text-secondary)", padding: "8px 12px", background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", lineHeight: 1.6 }}>{c.discrepancy_explanation}</p>
                    )}
                    {c.source_of_evidence && (
                      <p style={{ margin: "6px 0 0", fontSize: 11, color: "#185FA5" }}>Evidence from: {c.source_of_evidence}</p>
                    )}
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {/* ── Mgmt vs reality ── */}
        {activeSection === "mgmtvreality" && (
          <div>
            {(!rs.management_vs_reality || rs.management_vs_reality.length === 0)
              ? <p style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>See contradictions section for detailed comparisons.</p>
              : rs.management_vs_reality.map((m,i) => (
                <div key={i} style={{ marginBottom: 12, padding: "12px 16px", background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)" }}>
                  <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--color-text-secondary)", fontStyle: "italic" }}>"{m.claim}"</p>
                  <p style={{ margin: "0 0 6px", fontSize: 13, color: "var(--color-text-primary)", borderLeft: "3px solid #E24B4A", paddingLeft: 10, lineHeight: 1.6 }}>{m.counterpoint}</p>
                  {m.source && <p style={{ margin: 0, fontSize: 11, color: "#185FA5" }}>Source: {m.source}</p>}
                </div>
              ))
            }
          </div>
        )}

        {/* ── Questions for management ── */}
        {activeSection === "questions" && (
          <div>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 16 }}>The following questions require management response or independent verification:</p>
            {(rs.questions_for_management || []).length === 0
              ? <p style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>No questions generated.</p>
              : (rs.questions_for_management || []).map((q,i) => (
                <div key={i} style={{ padding: "10px 14px", marginBottom: 8, background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", fontSize: 13, color: "var(--color-text-primary)", display: "flex", gap: 10 }}>
                  <span style={{ fontFamily: "monospace", fontSize: 11, color: "#378ADD", minWidth: 24, paddingTop: 2 }}>Q{i+1}</span>
                  <span style={{ lineHeight: 1.6 }}>{q}</span>
                </div>
              ))
            }
          </div>
        )}

        {/* ── Risks ── */}
        {activeSection === "risks" && (
          <div>
            <div style={{ padding: "16px 20px", background: "#FAEEDA", border: "0.5px solid #EF9F27", borderLeft: "4px solid #EF9F27", borderRadius: "var(--border-radius-lg)", marginBottom: 16, fontSize: 14, color: "#633806", lineHeight: 1.8, whiteSpace: "pre-line" }}>
              {rs.risks_to_investors}
            </div>
            <div style={{ padding: "10px 14px", background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", fontSize: 12, color: "var(--color-text-secondary)" }}>
              Disclaimer: This report is for research assistance only. It does not constitute investment advice or a recommendation to buy or sell securities. All findings should be independently verified.
            </div>
          </div>
        )}

        {/* ── Conclusion ── */}
        {activeSection === "conclusion" && (
          <div>
            <div style={{ padding: "16px 20px", background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)", borderLeft: "4px solid #E24B4A", borderRadius: "var(--border-radius-lg)", marginBottom: 16, fontSize: 14, color: "var(--color-text-primary)", lineHeight: 1.8, whiteSpace: "pre-line" }}>
              {rs.conclusion}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {[
                { label: "Total red flags",  value: red_flags.length },
                { label: "High severity",    value: highFlags },
                { label: "Need human review",value: requiresReview },
              ].map(m => (
                <div key={m.label} style={{ padding: "12px 14px", background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", textAlign: "center" }}>
                  <p style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 500, color: "#A32D2D" }}>{m.value}</p>
                  <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-secondary)" }}>{m.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [apiKey, setApiKey] = useState("");
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [ticker, setTicker] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState(0);
  const [progress, setProgress] = useState(0);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  // FIX: tightened API key validation to require "sk-ant-" prefix
  const keyIsValid = apiKey.startsWith("sk-ant-");

  const handleRun = useCallback(async () => {
    if (!companyName.trim() || !sourceText.trim() || !apiKey.trim()) return;
    setRunning(true);
    setError(null);
    setReport(null);
    setStage(0);
    setProgress(0);
    await runPipeline(
      apiKey.trim(),
      companyName.trim(),
      ticker.trim().toUpperCase(),
      sourceText.trim(),
      setStage,
      setProgress,
      (r) => { setReport(r); setRunning(false); },
      (e) => { setError(e); setRunning(false); }
    );
  }, [apiKey, companyName, ticker, sourceText]);

  const canRun = apiKeySaved && companyName.trim() && sourceText.trim();

  // FIX: word count displays "< 1 min" instead of "0 min" for short texts
  const wordCount = sourceText.split(/\s+/).filter(Boolean).length;
  const readMins  = Math.round(wordCount / 750);
  const readLabel = readMins < 1 ? "< 1 min read" : `${readMins} min read`;

  if (report) {
    return (
      <ReportView
        report={report}
        onReset={() => { setReport(null); setCompanyName(""); setTicker(""); setSourceText(""); }}
      />
    );
  }

  return (
    <div style={{ fontFamily: "var(--font-sans)", maxWidth: 620, margin: "0 auto", paddingTop: "1.5rem" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <div style={{ width: 32, height: 32, background: "#FCEBEB", border: "0.5px solid #E24B4A", borderRadius: "var(--border-radius-md)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <i className="ti ti-search" style={{ fontSize: 16, color: "#A32D2D" }} aria-hidden="true" />
        </div>
        <span style={{ fontSize: 18, fontWeight: 500, color: "var(--color-text-primary)" }}>Investigative report generator</span>
      </div>
      <p style={{ margin: "0 0 24px", fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
        Paste any news article, SEC filing text, earnings transcript, or research note — the AI generates a Muddy Waters-style forensic report from your sources.
      </p>

      {/* Step 1: API Key */}
      <div style={{ marginBottom: 20, padding: "14px 16px", background: apiKeySaved ? "#EAF3DE" : "var(--color-background-secondary)", border: `0.5px solid ${apiKeySaved ? "#639922" : "var(--color-border-tertiary)"}`, borderRadius: "var(--border-radius-lg)" }}>
        <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Step 1 — Anthropic API key
        </p>
        {!apiKeySaved ? (
          <>
            <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--color-text-secondary)" }}>
              Get your key at <strong>console.anthropic.com</strong> → API Keys → Create Key
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="sk-ant-..."
                style={{ flex: 1, fontFamily: "monospace", fontSize: 13 }}
              />
              <button
                onClick={() => { if (keyIsValid) setApiKeySaved(true); }}
                disabled={!keyIsValid}
                style={{ padding: "0 16px", fontSize: 13, background: keyIsValid ? "#EAF3DE" : "var(--color-background-secondary)", border: `0.5px solid ${keyIsValid ? "#639922" : "var(--color-border-tertiary)"}`, color: keyIsValid ? "#3B6D11" : "var(--color-text-secondary)", borderRadius: "var(--border-radius-md)", cursor: keyIsValid ? "pointer" : "not-allowed" }}>
                Save key
              </button>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#3B6D11" }}>✓ API key saved — {apiKey.slice(0,14)}...</span>
            <button onClick={() => { setApiKeySaved(false); setApiKey(""); }} style={{ fontSize: 12, color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer" }}>Change</button>
          </div>
        )}
      </div>

      {/* Step 2: Company info */}
      <div style={{ marginBottom: 16 }}>
        <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Step 2 — Company details
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>Company name *</label>
            <input
              type="text"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              placeholder="e.g. SoFi Technologies"
              style={{ width: "100%", fontSize: 13, boxSizing: "border-box" }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>Ticker (optional)</label>
            <input
              type="text"
              value={ticker}
              onChange={e => setTicker(e.target.value.toUpperCase())}
              placeholder="e.g. SOFI"
              style={{ width: "100%", fontSize: 13, fontFamily: "monospace", boxSizing: "border-box" }}
            />
          </div>
        </div>
      </div>

      {/* Step 3: Source material */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Step 3 — Paste your source material *
        </p>
        <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--color-text-secondary)" }}>
          Paste any combination of: news articles · earnings transcripts · SEC filing text · annual report excerpts · short reports · press releases · analyst notes
        </p>
        <textarea
          value={sourceText}
          onChange={e => setSourceText(e.target.value)}
          placeholder={`Paste your research material here. For example:

— Copy and paste a news article about the company
— Paste text from an SEC filing or 10-K
— Paste an earnings call transcript
— Paste a short seller report
— Paste multiple sources together

The more text you provide, the deeper the analysis.`}
          rows={12}
          style={{ width: "100%", fontSize: 13, lineHeight: 1.6, resize: "vertical", boxSizing: "border-box", fontFamily: "var(--font-sans)" }}
        />
        <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--color-text-secondary)" }}>
          {sourceText.length.toLocaleString()} characters · {readLabel}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: "10px 14px", background: "#FCEBEB", border: "0.5px solid #E24B4A", borderRadius: "var(--border-radius-md)", fontSize: 13, color: "#A32D2D", marginBottom: 16 }}>
          ⚠ {error}
        </div>
      )}

      {/* Run button */}
      {!running && (
        <button
          onClick={handleRun}
          disabled={!canRun}
          style={{
            width: "100%", padding: "12px", fontSize: 14, fontWeight: 500,
            background: canRun ? "#FCEBEB" : "var(--color-background-secondary)",
            border: `0.5px solid ${canRun ? "#E24B4A" : "var(--color-border-tertiary)"}`,
            color: canRun ? "#A32D2D" : "var(--color-text-secondary)",
            borderRadius: "var(--border-radius-lg)",
            cursor: canRun ? "pointer" : "not-allowed",
          }}
        >
          Generate investigative report ↗
        </button>
      )}

      {/* Pipeline progress */}
      {running && <PipelineProgress stage={stage} progress={progress} />}

      {/* Footer note */}
      {!running && (
        <p style={{ marginTop: 16, fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
          For research assistance only · Not investment advice · All findings require human verification · Epistemic labels distinguish facts from inferences and hypotheses
        </p>
      )}
    </div>
  );
}
