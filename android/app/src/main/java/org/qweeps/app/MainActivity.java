package org.qweeps.app;

import android.Manifest;
import android.app.Activity;
import android.content.*;
import android.net.Uri;
import android.os.*;
import android.webkit.*;
import android.widget.*;
import android.graphics.Color;
import android.view.WindowInsets;
import android.view.ViewGroup;

/** One same-origin loopback WebView: existing relative fetches need no CORS bridge. */
public class MainActivity extends Activity {
    private static final String ORIGIN = "http://127.0.0.1:4174";
    private static final int PDF_REQUEST = 41;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private PythonService service;
    private WebView web;
    private boolean bound, loaded;
    private ValueCallback<Uri[]> fileCallback;
    private final ServiceConnection connection = new ServiceConnection() {
        @Override public void onServiceConnected(ComponentName name, IBinder binder) {
            service = ((PythonService.LocalBinder)binder).service();
            handler.post(waitForPython);
        }
        @Override public void onServiceDisconnected(ComponentName name) { service = null; loaded = false; }
    };
    private final Runnable waitForPython = new Runnable() {
        @Override public void run() {
            if (isFinishing() || service == null) return;
            if (service.isReady()) {
                if (!loaded) { web.loadUrl(ORIGIN + "/?home=1"); loaded = true; }
            } else if (service.getFailure() != null) {
                TextView error = new TextView(MainActivity.this);
                error.setText(service.getFailure() + "\n\nClose and reopen QWEEPS to retry.");
                error.setTextColor(Color.WHITE); error.setPadding(32,32,32,32); setContentView(error);
            } else handler.postDelayed(this, 150);
        }
    };
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(23,43,37));
        getWindow().setNavigationBarColor(Color.rgb(16,28,32));
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(16,28,32));
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(true); // User-selected PDF URIs only.
        web.getSettings().setMediaPlaybackRequiresUserGesture(true);
        web.getSettings().setUserAgentString(web.getSettings().getUserAgentString() + " QWEEPS-Android");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if ("http".equals(url.getScheme()) && "127.0.0.1".equals(url.getHost()) && url.getPort() == 4174) return false;
                if ("https".equals(url.getScheme()) || "http".equals(url.getScheme())) {
                    startActivity(new Intent(Intent.ACTION_VIEW, url));
                }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("application/pdf").addCategory(Intent.CATEGORY_OPENABLE);
                startActivityForResult(picker, PDF_REQUEST);
                return true;
            }
        });
        FrameLayout root = new FrameLayout(this);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
                return WindowInsets.CONSUMED;
            });
        }
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 42);
        }
    }
    @Override protected void onStart() {
        super.onStart();
        Intent intent = new Intent(this, PythonService.class);
        startForegroundService(intent);
        bindService(intent, connection, BIND_AUTO_CREATE); bound = true;
    }
    @Override protected void onStop() {
        handler.removeCallbacks(waitForPython);
        if (bound) { unbindService(connection); bound = false; }
        super.onStop();
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == PDF_REQUEST && fileCallback != null) {
            fileCallback.onReceiveValue(result == RESULT_OK && data != null && data.getData() != null ? new Uri[]{data.getData()} : null);
            fileCallback = null;
        }
    }
    @Override public void onBackPressed() {
        // Let the React menu/dialog handle Back before leaving the app.
        web.evaluateJavascript("(()=>{const b=document.querySelector('[aria-label=\"Close lesson menu\"],[aria-label=\"Hide QWEEPS conversation\"]');if(b){b.click();return true;}return false;})()", handled -> {
            if (!"true".equals(handled)) { if (web.canGoBack()) web.goBack(); else finish(); }
        });
    }
    @Override protected void onDestroy() { if (fileCallback != null) fileCallback.onReceiveValue(null); web.destroy(); super.onDestroy(); }
}
