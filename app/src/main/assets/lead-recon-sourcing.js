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
    const params = new URLSearchParams({
        where: whereClause,
        outFields: "PAMS_PIN,MUN_NAME,COUNTY,PROP_LOC,ST_ADDRESS,CITY_STATE,ZIP_CODE,PROP_CLASS,NET_VALUE,LAST_YR_TX,DEED_DATE,SALE_PRICE,DEED_BOOK,DEED_PAGE",
        returnGeometry: "false",
        resultRecordCount: "100",
        f: "json"
    });
    const r = await fetch(window.NJ_PARCEL_API + "?" + params.toString());
    if (!r.ok) throw new Error("NJ public records request failed");
    return await r.json();
};
