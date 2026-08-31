window.onDealReconAIResult = function(text) {
    if (window.aiDealMode) {
        const box = document.getElementById("aiDealResult");
        if (box) box.innerText = text;
        window.aiDealMode = false;
    } else {
        alert("Deal Recon AI:\n\n" + text);
    }
};

window.onDealReconAIError = function(message) {
    if (window.aiDealMode) {
        const box = document.getElementById("aiDealResult");
        if (box) box.innerText = "AI Error:\n\n" + message;
        window.aiDealMode = false;
    } else {
        alert("AI Error:\n\n" + message);
    }
};

window.testDealReconAI = function() {
    if (window.DealReconAI) {
        DealReconAI.ask("Reply with exactly: Deal Recon AI is working.");
    } else {
        alert("Deal Recon AI bridge is not available.");
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
    if (box) box.innerText = "Analyzing deal...";

    window.aiDealMode = true;

    if (window.DealReconAI) {
        DealReconAI.ask(prompt);
    } else {
        if (box) box.innerText = "Deal Recon AI bridge is not available.";
    }
};

