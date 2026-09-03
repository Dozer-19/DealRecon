function formatAIResponse(text) {
  let safe = String(text || "");
  safe = safe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  safe = safe.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  safe = safe.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  safe = safe.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  safe = safe.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  safe = safe.replace(/^[-*] (.+)$/gm, "• $1");
  safe = safe.replace(/\n/g, "<br>");
  return safe;
}
window.onDealReconAIResult = function(text) {
    if (window.aiMode === "lead") {
        const box = document.getElementById("aiLeadResult");
        if (box) box.innerHTML = formatAIResponse(text);
        window.aiMode = null;
        return;
    }
    if (window.aiDealMode) {
        const box = document.getElementById("aiDealResult");
        if (box) box.innerHTML = formatAIResponse(text);
        window.aiDealMode = false;
    } else {
        alert("Deal Recon AI:\n\n" + text);
    }
};

window.onDealReconAIError = function(message) {
    if (window.aiMode === "lead") {
        const box = document.getElementById("aiLeadResult");
        if (box) box.innerText = "AI Error:\n\n" + message;
        window.aiMode = null;
        return;
    }
    if (window.aiDealMode) {
        const box = document.getElementById("aiDealResult");
        if (box) box.innerText = "AI Error:\n\n" + message;
        window.aiDealMode = false;
    } else {
        alert("AI Error:\n\n" + message);
    }
};

window.runAIDealAnalysis = function() {
    const v = id => document.getElementById(id)?.value || "";
    const t = id => document.getElementById(id)?.innerText || "";

    const prompt = `
You are Deal Recon AI, a real estate investment underwriting assistant.

Analyze this rental/multifamily deal:

Property: ${v("aName")}
Type: ${v("aType")}
Purchase Price: $${v("aPrice")}
Units: ${v("aUnits")}
Rehab: $${v("aRehab")}
Closing Costs: $${v("aClose")}

Financing:
Down Payment: ${v("aDown")}%
Interest Rate: ${v("aRate")}%
Term: ${v("aTerm")} years

Income:
Monthly Rent: $${v("aRent")}
Other Monthly Income: $${v("aOther")}
Vacancy: ${v("aVac")}%

Expenses:
Taxes: $${v("aTax")} per year
Insurance: $${v("aIns")} per year
Utilities: $${v("aUtil")} per month
Repairs: ${v("aRep")}%
Management: ${v("aMgmt")}%
CapEx: ${v("aCapex")}%

Calculated Results:
Deal Score: ${t("rScore")} ${t("rScoreLabel")}
Monthly Cash Flow: ${t("rCash")}
NOI: ${t("rNoi")}
Cap Rate: ${t("rCap")}
Cash-on-Cash Return: ${t("rCoc")}
DSCR: ${t("rDscr")}
GRM: ${t("rGrm")}
Price Per Unit: ${t("rPpu")}
Maximum Offer: ${t("rMax")}

Give a concise investor analysis with:
1. Overall verdict: BUY, NEGOTIATE, or PASS
2. Top 3 strengths
3. Top 3 risks
4. Financing/cash-flow observations
5. Rehab impact
6. Suggested offer strategy
7. What additional information should be verified before purchase

Do not invent missing facts. Clearly identify assumptions.
`;

    const box = document.getElementById("aiDealResult");
    if (box) box.innerText = "Deal Recon AI is analyzing this deal...";

    window.aiDealMode = true;

    if (window.DealReconAI) {
        DealReconAI.ask(prompt);
    } else {
        if (box) box.innerText = "Deal Recon AI bridge is not available.";
    }
};

