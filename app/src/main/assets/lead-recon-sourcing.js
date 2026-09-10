window.parseLeadReconCSV = function(text) {
    const rows = String(text || "").split(/\r?\n/).filter(x => x.trim());
    if (rows.length < 2) return [];
    const parseRow = row => row.match(/(".*?"|[^",]+|(?<=,)(?=,))/g)?.map(x => x.replace(/^"|"$/g, "").trim()) || [];
    const headers = parseRow(rows.shift()).map(x => x.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));
    return rows.map(row => { const values = parseRow(row); const record = {}; headers.forEach((h,i) => record[h] = values[i] || ""); return record; });
};
window.importLeadSourceCSV = function(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function() {
        const rows = window.parseLeadReconCSV(reader.result);
        const leads = get("leads");
        const selectedType = document.getElementById("finderLeadType")?.value || "Other";
        rows.forEach(r => {
            const lead = {
                id: Date.now() + Math.random(),
                dealId: null,
                name: r.owner_name || r.owner || r.name || "",
                prop: r.property_address || r.address || "",
                phone: r.phone || "",
                email: r.email || "",
                type: r.lead_type || selectedType,
                source: r.source || "Public Records CSV",
                status: "New",
                yearsOwned: Number(r.years_owned || r.yearsowned || 0),
                equity: Number(r.equity || r.estimated_equity || 0),
                absentee: r.absentee || "Unknown",
                distress: r.distress || "Unknown",
                listingSignal: r.listing_signal || "Unknown",
                dnc: r.dnc || "Unknown"
            };
            lead.score = leadReconScore(lead);
            lead.scoreLabel = leadReconLabel(lead.score);
            leads.unshift(lead);
        });
        set("leads", leads);
        renderAll();
        const box = document.getElementById("leadFinderSearchResult");
        if (box) box.innerHTML = "<strong>Imported " + rows.length + " leads.</strong>";
    };
    reader.readAsText(file);
};

window.getFreeLeadSourceInfo = function(area) {
    const a = String(area || "").toLowerCase();

    if (a.includes("nj") || a.includes("new jersey") ||
        a.includes("camden") || a.includes("gloucester") ||
        a.includes("salem") || a.includes("cumberland") ||
        a.includes("burlington") || a.includes("atlantic") ||
        a.includes("cape may") || a.includes("mercer") ||
        a.includes("ocean")) {
        return {
            name: "New Jersey Public Property Data",
            method: "Official NJ MOD-IV / parcel data",
            note: "Use official public property and assessment files, then import matching records into Lead Recon. Owner names may be restricted or redacted in some state-hosted datasets."
        };
    }

    return {
        name: "Public Records Search",
        method: "County / municipal public property records",
        note: "Lead Recon will use free public sources where available and import only data you are authorized to use."
    };
};

window.njYearsOwned = function(v) {
    const s = String(v || "").trim();
    if (!/^\d{6}$/.test(s)) return 0;
    const yy = Number(s.slice(0,2));
    const year = yy <= (new Date().getFullYear() % 100) ? 2000 + yy : 1900 + yy;
    return Math.max(0, new Date().getFullYear() - year);
};

window.NJ_PARCEL_API = "https://maps.nj.gov/arcgis/rest/services/Applications/NJ_TaxListSearch/MapServer/2/query";

window.searchNJParcels = async function(whereClause) {
    const allFeatures = [];
    const pageSize = 1000;
    let offset = 0;
    let keepGoing = true;

    while (keepGoing) {
        const params = new URLSearchParams({
            where: whereClause,
            outFields: "PAMS_PIN,OWNER_NAME,MUN_NAME,COUNTY,PROP_LOC,ST_ADDRESS,CITY_STATE,ZIP_CODE,PROP_CLASS,PROP_USE,DWELL,COMM_DWELL,NET_VALUE,LAST_YR_TX,DEED_DATE,SALE_PRICE,DEED_BOOK,DEED_PAGE",
            returnGeometry: "false",
            resultOffset: String(offset),
            resultRecordCount: String(pageSize),
            orderByFields: "PAMS_PIN ASC",
            f: "json"
        });

        const r = await fetch(window.NJ_PARCEL_API + "?" + params.toString());

        if (!r.ok) {
            throw new Error("NJ public records request failed");
        }

        const data = await r.json();

        if (data.error) {
            throw new Error(data.error.message || "NJ public records query error");
        }

        const features = Array.isArray(data.features) ? data.features : [];
        allFeatures.push(...features);

        if (features.length < pageSize || !data.exceededTransferLimit) {
            keepGoing = false;
        } else {
            offset += pageSize;
        }

        if (offset >= 10000) {
            keepGoing = false;
        }
    }

    return {
        features: allFeatures
    };
};

window.normalizeNJAddress = function(v) {
    return String(v || "")
        .toUpperCase()
        .replace(/\bSTREET\b/g, "ST")
        .replace(/\bAVENUE\b/g, "AVE")
        .replace(/\bROAD\b/g, "RD")
        .replace(/\bDRIVE\b/g, "DR")
        .replace(/\bLANE\b/g, "LN")
        .replace(/\bCOURT\b/g, "CT")
        .replace(/\bBOULEVARD\b/g, "BLVD")
        .replace(/\bPLACE\b/g, "PL")
        .replace(/\bHIGHWAY\b/g, "HWY")
        .replace(/\bPARKWAY\b/g, "PKWY")
        .replace(/\bNORTH\b/g, "N")
        .replace(/\bSOUTH\b/g, "S")
        .replace(/\bEAST\b/g, "E")
        .replace(/\bWEST\b/g, "W")
        .replace(/\b(APT|UNIT|SUITE|STE)\s*[A-Z0-9-]+\b/g, "")
        .replace(/[^A-Z0-9]/g, "");
};

window.njPossibleAbsentee = function(a) {
    const prop = window.normalizeNJAddress(a.PROP_LOC);
    const mail = window.normalizeNJAddress(a.ST_ADDRESS);

    if (!prop || !mail) return "Unknown";

    if (prop === mail) return "No";

    const propNumber = String(a.PROP_LOC || "").match(/^\s*(\d+[A-Z]?)/i);
    const mailNumber = String(a.ST_ADDRESS || "").match(/^\s*(\d+[A-Z]?)/i);

    if (
        propNumber &&
        mailNumber &&
        propNumber[1].toUpperCase() === mailNumber[1].toUpperCase()
    ) {
        const propStreet = prop.replace(/^\d+[A-Z]?/, "");
        const mailStreet = mail.replace(/^\d+[A-Z]?/, "");

        if (propStreet === mailStreet) return "No";
    }

    return "Yes";
};

window.normalizeNJLead = function(a) {
    return {
        parcelId: a.PAMS_PIN || "",
        ownerName: a.OWNER_NAME || "",
        propertyAddress: a.PROP_LOC || "",
        municipality: a.MUN_NAME || "",
        county: a.COUNTY || "",
        mailingAddress: [a.ST_ADDRESS, a.CITY_STATE, a.ZIP_CODE].filter(Boolean).join(", "),
        propertyClass: a.PROP_CLASS || "",
        propertyUse: a.PROP_USE || "",
        dwellUnits: Number(a.DWELL || 0),
        commercialDwellUnits: Number(a.COMM_DWELL || 0),
        assessedValue: Number(a.NET_VALUE || 0),
        lastYearTax: Number(a.LAST_YR_TX || 0),
        deedDate: a.DEED_DATE || "",
        yearsOwned: window.njYearsOwned(a.DEED_DATE),
        salePrice: Number(a.SALE_PRICE || 0),
        deedBook: a.DEED_BOOK || "",
        deedPage: a.DEED_PAGE || "",
        absentee: window.njPossibleAbsentee(a),
        source: "NJ Public Property Data"
    };
};

window.njEquitySignal = function(c) {
    const years = Number(c.yearsOwned || 0);
    const salePrice = Number(c.salePrice || 0);
    const assessed = Number(c.assessedValue || 0);

    // This is a lead-prioritization signal only.
    // It is NOT actual calculated equity because mortgage balances are unavailable.

    if (years >= 20) return "Strong";

    if (
        years >= 10 &&
        salePrice > 0 &&
        assessed > 0 &&
        assessed >= salePrice * 1.25
    ) {
        return "Strong";
    }

    if (years >= 10) return "Possible";

    if (
        years >= 5 &&
        salePrice > 0 &&
        assessed > 0 &&
        assessed >= salePrice * 1.5
    ) {
        return "Possible";
    }

    return "None";
};

window.scoreNJCandidate = function(c) {
    let score = 0;

    const years = Number(c.yearsOwned || 0);
    const mfConfidence = window.njMultifamilyConfidence(c);
    const equitySignal = window.njEquitySignal(c);

    // Ownership longevity
    score += Math.min(20, Math.max(0, years));

    // Absentee-owner signal
    if (c.absentee === "Yes") score += 20;

    // Multifamily / landlord signal
    if (mfConfidence === "Strong") score += 15;
    else if (mfConfidence === "Possible") score += 5;

    // Estimated equity signal
    if (equitySignal === "Strong") score += 15;
    else if (equitySignal === "Possible") score += 7;

    // Tired-landlord combination bonus
    if (
        c.absentee === "Yes" &&
        years >= 10 &&
        (mfConfidence === "Strong" || mfConfidence === "Possible")
    ) {
        score += 15;
    }

    return Math.min(100, Math.round(score));
};

window.isNJMultifamily = function(c) {
    const units = Number(c.dwellUnits || 0);
    const commercialUnits = Number(c.commercialDwellUnits || 0);
    if (units >= 2 && units <= 4) return true;
    if (String(c.propertyClass || "").toUpperCase() === "4C") return true;
    if (commercialUnits >= 2) return true;
    return false;
};

window.buildNJCandidates = function(data) {
    const features = Array.isArray(data && data.features) ? data.features : [];
    return features.map(f => window.normalizeNJLead(f.attributes || {})).map(c => ({
        ...c,
        score: window.scoreNJCandidate(c),
        multifamily: window.isNJMultifamily(c),
        multifamilyConfidence: window.njMultifamilyConfidence(c),
        equitySignal: window.njEquitySignal(c)
    })).sort((a,b) => b.score - a.score);
};

window.njMoney = function(v) {
    const n = Number(v || 0);
    return n ? "$" + n.toLocaleString("en-US") : "—";
};

window.renderNJCandidate = function(c) {
    const units = Number(c.dwellUnits || c.commercialDwellUnits || 0);
    const owner = c.ownerName || "Not available from NJ public dataset";
    const parcel = encodeURIComponent(c.parcelId || "");

    return `<div class="notice" style="margin:10px 0">
        <strong>${c.propertyAddress || "Unknown Address"}</strong><br>
        Owner: ${owner}<br>
        Score: ${c.score || 0} • ${window.njMultifamilyConfidence(c) === "Strong" ? "Strong Multifamily Signal" : window.njMultifamilyConfidence(c) === "Possible" ? "Possible Multifamily Signal" : "Property"}${units ? " • NJ Record: " + units + " Dwellings" : ""}<br>
        ${c.yearsOwned ? c.yearsOwned + " Years Owned • " : ""}Possible Absentee: ${c.absentee || "Unknown"}<br>
        Equity Signal: ${c.equitySignal || "None"} <small>(estimate only)</small><br>
        Assessed Value: ${window.njMoney(c.assessedValue)} • Last Tax: ${window.njMoney(c.lastYearTax)}<br><br>
        <button class="btn" onclick="saveLeadReconCandidate('${parcel}')">Save Lead</button>
        <button class="btn alt" onclick="sendLeadReconCandidateToOwner('${parcel}')">Send to Owner Recon</button>
    </div>`;
};

window.njMultifamilyConfidence = function(c) {
    const units = Number(c.dwellUnits || 0);
    const commercialUnits = Number(c.commercialDwellUnits || 0);
    const propertyClass = String(c.propertyClass || "").toUpperCase();
    if (propertyClass === "4C" || commercialUnits >= 2) return "Strong";
    if (units >= 2 && units <= 4) return "Possible";
    return "None";
};
