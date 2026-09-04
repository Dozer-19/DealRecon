package com.kenleposa.dealrecon;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.webkit.ValueCallback;
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
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory;
import com.google.firebase.ai.FirebaseAI;
import com.google.firebase.ai.GenerativeModel;
import com.google.firebase.ai.java.GenerativeModelFutures;
import com.google.firebase.ai.type.Content;
import com.google.firebase.ai.type.GenerateContentResponse;
import com.google.firebase.ai.type.GenerativeBackend;
public class MainActivity extends Activity {
private GenerativeModelFutures aiModel;
private GenerativeModelFutures aiFallbackModel;
    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        setContentView(webView);
        FirebaseApp.initializeApp(this);
        FirebaseAppCheck firebaseAppCheck = FirebaseAppCheck.getInstance();
        firebaseAppCheck.installAppCheckProviderFactory(PlayIntegrityAppCheckProviderFactory.getInstance());


GenerativeModel model = FirebaseAI.getInstance(GenerativeBackend.googleAI())
        .generativeModel("gemini-3.6-flash");
aiModel = GenerativeModelFutures.from(model);
GenerativeModel fallbackModel = FirebaseAI.getInstance(GenerativeBackend.googleAI()).generativeModel("gemini-3.7-flash");
aiFallbackModel = GenerativeModelFutures.from(fallbackModel);

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
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = filePathCallback;
                Intent intent = fileChooserParams.createIntent();
                startActivityForResult(intent, 1001);
                return true;
            }
        });
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
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == 1001 && filePathCallback != null) {
            Uri[] results = null;
            if (resultCode == Activity.RESULT_OK && data != null) {
                results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
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
retryWithFallback(content);
}
}, MoreExecutors.directExecutor());
}
}

private void retryWithFallback(Content content) {
    ListenableFuture<GenerateContentResponse> fallbackFuture = aiFallbackModel.generateContent(content);
    fallbackFuture.addListener(() -> {
        try {
            GenerateContentResponse response = fallbackFuture.get();
            String text = response.getText();
            sendAIResult(text);
        } catch (Exception e) {
            sendAIError(e.getMessage());
        }
    }, MoreExecutors.directExecutor());
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
