(function () {
  'use strict';
  window.phoneReconLookup = async function () { throw new Error('Paid lookup is disabled in the free edition.'); };
  window.phoneReconSearch = function () {
    const owner = document.getElementById('phOwner').value.trim();
    const address = document.getElementById('phProp').value.trim();
    const box = document.getElementById('phoneReconCandidates');
    box.replaceChildren();
    if (!owner && !address) { box.textContent = 'Enter an owner or property address first.'; return; }
    const note = document.createElement('p');
    note.textContent = 'Open a web search, review any publicly available contact, then enter the number and source below. Results may be missing, incorrect, or behind a paywall. No paid lookup runs. If no number is available, use Communications to draft a letter.';
    box.appendChild(note);
    const query = [owner, address, 'phone contact'].filter(Boolean).join(' ');
    for (const [name, base] of [['Google', 'https://www.google.com/search?q='], ['Bing', 'https://www.bing.com/search?q=']]) {
      const link = document.createElement('a');
      link.className = 'btn alt'; link.textContent = 'Research on ' + name;
      link.href = base + encodeURIComponent(query); link.target = '_blank'; link.rel = 'noopener noreferrer';
      box.appendChild(link);
    }
    document.getElementById('phoneReconResult').textContent = 'Research only: no number has been verified. Record the source and check permission before calling.';
  };
  window.cmEnhanceLetter = function () { alert('Online AI is disabled in the free edition. You can edit the generated template, or copy it to your own AI service and paste your revised letter here.'); };
  window.cmShareFreeLetter = function () {
    const text = document.getElementById('cmLetter').value.trim();
    if (!text) return alert('Load or write a letter first.');
    if (window.DealReconAI && typeof window.DealReconAI.shareLetter === 'function') window.DealReconAI.shareLetter(text);
    else alert('Select and copy the letter text to your document or email app.');
  };
  const actions = document.getElementById('cmLetter')?.parentElement;
  if (actions) {
    const button = document.createElement('button'); button.className = 'btn alt';
    button.textContent = 'Share / export letter'; button.onclick = window.cmShareFreeLetter; actions.appendChild(button);
  }
})();
