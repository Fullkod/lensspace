package com.fullkod.lensspace;

import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

// LEN0012: copied over the generated MainActivity by scripts/android-build.mjs. Capacitor opens
// error.html on any main-frame failure without saying why; this client passes the reason (Android
// error code and description, HTTP status, SSL error) and the failing URL in the fragment, which
// the WebView does not send in the request, so Capacitor still serves error.html from the APK.
public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (bridge != null) bridge.setWebViewClient(new DiagnosticClient(bridge));
    }

    static class DiagnosticClient extends BridgeWebViewClient {
        private final Bridge bridge;

        DiagnosticClient(Bridge bridge) {
            super(bridge);
            this.bridge = bridge;
        }

        private void showError(WebView view, String reason, String url) {
            String errorUrl = bridge.getErrorUrl();
            if (errorUrl == null) return;
            view.loadUrl(errorUrl + "#reason=" + Uri.encode(reason) + "&url=" + Uri.encode(url == null ? "" : url));
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (!request.isForMainFrame()) return;
            showError(view, "net " + error.getErrorCode() + " " + error.getDescription(), request.getUrl().toString());
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
            if (!request.isForMainFrame()) return;
            showError(view, "http " + response.getStatusCode() + " " + response.getReasonPhrase(), request.getUrl().toString());
        }

        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            handler.cancel();
            String serverUrl = bridge.getServerUrl();
            if (serverUrl != null && error.getUrl() != null && error.getUrl().startsWith(serverUrl)) {
                showError(view, "ssl " + error.getPrimaryError(), error.getUrl());
            }
        }
    }
}
