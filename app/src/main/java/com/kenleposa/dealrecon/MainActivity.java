package com.kenleposa.dealrecon;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.webkit.JavascriptInterface;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.window.OnBackInvokedDispatcher;
import org.json.JSONObject;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.common.util.concurrent.MoreExecutors;
import com.google.firebase.FirebaseApp;
import com.google.firebase.appcheck.FirebaseAppCheck;
import com.google.firebase.appcheck.debug.DebugAppCheckProviderFactory;
import com.google.firebase.ai.FirebaseAI;
import com.google.firebase.ai.GenerativeModel;
import com.google.firebase.ai.java.GenerativeModelFutures;
import com.google.firebase.ai.type.Content;
import com.google.firebase.ai.type.GenerateContentResponse;
import com.google.firebase.ai.type.GenerativeBackend;
public class MainActivity extends Activity {
private GenerativeModelFutures aiModel;
    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        setContentView(webView);
        FirebaseApp.initializeApp(this);
        FirebaseAppCheck firebaseAppCheck = FirebaseAppCheck.getInstance();
        firebaseAppCheck.installAppCheckProviderFactory(DebugAppCheckProviderFactory.getInstance());


GenerativeModel model = FirebaseAI.getInstance(GenerativeBackend.googleAI())
        .generativeModel("gemini-3.7-flash");
aiModel = GenerativeModelFutures.from(model);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
webView.addJavascriptInterface(new DealReconAI(), "DealReconAI");
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
        webView.loadUrl("file:///android_asset/index.html");

        if (android.os.Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                () -> {
                    if (webView.canGoBack()) webView.goBack(); else finish();
                }
            );
        }
    }

    @Override
    public void onBackPressed() {
        if (android.os.Build.VERSION.SDK_INT < 33 && webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
}

private class DealReconAI {
    @JavascriptInterface
    public void ask(String prompt) {
Content content = new Content.Builder().addText(prompt).build();
ListenableFuture<GenerateContentResponse> future = aiModel.generateContent(content);
future.addListener(() -> {
try {
GenerateContentResponse response = future.get();
String text = response.getText();
sendAIResult(text);
} catch (Exception e) {
sendAIError(e.getMessage());
}
}, MoreExecutors.directExecutor());
}
}

private void sendAIResult(String text) {
    final String safeText = (text == null) ? "No AI response returned." : text;
    if (webView == null) return;
    webView.post(() -> webView.evaluateJavascript("window.onDealReconAIResult && window.onDealReconAIResult(" + JSONObject.quote(safeText) + ");", null));
}

private void sendAIError(String message) {
    final String safeMessage = (message == null) ? "Unknown AI error." : message;
    if (webView == null) return;
    webView.post(() -> webView.evaluateJavascript("window.onDealReconAIError && window.onDealReconAIError(" + JSONObject.quote(safeMessage) + ");", null));
}
}
