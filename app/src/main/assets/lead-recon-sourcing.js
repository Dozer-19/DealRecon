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
