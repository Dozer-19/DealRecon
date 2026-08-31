window.onDealReconAIResult = function(text) {
    alert("Deal Recon AI:\n\n" + text);
};

window.onDealReconAIError = function(message) {
    alert("AI Error:\n\n" + message);
};

window.testDealReconAI = function() {
    if (window.DealReconAI) {
        DealReconAI.ask("Reply with exactly: Deal Recon AI is working.");
    } else {
        alert("Deal Recon AI bridge is not available.");
    }
};
