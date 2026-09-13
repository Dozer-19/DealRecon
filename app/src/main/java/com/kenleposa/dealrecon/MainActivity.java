package com.kenleposa.dealrecon;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
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

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
public class MainActivity extends Activity {
private GenerativeModelFutures aiModel;
private GenerativeModelFutures aiFallbackModel;
    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;

    private boolean camdenLookupActive = false;
    private int camdenPollAttempts = 0;
    private long pendingCamdenOwnerId = -1L;
    private String pendingCamdenResultJson = null;
    private String pendingCamdenError = null;

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
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url != null &&
                    camdenLookupActive &&
                    isCamdenSearchUrl(url)) {
                    return false;
                }

                if (url != null &&
                    (url.startsWith("http://") || url.startsWith("https://"))) {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    startActivity(intent);
                    return true;
                }

                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);

                if (camdenLookupActive && isCamdenSearchUrl(url)) {
                    camdenPollAttempts = 0;
                    view.postDelayed(
                        MainActivity.this::pollCamdenSearchResults,
                        700
                    );
                    return;
                }

                if (
                    url != null &&
                    url.startsWith("file:///android_asset/index.html") &&
                    pendingCamdenOwnerId >= 0 &&
                    (
                        pendingCamdenResultJson != null ||
                        pendingCamdenError != null
                    )
                ) {
                    deliverPendingCamdenResult();
                }
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = filePathCallback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.setType("*/*");
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

private boolean isCamdenSearchUrl(String url) {
    if (url == null) return false;

    try {
        Uri uri = Uri.parse(url);
        String host = uri.getHost();

        return host != null &&
            host.equalsIgnoreCase("camden.newvisionsystems.com") &&
            url.toLowerCase().contains("/searchanywhere");
    } catch (Exception e) {
        return false;
    }
}

private String normalizeCamdenNumber(String value) {
    if (value == null) return "";

    String cleaned = value.trim();

    if (cleaned.matches("\\d+")) {
        cleaned = cleaned.replaceFirst("^0+(?!$)", "");
    }

    return cleaned;
}

private void addCamdenName(
        List<String> names,
        String name
) {
    if (name == null) return;

    String cleaned = name
        .replaceAll("\\s+", " ")
        .trim();

    if (
        cleaned.isEmpty() ||
        "null".equalsIgnoreCase(cleaned)
    ) {
        return;
    }

    for (String existing : names) {
        if (existing.equalsIgnoreCase(cleaned)) {
            return;
        }
    }

    names.add(cleaned);
}

private void pollCamdenSearchResults() {
    if (
        webView == null ||
        !camdenLookupActive
    ) {
        return;
    }

    camdenPollAttempts++;

    final String script =
        "(function(){" +
        "try{" +
        "if(typeof angular==='undefined')return JSON.stringify({ready:false});" +
        "var root=document.querySelector('[ng-app=\\\"Main\\\"]')||document.body;" +
        "var el=angular.element(root);" +
        "var inj=el.injector&&el.injector();" +
        "if(!inj)return JSON.stringify({ready:false,error:'no injector'});" +
        "var ds=inj.get('documentService');" +
        "if(!ds||!ds.SearchResults)return JSON.stringify({ready:false});" +
        "var rows=ds.SearchResults.results;" +
        "if(!rows||!rows.length)return JSON.stringify({ready:false});" +
        "var out=[];" +
        "for(var i=0;i<rows.length;i++){" +
        "var r=rows[i]||{};" +
        "out.push({" +
        "party_code:r.party_code||''," +
        "party_name:r.party_name||''," +
        "cross_party_name:r.cross_party_name||''," +
        "partyD_label:r.partyD_label||''," +
        "partyR_label:r.partyR_label||''," +
        "book:r.book==null?'':String(r.book)," +
        "page:r.page==null?'':String(r.page)," +
        "doc_type:r.doc_type||''," +
        "doc_id:r.doc_id==null?'':String(r.doc_id)," +
        "rec_date:r.rec_date||''," +
        "file_num:r.file_num||''" +
        "});" +
        "}" +
        "return JSON.stringify({ready:true,rows:out});" +
        "}catch(e){" +
        "return JSON.stringify({ready:false,error:String(e)});" +
        "}" +
        "})()";

    webView.evaluateJavascript(
        script,
        value -> {
            if (!camdenLookupActive) return;

            try {
                Object decoded =
                    new org.json.JSONTokener(value)
                        .nextValue();

                String json =
                    decoded instanceof String
                        ? (String) decoded
                        : String.valueOf(decoded);

                JSONObject payload =
                    new JSONObject(json);

                if (payload.optBoolean("ready", false)) {
                    processCamdenSearchResults(payload);
                    return;
                }

            } catch (Exception ignored) {
            }

            if (camdenPollAttempts >= 40) {
                finishCamdenLookupWithError(
                    "Camden County loaded, but Deal Recon could not read the completed deed search."
                );
                return;
            }

            if (
                webView != null &&
                camdenLookupActive
            ) {
                webView.postDelayed(
                    MainActivity.this::pollCamdenSearchResults,
                    500
                );
            }
        }
    );
}

private void processCamdenSearchResults(
        JSONObject payload
) {
    try {
        org.json.JSONArray rows =
            payload.optJSONArray("rows");

        if (rows == null || rows.length() == 0) {
            throw new Exception(
                "Camden County returned no deed records."
            );
        }

        List<String> grantees =
            new ArrayList<>();

        List<String> grantors =
            new ArrayList<>();

        String recordingDate = "";
        String instrumentNumber = "";
        String documentId = "";

        for (int i = 0; i < rows.length(); i++) {
            JSONObject row =
                rows.optJSONObject(i);

            if (row == null) continue;

            String type =
                row.optString(
                    "doc_type",
                    ""
                ).trim();

            if (
                !type.isEmpty() &&
                !"DEED".equalsIgnoreCase(type)
            ) {
                continue;
            }

            String code =
                row.optString(
                    "party_code",
                    ""
                ).trim();

            String directLabel =
                row.optString(
                    "partyD_label",
                    ""
                ).trim();

            String reverseLabel =
                row.optString(
                    "partyR_label",
                    ""
                ).trim();

            String partyName =
                row.optString(
                    "party_name",
                    ""
                ).trim();

            String crossParty =
                row.optString(
                    "cross_party_name",
                    ""
                ).trim();

            /*
             * Camden/NewVision deed index:
             *
             * Direct party  = Grantor / Seller
             * Reverse party = Grantee / Buyer
             *
             * party_code identifies which side party_name belongs to.
             * cross_party_name is the opposite side.
             */
            boolean partyIsDirect =
                !directLabel.isEmpty() &&
                code.equalsIgnoreCase(directLabel);

            boolean partyIsReverse =
                !reverseLabel.isEmpty() &&
                code.equalsIgnoreCase(reverseLabel);

            if (partyIsDirect) {
                addCamdenName(
                    grantors,
                    partyName
                );

                addCamdenName(
                    grantees,
                    crossParty
                );

            } else if (partyIsReverse) {
                addCamdenName(
                    grantees,
                    partyName
                );

                addCamdenName(
                    grantors,
                    crossParty
                );

            } else {
                /*
                 * Some Camden rows may return the party labels differently.
                 * If the code itself clearly identifies D/R, use that safely.
                 */
                String upperCode =
                    code.toUpperCase();

                if (
                    upperCode.equals("D") ||
                    upperCode.equals("DIRECT")
                ) {
                    addCamdenName(
                        grantors,
                        partyName
                    );

                    addCamdenName(
                        grantees,
                        crossParty
                    );

                } else if (
                    upperCode.equals("R") ||
                    upperCode.equals("REVERSE")
                ) {
                    addCamdenName(
                        grantees,
                        partyName
                    );

                    addCamdenName(
                        grantors,
                        crossParty
                    );
                }
            }

            if (recordingDate.isEmpty()) {
                recordingDate =
                    row.optString(
                        "rec_date",
                        ""
                    );
            }

            if (instrumentNumber.isEmpty()) {
                instrumentNumber =
                    row.optString(
                        "file_num",
                        ""
                    );
            }

            if (documentId.isEmpty()) {
                documentId =
                    row.optString(
                        "doc_id",
                        ""
                    );
            }
        }

        if (grantees.isEmpty()) {
            throw new Exception(
                "The Camden deed search completed, but a grantee name could not be identified."
            );
        }

        JSONObject result =
            new JSONObject();

        result.put(
            "success",
            true
        );

        result.put(
            "ownerName",
            joinDeedNames(grantees)
        );

        result.put(
            "grantees",
            joinDeedNames(grantees)
        );

        result.put(
            "grantors",
            joinDeedNames(grantors)
        );

        result.put(
            "source",
            "Camden County deed index"
        );

        result.put(
            "recordingDate",
            recordingDate
        );

        result.put(
            "instrumentNumber",
            instrumentNumber
        );

        result.put(
            "documentId",
            documentId
        );

        pendingCamdenResultJson =
            result.toString();

        pendingCamdenError = null;

        restoreDealReconAfterCamden();

    } catch (Exception e) {
        finishCamdenLookupWithError(
            e.getMessage() == null
                ? "Automatic Camden County deed lookup failed."
                : e.getMessage()
        );
    }
}

private void finishCamdenLookupWithError(
        String message
) {
    pendingCamdenResultJson = null;

    pendingCamdenError =
        message == null
            ? "Automatic Camden County deed lookup failed."
            : message;

    restoreDealReconAfterCamden();
}

private void restoreDealReconAfterCamden() {
    camdenLookupActive = false;

    if (webView != null) {
        webView.loadUrl(
            "file:///android_asset/index.html"
        );
    }
}

private void deliverPendingCamdenResult() {
    if (
        webView == null ||
        pendingCamdenOwnerId < 0
    ) {
        return;
    }

    final long ownerId =
        pendingCamdenOwnerId;

    final String resultJson =
        pendingCamdenResultJson;

    final String error =
        pendingCamdenError;

    pendingCamdenOwnerId = -1L;
    pendingCamdenResultJson = null;
    pendingCamdenError = null;

    webView.postDelayed(
        () -> {
            if (webView == null) return;

            StringBuilder js =
                new StringBuilder();

            js.append(
                "window.pendingDeedOwnerId="
            );

            js.append(ownerId);
            js.append(";");

            if (resultJson != null) {
                js.append(
                    "window.onDealReconDeedResult && " +
                    "window.onDealReconDeedResult("
                );

                js.append(
                    JSONObject.quote(resultJson)
                );

                js.append(");");
            } else {
                js.append(
                    "window.onDealReconDeedError && " +
                    "window.onDealReconDeedError("
                );

                js.append(
                    JSONObject.quote(
                        error == null
                            ? "Automatic Camden County deed lookup failed."
                            : error
                    )
                );

                js.append(");");
            }

            webView.evaluateJavascript(
                js.toString(),
                null
            );
        },
        350
    );
}

private class DealReconAI {
    @JavascriptInterface
    public void openUrl(String url) {
        if (url == null || url.trim().isEmpty()) return;

        runOnUiThread(() -> {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                startActivity(intent);
            } catch (Exception e) {
                e.printStackTrace();
            }
        });
    }

    @JavascriptInterface
    public void analyzeDeedImage(String base64Image, String prompt) {
        try {
            if (base64Image == null || base64Image.trim().isEmpty()) {
                sendAIError("No deed image was received.");
                return;
            }

            String cleanBase64 = base64Image;
            int comma = cleanBase64.indexOf(',');
            if (comma >= 0) {
                cleanBase64 = cleanBase64.substring(comma + 1);
            }

            byte[] imageBytes = Base64.decode(cleanBase64, Base64.DEFAULT);
            Bitmap bitmap = BitmapFactory.decodeByteArray(
                imageBytes, 0, imageBytes.length
            );

            if (bitmap == null) {
                sendAIError("Deal Recon could not read that deed image.");
                return;
            }

            Content content = new Content.Builder()
                .addImage(bitmap)
                .addText(prompt)
                .build();

            ListenableFuture<GenerateContentResponse> future =
                aiModel.generateContent(content);

            future.addListener(() -> {
                try {
                    GenerateContentResponse response = future.get();
                    sendAIResult(response.getText());
                } catch (Exception e) {
                    retryWithFallback(content);
                }
            }, MoreExecutors.directExecutor());

        } catch (Exception e) {
            sendAIError(e.getMessage());
        }
    }

    @JavascriptInterface
    public void lookupGloucesterDeed(String book, String page) {
        new Thread(() -> {
            try {
                JSONObject result = performGloucesterDeedLookup(book, page);
                sendDeedResult(result);
            } catch (Exception e) {
                String message = e.getMessage();
                if (message == null || message.trim().isEmpty()) {
                    message = "Automatic Gloucester County deed lookup failed.";
                }
                sendDeedError(message);
            }
        }).start();
    }

    @JavascriptInterface
    public void lookupSalemDeed(String book, String page) {
        new Thread(() -> {
            try {
                JSONObject result = performSalemDeedLookup(book, page);
                sendDeedResult(result);
            } catch (Exception e) {
                String message = e.getMessage();
                if (message == null || message.trim().isEmpty()) {
                    message = "Automatic Salem County deed lookup failed.";
                }
                sendDeedError(message);
            }
        }).start();
    }

    @JavascriptInterface
    public void lookupCamdenDeed(
            String book,
            String page,
            long ownerId
    ) {
        if (
            book == null ||
            page == null
        ) {
            sendDeedError(
                "Missing Camden County deed book or page."
            );
            return;
        }

        final String cleanBook =
            book.trim();

        final String cleanPage =
            page.trim();

        if (
            !cleanBook.matches("\\d+") ||
            !cleanPage.matches("\\d+")
        ) {
            sendDeedError(
                "The stored Camden deed book/page is not valid."
            );
            return;
        }

        runOnUiThread(() -> {
            try {
                pendingCamdenOwnerId =
                    ownerId;

                pendingCamdenResultJson =
                    null;

                pendingCamdenError =
                    null;

                camdenLookupActive =
                    true;

                camdenPollAttempts =
                    0;

                Uri url =
                    Uri.parse(
                        "https://camden.newvisionsystems.com/SearchAnywhere/"
                    )
                    .buildUpon()
                    .appendQueryParameter(
                        "bookType",
                        "O"
                    )
                    .appendQueryParameter(
                        "book",
                        cleanBook
                    )
                    .appendQueryParameter(
                        "page",
                        cleanPage
                    )
                    .build();

                webView.loadUrl(
                    url.toString()
                );

            } catch (Exception e) {
                camdenLookupActive =
                    false;

                pendingCamdenOwnerId =
                    ownerId;

                finishCamdenLookupWithError(
                    e.getMessage()
                );
            }
        });
    }

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

private static class DeedHttpResponse {
    String body;
    String url;

    DeedHttpResponse(String body, String url) {
        this.body = body;
        this.url = url;
    }
}

private DeedHttpResponse deedRequest(
        String method,
        String url,
        Map<String,String> form,
        Map<String,String> cookies
) throws Exception {

    String currentUrl = url;
    String currentMethod = method;
    Map<String,String> currentForm = form;

    for (int redirect = 0; redirect < 6; redirect++) {

        HttpURLConnection conn =
            (HttpURLConnection) new URL(currentUrl).openConnection();

        conn.setInstanceFollowRedirects(false);
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(20000);
        conn.setRequestProperty(
            "User-Agent",
            "Mozilla/5.0 (Android) DealRecon/1.0"
        );
        conn.setRequestProperty(
            "Accept",
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        );

        if (!cookies.isEmpty()) {
            StringBuilder cookieHeader = new StringBuilder();

            for (Map.Entry<String,String> entry : cookies.entrySet()) {
                if (cookieHeader.length() > 0) {
                    cookieHeader.append("; ");
                }

                cookieHeader
                    .append(entry.getKey())
                    .append("=")
                    .append(entry.getValue());
            }

            conn.setRequestProperty("Cookie", cookieHeader.toString());
        }

        if ("POST".equals(currentMethod)) {
            conn.setDoOutput(true);
            conn.setRequestMethod("POST");
            conn.setRequestProperty(
                "Content-Type",
                "application/x-www-form-urlencoded"
            );

            String body = encodeDeedForm(currentForm);
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);

            conn.setFixedLengthStreamingMode(bytes.length);

            try (OutputStream out = conn.getOutputStream()) {
                out.write(bytes);
            }
        } else {
            conn.setRequestMethod("GET");
        }

        int status = conn.getResponseCode();

        Map<String,List<String>> headers = conn.getHeaderFields();

        if (headers != null) {
            for (Map.Entry<String,List<String>> header : headers.entrySet()) {
                if (header.getKey() == null) continue;

                if ("Set-Cookie".equalsIgnoreCase(header.getKey())) {
                    for (String rawCookie : header.getValue()) {
                        if (rawCookie == null) continue;

                        String first = rawCookie.split(";", 2)[0];
                        int equals = first.indexOf('=');

                        if (equals > 0) {
                            String key = first.substring(0, equals).trim();
                            String value = first.substring(equals + 1).trim();

                            cookies.put(key, value);
                        }
                    }
                }
            }
        }

        if (status >= 300 && status < 400) {
            String location = conn.getHeaderField("Location");

            if (location == null || location.trim().isEmpty()) {
                throw new Exception(
                    "Gloucester County returned a redirect without a destination."
                );
            }

            currentUrl =
                new URL(new URL(currentUrl), location).toString();

            if (status == 301 || status == 302 || status == 303) {
                currentMethod = "GET";
                currentForm = null;
            }

            conn.disconnect();
            continue;
        }

        BufferedReader reader;

        if (status >= 400) {
            if (conn.getErrorStream() == null) {
                throw new Exception(
                    "Gloucester County returned HTTP " + status + "."
                );
            }

            reader = new BufferedReader(
                new InputStreamReader(
                    conn.getErrorStream(),
                    StandardCharsets.UTF_8
                )
            );
        } else {
            reader = new BufferedReader(
                new InputStreamReader(
                    conn.getInputStream(),
                    StandardCharsets.UTF_8
                )
            );
        }

        StringBuilder response = new StringBuilder();
        String line;

        while ((line = reader.readLine()) != null) {
            response.append(line).append("\n");
        }

        reader.close();

        String finalUrl = currentUrl;
        conn.disconnect();

        if (status >= 400) {
            throw new Exception(
                "Gloucester County returned HTTP " + status + "."
            );
        }

        return new DeedHttpResponse(
            response.toString(),
            finalUrl
        );
    }

    throw new Exception("Too many redirects from Gloucester County.");
}

private String encodeDeedForm(
        Map<String,String> fields
) throws Exception {

    StringBuilder body = new StringBuilder();

    for (Map.Entry<String,String> entry : fields.entrySet()) {
        if (body.length() > 0) {
            body.append("&");
        }

        body.append(
            URLEncoder.encode(
                entry.getKey(),
                StandardCharsets.UTF_8.toString()
            )
        );

        body.append("=");

        body.append(
            URLEncoder.encode(
                entry.getValue() == null ? "" : entry.getValue(),
                StandardCharsets.UTF_8.toString()
            )
        );
    }

    return body.toString();
}

private Map<String,String> extractDeedHiddenFields(
        String html
) {

    Map<String,String> fields = new LinkedHashMap<>();

    Pattern inputPattern = Pattern.compile(
        "<input\\b[^>]*type=[\"']hidden[\"'][^>]*>",
        Pattern.CASE_INSENSITIVE
    );

    Matcher inputMatcher = inputPattern.matcher(html);

    while (inputMatcher.find()) {
        String tag = inputMatcher.group();

        Matcher nameMatcher = Pattern.compile(
            "name=[\"']([^\"']+)[\"']",
            Pattern.CASE_INSENSITIVE
        ).matcher(tag);

        if (!nameMatcher.find()) {
            continue;
        }

        Matcher valueMatcher = Pattern.compile(
            "value=[\"']([^\"']*)[\"']",
            Pattern.CASE_INSENSITIVE
        ).matcher(tag);

        String name = deedHtmlDecode(nameMatcher.group(1));
        String value = "";

        if (valueMatcher.find()) {
            value = deedHtmlDecode(valueMatcher.group(1));
        }

        fields.put(name, value);
    }

    return fields;
}

private String deedHtmlDecode(String value) {
    if (value == null) return "";

    return value
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&nbsp;", " ");
}

private String deedStripTags(String value) {
    if (value == null) return "";

    return deedHtmlDecode(
        value.replaceAll("(?is)<[^>]+>", "")
    )
    .replaceAll("\\s+", " ")
    .trim();
}

private String findDeedDetailTarget(
        String resultHtml,
        String book,
        String page
) {

    Pattern rowPattern = Pattern.compile(
        "(?is)<tr[^>]*>(.*?)</tr>"
    );

    Matcher rows = rowPattern.matcher(resultHtml);

    String normalizedBook =
        book.replaceFirst("^0+(?!$)", "");

    String normalizedPage =
        page.replaceFirst("^0+(?!$)", "");

    String fallback = null;

    while (rows.find()) {
        String row = rows.group(1);

        Matcher bookPageMatcher = Pattern.compile(
            "(?is)href=[\"']javascript:__doPostBack\\(&#39;([^&]+ButtonRow_Book/Page_0)&#39;.*?</a>"
        ).matcher(row);

        if (!bookPageMatcher.find()) {
            continue;
        }

        String target =
            deedHtmlDecode(bookPageMatcher.group(1));

        if (fallback == null) {
            fallback = target;
        }

        String plain =
            deedStripTags(row)
                .replaceFirst("^0+(?!$)", "");

        boolean isDeed =
            plain.toUpperCase().contains("DEED");

        boolean bookMatches =
            plain.contains(normalizedBook);

        boolean pageMatches =
            plain.contains(normalizedPage);

        if (isDeed && bookMatches && pageMatches) {
            return target;
        }
    }

    return fallback;
}

private List<String> extractDeedParties(
        String detailHtml,
        String partyType
) {

    List<String> parties = new ArrayList<>();

    Pattern tablePattern = Pattern.compile(
        "(?is)<table[^>]*id=[\"']DocDetails1_GridView_GrantorGrantee[\"'][^>]*>(.*?)</table>"
    );

    Matcher tableMatcher = tablePattern.matcher(detailHtml);

    if (!tableMatcher.find()) {
        return parties;
    }

    String tableHtml = tableMatcher.group(1);

    Pattern rowPattern = Pattern.compile(
        "(?is)<tr[^>]*>(.*?)</tr>"
    );

    Matcher rowMatcher = rowPattern.matcher(tableHtml);

    while (rowMatcher.find()) {
        String rowHtml = rowMatcher.group(1);

        List<String> cells = new ArrayList<>();

        Pattern cellPattern = Pattern.compile(
            "(?is)<td[^>]*>(.*?)</td>"
        );

        Matcher cellMatcher = cellPattern.matcher(rowHtml);

        while (cellMatcher.find()) {
            cells.add(
                deedStripTags(cellMatcher.group(1))
            );
        }

        if (cells.size() < 2) {
            continue;
        }

        String name = cells.get(0).trim();
        String role = cells.get(1).trim();

        if (
            role.equalsIgnoreCase(partyType) &&
            !name.isEmpty() &&
            !parties.contains(name)
        ) {
            parties.add(name);
        }
    }

    return parties;
}

private String joinDeedNames(List<String> names) {
    StringBuilder out = new StringBuilder();

    for (String name : names) {
        if (out.length() > 0) {
            out.append(" & ");
        }

        out.append(name);
    }

    return out.toString();
}

private JSONObject performGloucesterDeedLookup(
        String book,
        String page
) throws Exception {

    if (book == null || page == null) {
        throw new Exception("Missing deed book or page.");
    }

    book = book.trim();
    page = page.trim();

    if (!book.matches("\\d+") || !page.matches("\\d+")) {
        throw new Exception(
            "The stored Gloucester deed book/page is not valid."
        );
    }

    String searchBook =
        book.replaceFirst("^0+(?!$)", "");

    String searchPage =
        page.replaceFirst("^0+(?!$)", "");

    final String baseUrl =
        "https://i2e.uslandrecords.com/NJ/Gloucester/D/Default.aspx";

    Map<String,String> cookies = new LinkedHashMap<>();

    // --------------------------------------------------------
    // 1. Load Gloucester County U.S. Land Records
    // --------------------------------------------------------

    DeedHttpResponse response =
        deedRequest(
            "GET",
            baseUrl,
            null,
            cookies
        );

    // --------------------------------------------------------
    // 2. Enter Recorded Land Volume Search
    // --------------------------------------------------------

    Map<String,String> fields =
        extractDeedHiddenFields(response.body);

    fields.put(
        "__EVENTTARGET",
        "Navigator1$SearchCriteria1$RLVolumeSearchLinkButton"
    );

    fields.put(
        "__EVENTARGUMENT",
        ""
    );

    response =
        deedRequest(
            "POST",
            response.url,
            fields,
            cookies
        );

    // --------------------------------------------------------
    // 3. Search the exact Book/Page
    // --------------------------------------------------------

    fields =
        extractDeedHiddenFields(response.body);

    fields.put("__EVENTTARGET", "");
    fields.put("__EVENTARGUMENT", "");

    fields.put(
        "SearchFormEx1$ACSTextBox_Volume",
        searchBook
    );

    fields.put(
        "SearchFormEx1$ACSTextBox_PageNumber",
        searchPage
    );

    fields.put(
        "SearchFormEx1$ACSDropDownList_DocumentType",
        "-2"
    );

    fields.put(
        "SearchFormEx1$btnSearch",
        "Search"
    );

    response =
        deedRequest(
            "POST",
            response.url,
            fields,
            cookies
        );

    String detailTarget =
        findDeedDetailTarget(
            response.body,
            searchBook,
            searchPage
        );

    if (detailTarget == null) {
        throw new Exception(
            "No Gloucester County deed was found for Book " +
            book + " / Page " + page + "."
        );
    }

    // --------------------------------------------------------
    // 4. Open deed details
    // --------------------------------------------------------

    fields =
        extractDeedHiddenFields(response.body);

    fields.put(
        "__EVENTTARGET",
        detailTarget
    );

    fields.put(
        "__EVENTARGUMENT",
        ""
    );

    response =
        deedRequest(
            "POST",
            response.url,
            fields,
            cookies
        );

    // --------------------------------------------------------
    // 5. Extract Grantee(s) and Grantor(s)
    // --------------------------------------------------------

    List<String> grantees =
        extractDeedParties(
            response.body,
            "Grantee"
        );

    List<String> grantors =
        extractDeedParties(
            response.body,
            "Grantor"
        );

    if (grantees.isEmpty()) {
        throw new Exception(
            "The deed was found, but Gloucester County did not return a grantee name."
        );
    }

    JSONObject result = new JSONObject();

    result.put("success", true);
    result.put("book", book);
    result.put("page", page);
    result.put(
        "ownerName",
        joinDeedNames(grantees)
    );
    result.put(
        "grantees",
        joinDeedNames(grantees)
    );
    result.put(
        "grantors",
        joinDeedNames(grantors)
    );
    result.put(
        "source",
        "Gloucester County deed index"
    );

    return result;
}


private JSONObject salemJsonPost(
        String urlString,
        JSONObject payload
) throws Exception {

    java.net.HttpURLConnection connection = null;

    try {
        java.net.URL url =
            new java.net.URL(urlString);

        connection =
            (java.net.HttpURLConnection)
            url.openConnection();

        connection.setRequestMethod("POST");
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(20000);
        connection.setDoOutput(true);

        connection.setRequestProperty(
            "User-Agent",
            "Mozilla/5.0 (Android) DealRecon"
        );

        connection.setRequestProperty(
            "Accept",
            "application/json"
        );

        connection.setRequestProperty(
            "Content-Type",
            "application/json;charset=UTF-8"
        );

        connection.setRequestProperty(
            "Referer",
            "https://clerkrecordsng.salemcountynj.gov/publicsearch/"
        );

        byte[] body =
            payload.toString().getBytes(
                java.nio.charset.StandardCharsets.UTF_8
            );

        connection.setFixedLengthStreamingMode(body.length);

        try (
            java.io.OutputStream output =
                connection.getOutputStream()
        ) {
            output.write(body);
        }

        int status =
            connection.getResponseCode();

        java.io.InputStream stream =
            status >= 200 && status < 300
                ? connection.getInputStream()
                : connection.getErrorStream();

        if (stream == null) {
            throw new Exception(
                "Salem County returned HTTP " + status + "."
            );
        }

        StringBuilder response =
            new StringBuilder();

        try (
            java.io.BufferedReader reader =
                new java.io.BufferedReader(
                    new java.io.InputStreamReader(
                        stream,
                        java.nio.charset.StandardCharsets.UTF_8
                    )
                )
        ) {
            String line;

            while ((line = reader.readLine()) != null) {
                response.append(line);
            }
        }

        if (status < 200 || status >= 300) {
            throw new Exception(
                "Salem County returned HTTP " +
                status +
                ": " +
                response
            );
        }

        return new JSONObject(response.toString());

    } finally {
        if (connection != null) {
            connection.disconnect();
        }
    }
}

private org.json.JSONArray salemJsonPostArray(
        String urlString,
        JSONObject payload
) throws Exception {

    java.net.HttpURLConnection connection = null;

    try {
        java.net.URL url =
            new java.net.URL(urlString);

        connection =
            (java.net.HttpURLConnection)
            url.openConnection();

        connection.setRequestMethod("POST");
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(20000);
        connection.setDoOutput(true);

        connection.setRequestProperty(
            "User-Agent",
            "Mozilla/5.0 (Android) DealRecon"
        );

        connection.setRequestProperty(
            "Accept",
            "application/json"
        );

        connection.setRequestProperty(
            "Content-Type",
            "application/json;charset=UTF-8"
        );

        connection.setRequestProperty(
            "Referer",
            "https://clerkrecordsng.salemcountynj.gov/publicsearch/"
        );

        byte[] body =
            payload.toString().getBytes(
                java.nio.charset.StandardCharsets.UTF_8
            );

        connection.setFixedLengthStreamingMode(body.length);

        try (
            java.io.OutputStream output =
                connection.getOutputStream()
        ) {
            output.write(body);
        }

        int status =
            connection.getResponseCode();

        java.io.InputStream stream =
            status >= 200 && status < 300
                ? connection.getInputStream()
                : connection.getErrorStream();

        if (stream == null) {
            throw new Exception(
                "Salem County returned HTTP " + status + "."
            );
        }

        StringBuilder response =
            new StringBuilder();

        try (
            java.io.BufferedReader reader =
                new java.io.BufferedReader(
                    new java.io.InputStreamReader(
                        stream,
                        java.nio.charset.StandardCharsets.UTF_8
                    )
                )
        ) {
            String line;

            while ((line = reader.readLine()) != null) {
                response.append(line);
            }
        }

        if (status < 200 || status >= 300) {
            throw new Exception(
                "Salem County returned HTTP " +
                status +
                ": " +
                response
            );
        }

        return new org.json.JSONArray(
            response.toString()
        );

    } finally {
        if (connection != null) {
            connection.disconnect();
        }
    }
}

private JSONObject performSalemDeedLookup(
        String book,
        String page
) throws Exception {

    if (book == null || page == null) {
        throw new Exception(
            "Missing Salem County deed book or page."
        );
    }

    book = book.trim();
    page = page.trim();

    if (!book.matches("\\d+") || !page.matches("\\d+")) {
        throw new Exception(
            "The stored Salem deed book/page is not valid."
        );
    }

    String searchBook =
        book.replaceFirst("^0+(?!$)", "");

    String searchPage =
        page.replaceFirst("^0+(?!$)", "");

    final String base =
        "https://clerkrecordsng.salemcountynj.gov/publicsearch/";

    // -----------------------------------------------------
    // 1. Search Salem County by Book/Page
    // -----------------------------------------------------

    JSONObject searchPayload =
        new JSONObject();

    searchPayload.put("BookType", "O");
    searchPayload.put("Book", searchBook);
    searchPayload.put("Page", searchPage);

    org.json.JSONArray searchResults =
        salemJsonPostArray(
            base + "api/search",
            searchPayload
        );

    if (searchResults.length() == 0) {
        throw new Exception(
            "No Salem County deed was found for Book " +
            book + " / Page " + page + "."
        );
    }

    long documentId = -1;

    for (int i = 0; i < searchResults.length(); i++) {

        JSONObject row =
            searchResults.getJSONObject(i);

        String rowBook =
            String.valueOf(
                row.optInt("book", -1)
            );

        String rowPage =
            String.valueOf(
                row.optInt("page", -1)
            );

        String type =
            row.optString(
                "doc_type",
                ""
            );

        if (
            rowBook.equals(searchBook) &&
            rowPage.equals(searchPage) &&
            "DEED".equalsIgnoreCase(type)
        ) {
            documentId =
                row.optLong("doc_id", -1);

            if (documentId > 0) {
                break;
            }
        }
    }

    if (documentId <= 0) {
        throw new Exception(
            "Salem County returned results, but no matching deed document was found."
        );
    }

    // -----------------------------------------------------
    // 2. Retrieve full structured deed record
    // -----------------------------------------------------

    JSONObject documentPayload =
        new JSONObject();

    documentPayload.put(
        "Token",
        JSONObject.NULL
    );

    documentPayload.put(
        "ID",
        " " + documentId
    );

    JSONObject document =
        salemJsonPost(
            base + "api/document",
            documentPayload
        );

    // -----------------------------------------------------
    // 3. Confirm Salem labels and extract parties
    // -----------------------------------------------------

    String grantorLabel =
        document.optString(
            "direct_label",
            ""
        );

    String granteeLabel =
        document.optString(
            "indir_label",
            ""
        );

    if (
        !"GRANTOR".equalsIgnoreCase(grantorLabel) ||
        !"GRANTEE".equalsIgnoreCase(granteeLabel)
    ) {
        throw new Exception(
            "Salem County returned an unexpected deed party format."
        );
    }

    List<String> grantors =
        new ArrayList<>();

    List<String> grantees =
        new ArrayList<>();

    org.json.JSONArray direct =
        document.optJSONArray(
            "direct_parties"
        );

    if (direct != null) {
        for (int i = 0; i < direct.length(); i++) {
            String name =
                direct.optString(i, "").trim();

            if (
                !name.isEmpty() &&
                !grantors.contains(name)
            ) {
                grantors.add(name);
            }
        }
    }

    org.json.JSONArray reverse =
        document.optJSONArray(
            "reverse_parties"
        );

    if (reverse != null) {
        for (int i = 0; i < reverse.length(); i++) {
            String name =
                reverse.optString(i, "").trim();

            if (
                !name.isEmpty() &&
                !grantees.contains(name)
            ) {
                grantees.add(name);
            }
        }
    }

    if (grantees.isEmpty()) {
        throw new Exception(
            "The deed was found, but Salem County did not return a grantee name."
        );
    }

    // -----------------------------------------------------
    // 4. Return same format Gloucester already uses
    // -----------------------------------------------------

    JSONObject result =
        new JSONObject();

    result.put("success", true);
    result.put("book", book);
    result.put("page", page);
    result.put(
        "ownerName",
        joinDeedNames(grantees)
    );
    result.put(
        "grantees",
        joinDeedNames(grantees)
    );
    result.put(
        "grantors",
        joinDeedNames(grantors)
    );
    result.put(
        "source",
        "Salem County deed index"
    );

    result.put(
        "documentId",
        documentId
    );

    result.put(
        "recordingDate",
        document.optString(
            "rec_date",
            ""
        )
    );

    result.put(
        "instrumentNumber",
        document.optString(
            "file_num",
            ""
        )
    );

    return result;
}

private void sendDeedResult(JSONObject result) {
    if (webView == null) return;

    final String json =
        result == null ? "{}" : result.toString();

    webView.post(() ->
        webView.evaluateJavascript(
            "window.onDealReconDeedResult && " +
            "window.onDealReconDeedResult(" +
            JSONObject.quote(json) +
            ");",
            null
        )
    );
}

private void sendDeedError(String message) {
    if (webView == null) return;

    final String safeMessage =
        message == null
            ? "Automatic deed lookup failed."
            : message;

    webView.post(() ->
        webView.evaluateJavascript(
            "window.onDealReconDeedError && " +
            "window.onDealReconDeedError(" +
            JSONObject.quote(safeMessage) +
            ");",
            null
        )
    );
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
