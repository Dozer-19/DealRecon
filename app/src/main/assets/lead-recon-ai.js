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
    const source = window.getFreeLeadSourceInfo ? window.getFreeLeadSourceInfo(area) : null;
    box.innerHTML = "<strong>Searching NJ public records...</strong>";
    const rawArea = area.trim();
    const safeArea = rawArea.replace(/'/g, "''").toUpperCase();
    let whereClause;

    if (/^\d{5}(-\d{4})?$/.test(rawArea)) {
        const zip5 = rawArea.substring(0, 5);
        whereClause = "(ZIP_CODE LIKE '" + zip5 + "%' OR ZIP5='" + zip5 + "')";
    } else if (/\bCOUNTY\b/i.test(rawArea)) {
        const countyName = safeArea
            .replace(/,?\s*NEW JERSEY$/i, "")
            .replace(/,?\s*NJ$/i, "")
            .replace(/\s+COUNTY$/i, "")
            .trim();
        whereClause = "COUNTY='" + countyName + "'";
    } else {
        const municipality = safeArea
            .replace(/,?\s*NEW JERSEY$/i, "")
            .replace(/,?\s*NJ$/i, "")
            .trim();
        whereClause = "MUN_NAME LIKE '" + municipality + "%'";
    }
    if (propertyType === "Single Family") {
        whereClause += " AND PROP_CLASS='2' AND (DWELL IS NULL OR DWELL <= 1)";
    } else if (propertyType === "2-4 Units") {
        whereClause += " AND PROP_CLASS='2' AND DWELL BETWEEN 2 AND 4";
    } else if (propertyType === "5-20 Units") {
        whereClause += " AND PROP_CLASS='4C' AND (COMM_DWELL BETWEEN 5 AND 20 OR DWELL BETWEEN 5 AND 20)";
    } else if (propertyType === "Mixed Use") {
        whereClause += " AND PROP_CLASS='4A' AND (COMM_DWELL >= 1 OR DWELL >= 1)";
    } else if (leadType === "Multifamily Owner") {
        whereClause += " AND ((PROP_CLASS='2' AND DWELL BETWEEN 2 AND 4) OR PROP_CLASS='4C' OR COMM_DWELL >= 2)";
    }
    window.searchNJParcels(whereClause)
        .then(data => {
            let candidates = window.buildNJCandidates(data);

            if (leadType === "Absentee Owner") {
                candidates = candidates.filter(c => c.absentee === "Yes");
            } else if (leadType === "Long-Term Owner") {
                candidates = candidates.filter(c => Number(c.yearsOwned || 0) >= 10);
            } else if (leadType === "High Equity") {
                candidates = candidates.filter(c =>
                    c.equitySignal === "Strong" ||
                    c.equitySignal === "Possible"
                );
            } else if (leadType === "Tired Landlord") {
                candidates = candidates.filter(c =>
                    c.multifamily === true &&
                    c.absentee === "Yes" &&
                    Number(c.yearsOwned || 0) >= 10
                );
            } else if (leadType === "Multifamily Owner") {
                candidates = candidates.filter(c => c.multifamily === true);
            }

            window.leadReconFinderResults = candidates;
            window.leadReconFinderVisible = Math.min(25, candidates.length);
            window.leadReconFinderLeadType = leadType;
            window.renderLeadReconFinderResults();
        })
        .catch(err => {
            box.innerHTML = "<strong>Search failed.</strong><br><br>" + err.message;
        });
};


window.renderLeadReconFinderResults = function() {
    const box = document.getElementById("leadFinderSearchResult");
    if (!box) return;

    const results = Array.isArray(window.leadReconFinderResults) ? window.leadReconFinderResults : [];
    const visible = Math.min(window.leadReconFinderVisible || 25, results.length);
    const shown = results.slice(0, visible);

    const cards = shown.map(window.renderNJCandidate).join("");

    const loadMore = visible < results.length
        ? '<button class="btn alt" onclick="loadMoreLeadReconResults()">Load More</button> '
        : '';

    const saveButton = shown.length
        ? '<button class="btn" onclick="saveShownLeadReconResults()">Save Shown Leads</button> '
        : '';

    const exportButton = results.length
        ? '<button class="btn alt" onclick="exportLeadReconResultsCSV()">Export CSV</button>'
        : '';

    box.innerHTML =
        "<strong>Found " + results.length + " candidates.</strong><br>" +
        "Showing " + visible + " of " + results.length + "<br><br>" +
        '<div class="actions">' + loadMore + saveButton + exportButton + '</div>' +
        cards;
};

window.loadMoreLeadReconResults = function() {
    const results = Array.isArray(window.leadReconFinderResults) ? window.leadReconFinderResults : [];
    window.leadReconFinderVisible = Math.min((window.leadReconFinderVisible || 25) + 25, results.length);
    window.renderLeadReconFinderResults();
};


window.saveLeadReconCandidate = function(encodedParcelId) {
    const parcelId = decodeURIComponent(encodedParcelId || "");
    const results = Array.isArray(window.leadReconFinderResults) ? window.leadReconFinderResults : [];
    const c = results.find(x => String(x.parcelId || "") === String(parcelId));

    if (!c) {
        alert("Lead could not be found.");
        return;
    }

    const leads = get("leads");

    const normalizeProp = v => String(v || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");

    const duplicate = leads.some(x => {
        const sameParcel =
            String(x.parcelId || "").trim() &&
            String(c.parcelId || "").trim() &&
            String(x.parcelId || "").trim() === String(c.parcelId || "").trim();

        const sameAddress =
            normalizeProp(x.prop) &&
            normalizeProp(c.propertyAddress) &&
            normalizeProp(x.prop) === normalizeProp(c.propertyAddress);

        return sameParcel || sameAddress;
    });

    if (duplicate) {
        alert("This property is already saved in Lead Recon.");
        return;
    }

    const lead = {
        id: Date.now() + Math.random(),
        dealId: null,
        parcelId: c.parcelId || "",
        name: c.ownerName || "",
        prop: c.propertyAddress || "",
        phone: "",
        email: "",
        type: window.leadReconFinderLeadType || (c.multifamily ? "Multifamily Owner" : "Other"),
        source: "NJ Public Property Data",
        status: "New",
        yearsOwned: Number(c.yearsOwned || 0),
        equity: 0,
        absentee: c.absentee || "Unknown",
        distress: "Unknown",
        listingSignal: "Unknown",
        dnc: "Unknown",
        equitySignal: c.equitySignal || "None",
        multifamily: c.multifamily === true,
        multifamilyConfidence: c.multifamilyConfidence || "None",
        finderScore: Number(c.score || 0)
    };

    lead.score = Math.max(
        leadReconScore(lead),
        Number(c.score || 0)
    );
    lead.scoreLabel = leadReconLabel(lead.score);

    leads.unshift(lead);
    set("leads", leads);
    renderAll();

    alert("Lead saved to Lead Recon.");
};

window.saveShownLeadReconResults = function() {
    const results = Array.isArray(window.leadReconFinderResults) ? window.leadReconFinderResults : [];
    const visible = Math.min(window.leadReconFinderVisible || 25, results.length);
    const shown = results.slice(0, visible);

    if (!shown.length) return;

    const leads = get("leads");
    const existingParcels = new Set(
        leads.map(x => String(x.parcelId || "").trim()).filter(Boolean)
    );

    const normalizeProp = v => String(v || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");

    const existingAddresses = new Set(
        leads.map(x => normalizeProp(x.prop)).filter(Boolean)
    );

    let added = 0;

    shown.forEach(c => {
        const parcelKey = String(c.parcelId || "").trim();
        const addressKey = normalizeProp(c.propertyAddress);

        if (parcelKey && existingParcels.has(parcelKey)) return;
        if (addressKey && existingAddresses.has(addressKey)) return;

        const lead = {
            id: Date.now() + Math.random(),
            dealId: null,
            parcelId: c.parcelId || "",
            name: c.ownerName || "",
            prop: c.propertyAddress || "",
            phone: "",
            email: "",
            type: window.leadReconFinderLeadType || (c.multifamily ? "Multifamily Owner" : "Other"),
            source: "NJ Public Property Data",
            status: "New",
            yearsOwned: Number(c.yearsOwned || 0),
            equity: 0,
            absentee: c.absentee || "Unknown",
            distress: "Unknown",
            listingSignal: "Unknown",
            dnc: "Unknown",
            equitySignal: c.equitySignal || "None",
            multifamily: c.multifamily === true,
            multifamilyConfidence: c.multifamilyConfidence || "None",
            finderScore: Number(c.score || 0)
        };

        lead.score = Math.max(
            leadReconScore(lead),
            Number(c.score || 0)
        );
        lead.scoreLabel = leadReconLabel(lead.score);

        leads.unshift(lead);

        if (parcelKey) existingParcels.add(parcelKey);
        if (addressKey) existingAddresses.add(addressKey);

        added++;
    });

    set("leads", leads);
    renderAll();

    const box = document.getElementById("leadFinderSearchResult");
    if (box) {
        const msg = document.createElement("div");
        msg.className = "notice";
        msg.style.margin = "10px 0";
        msg.innerHTML = "<strong>Saved " + added + " new leads to Lead Recon.</strong>";
        box.prepend(msg);
    }
};

window.exportLeadReconResultsCSV = function() {
    const results = Array.isArray(window.leadReconFinderResults) ? window.leadReconFinderResults : [];
    if (!results.length) return;

    const q = v => '"' + String(v ?? "").replace(/"/g, '""') + '"';

    const rows = [
        [
            "Parcel ID",
            "Owner Name",
            "Property Address",
            "Municipality",
            "County",
            "Mailing Address",
            "Property Class",
            "Dwelling Units",
            "Commercial Dwelling Units",
            "Years Owned",
            "Possible Absentee",
            "Assessed Value",
            "Last Year Tax",
            "Sale Price",
            "Score"
        ]
    ];

    results.forEach(c => {
        rows.push([
            c.parcelId || "",
            c.ownerName || "",
            c.propertyAddress || "",
            c.municipality || "",
            c.county || "",
            c.mailingAddress || "",
            c.propertyClass || "",
            c.dwellUnits || "",
            c.commercialDwellUnits || "",
            c.yearsOwned || "",
            c.absentee || "",
            c.assessedValue || "",
            c.lastYearTax || "",
            c.salePrice || "",
            c.score || 0
        ]);
    });

    const csv = rows.map(r => r.map(q).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "lead-recon-results-" + new Date().toISOString().slice(0,10) + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};
