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

window.aiDeedOwnerId = null;

window.startAIDeedResearch = function(ownerId) {
    window.aiDeedOwnerId = ownerId;

    const input = document.getElementById("aiDeedFile");
    if (!input) {
        alert("AI deed image picker is not available.");
        return;
    }

    input.value = "";
    input.click();
};

document.addEventListener("DOMContentLoaded", function() {
    const input = document.getElementById("aiDeedFile");
    if (!input) return;

    input.addEventListener("change", function() {
        const file = input.files && input.files[0];
        if (!file) return;

        const owners = get("owners");
        const owner = owners.find(x => x.id === window.aiDeedOwnerId);

        if (!owner) {
            alert("Owner Recon record could not be found.");
            return;
        }

        if (!window.DealReconAI || !DealReconAI.analyzeDeedImage) {
            alert("AI deed reader is not available in this build.");
            return;
        }

        const reader = new FileReader();

        reader.onload = function() {
            window.aiMode = "deed";

            const prompt = `
You are Deal Recon AI reviewing an official real-estate deed image.

Property being researched:
Address: ${owner.prop || "Unknown"}
County/Municipality: ${owner.county || "Unknown"}
Expected Deed Book: ${owner.deedBook || "Unknown"}
Expected Deed Page: ${owner.deedPage || "Unknown"}
Expected Deed Date: ${owner.deedDate || "Unknown"}
Expected Sale Price: ${owner.salePrice || "Unknown"}

Your primary job is to identify the GRANTEE — the buyer/person/entity receiving title in this deed.

Do NOT confuse the GRANTOR (seller) with the GRANTEE (buyer).

Read only what is actually visible in the deed image.
Do not invent names or facts.

Return ONLY valid JSON in exactly this structure:

{
  "ownerName": "grantee name exactly as shown",
  "grantor": "grantor name exactly as shown",
  "grantee": "grantee name exactly as shown",
  "propertyAddress": "property address if visible",
  "deedBook": "book if visible",
  "deedPage": "page if visible",
  "recordingDate": "date if visible",
  "confidence": "High, Medium, or Low",
  "notes": "brief explanation of anything uncertain"
}

If the grantee cannot be read confidently, set ownerName and grantee to an empty string.
`;

            DealReconAI.analyzeDeedImage(reader.result, prompt);
        };

        reader.onerror = function() {
            alert("Deal Recon could not read the selected image.");
        };

        reader.readAsDataURL(file);
    });
});

window.onDealReconAIResult = function(text) {
    if (window.aiMode === "deed") {
        try {
            let cleaned = String(text || "").trim();
            cleaned = cleaned.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();

            const result = JSON.parse(cleaned);

            if (!result.grantee && !result.ownerName) {
                alert(
                    "Deal Recon AI could not confidently identify the grantee.\n\n" +
                    "Confidence: " + (result.confidence || "Unknown") +
                    "\nNotes: " + (result.notes || "No additional notes.")
                );
                window.aiMode = null;
                return;
            }

            const ownerName = String(result.grantee || result.ownerName || "").trim();

            const approved = confirm(
                "Deal Recon AI found:\n\n" +
                "GRANTEE / NEW OWNER:\n" + ownerName +
                "\n\nGrantor / Seller:\n" + (result.grantor || "Not identified") +
                "\n\nConfidence: " + (result.confidence || "Unknown") +
                "\n\nSave this owner name to Owner Recon?"
            );

            if (approved) {
                let owners = get("owners");
                let i = owners.findIndex(x => x.id === window.aiDeedOwnerId);

                if (i >= 0) {
                    owners[i].name = ownerName;
                    owners[i].ownerVerified = "AI deed research";
                    owners[i].ownerVerifiedAt = new Date().toISOString();
                    owners[i].aiDeedConfidence = result.confidence || "";
                    owners[i].aiDeedGrantor = result.grantor || "";
                    owners[i].aiDeedNotes = result.notes || "";

                    set("owners", owners);

                    let leads = get("leads");

                    const norm = v => String(v || "")
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, "");

                    leads.forEach(l => {
                        const sameParcel =
                            owners[i].parcelId &&
                            String(l.parcelId || "").trim() ===
                            String(owners[i].parcelId || "").trim();

                        const sameAddress =
                            norm(l.prop) &&
                            norm(l.prop) === norm(owners[i].prop);

                        if (sameParcel || sameAddress) {
                            l.name = ownerName;
                        }
                    });

                    set("leads", leads);
                    renderAll();

                    alert("Owner name saved to Owner Recon and matching Lead Recon records.");
                }
            }
        } catch (e) {
            alert("Deal Recon AI returned a result that could not be processed.\n\n" + text);
        }

        window.aiMode = null;
        return;
    }

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
    if (window.aiMode === "deed") {
        alert("AI Deed Reader Error:\n\n" + message);
        window.aiMode = null;
        return;
    }

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

