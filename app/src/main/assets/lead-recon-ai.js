window.runAILeadAnalysis = function() {
    const v = id => document.getElementById(id)?.value || "";
    const lead = {
        name: v("lName"),
        property: v("lProp"),
        type: v("lType"),
        source: v("lSource"),
        status: v("lStatus"),
        yearsOwned: Number(v("lYearsOwned")) || 0,
        equity: Number(v("lEquity")) || 0,
        absentee: v("lAbsentee"),
        distress: v("lDistress"),
        listingSignal: v("lListingSignal"),
        dnc: v("lDnc")
    };
    const score = typeof leadReconScore === "function" ? leadReconScore(lead) : 0;
    const label = typeof leadReconLabel === "function" ? leadReconLabel(score) : "";

    const prompt = `
You are Deal Recon AI, a real estate lead qualification assistant.

Analyze this lead using only the information provided.

Lead:
Owner / Contact: ${lead.name}
Property: ${lead.property}
Lead Type: ${lead.type}
Source: ${lead.source}
Current Status: ${lead.status}
Years Owned: ${lead.yearsOwned}
Estimated Equity: ${lead.equity}%
Absentee Owner: ${lead.absentee}
Vacant / Distress Signal: ${lead.distress}
Listing / Price Signal: ${lead.listingSignal}
DNC / Permission Note: ${lead.dnc}

Lead Recon Score: ${score}/100
Classification: ${label}

Give a concise analysis with:
1. Overall lead quality
2. Strongest motivation signals
3. Missing or uncertain information to verify
4. Best next action
5. Best outreach approach
6. One short suggested opening message
7. Whether this lead should be prioritized now, followed up later, or nurtured

Do not invent facts.
Treat estimated equity and motivation indicators as signals, not verified facts.
Do not recommend outreach that ignores DNC, consent, or applicable contact rules.
`;
    const box = document.getElementById("aiLeadResult");
    if (box) box.innerText = "Deal Recon AI is analyzing this lead...";
    window.aiMode = "lead";
    if (window.DealReconAI) {
        DealReconAI.ask(prompt);
    } else {
        if (box) box.innerText = "Deal Recon AI bridge is not available.";
        window.aiMode = null;
    }
};
window.openLeadFinder = function() {
    const box = document.getElementById("leadFinderResult");
    if (!box) return;
    box.innerHTML = `<strong>Lead Recon Finder</strong><br><br><label>Area</label><br><input id="finderArea" placeholder="City, ZIP, or County"><br><br><label>Property Type</label><br><select id="finderPropertyType"><option>Any</option><option>Single Family</option><option>2-4 Units</option><option>5-20 Units</option><option>Mixed Use</option></select><br><br><label>Lead Type</label><br><select id="finderLeadType"><option>Absentee Owner</option><option>Tired Landlord</option><option>Long-Term Owner</option><option>High Equity</option><option>Multifamily Owner</option><option>Vacant / Distress</option><option>FSBO</option><option>Expired Listing</option><option>Driving for Dollars</option></select><br><br><button class="btn" onclick="runLeadFinderSearch()">Search Free Sources</button> <label class="btn alt">Import Public Records CSV<input id="leadSourceCsv" type="file" accept=".csv" hidden onchange="importLeadSourceCSV(event)"></label><div id="leadFinderSearchResult" style="margin-top:12px"></div>`;
};
window.runLeadFinderSearch = function() {
    const area = document.getElementById("finderArea")?.value || "";
    const propertyType = document.getElementById("finderPropertyType")?.value || "Any";
    const leadType = document.getElementById("finderLeadType")?.value || "";
    const box = document.getElementById("leadFinderSearchResult");
    if (!box) return;
    if (!area.trim()) {
        box.innerHTML = "<strong>Enter a city, ZIP, or county first.</strong>";
        return;
    }
    box.innerHTML = "<strong>Search ready.</strong><br><br>Area: " + area + "<br>Property Type: " + propertyType + "<br>Lead Type: " + leadType + "<br><br>Next: connect free/public lead sources and import matching properties.";
};
