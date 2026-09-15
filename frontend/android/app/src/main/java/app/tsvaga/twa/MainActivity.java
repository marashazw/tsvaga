package app.tsvaga.twa;

import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "TsvagaSafeArea";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Android 15+ (API 35+) forces edge-to-edge display for any app
        // targeting that SDK - content draws behind the status bar and
        // navigation bar by default. The web-side CSS fix
        // (env(safe-area-inset-*)) relies on the WebView correctly
        // bridging those values, which Capacitor's Android WebView doesn't
        // reliably do the way a real mobile browser does. This applies the
        // correct padding directly to the WebView itself at the native
        // level instead - independent of anything the WebView's CSS
        // engine reports.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        // Listening on the WebView directly didn't work even after a
        // confirmed fresh rebuild - the most likely explanation is that
        // Capacitor's own container view (the WebView isn't necessarily a
        // direct child of the activity's root) consumed the insets before
        // they ever reached it. android.R.id.content is the activity's
        // actual root content view, guaranteed to receive the full,
        // unconsumed insets directly from the system - padding is applied
        // to the WebView from here instead.
        View rootView = findViewById(android.R.id.content);
        View webView = getBridge().getWebView();

        ViewCompat.setOnApplyWindowInsetsListener(rootView, (view, insets) -> {
            Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            Log.d(TAG, "Insets received - top: " + systemBars.top + " bottom: " + systemBars.bottom
                    + " left: " + systemBars.left + " right: " + systemBars.right);

            // setPadding() on a WebView is known to be unreliable for its
            // actual rendered web content - confirmed here by real,
            // correct inset values being received and applied via padding,
            // with zero visible effect. Chromium's own compositing can
            // size the page to the WebView's full measured bounds
            // regardless of padding. Margin actually changes how much
            // screen space the WebView itself occupies, which reliably
            // affects what the page renders into.
            ViewGroup.LayoutParams params = webView.getLayoutParams();
            if (params instanceof ViewGroup.MarginLayoutParams) {
                ViewGroup.MarginLayoutParams marginParams = (ViewGroup.MarginLayoutParams) params;
                marginParams.topMargin = systemBars.top;
                marginParams.bottomMargin = systemBars.bottom;
                marginParams.leftMargin = systemBars.left;
                marginParams.rightMargin = systemBars.right;
                webView.setLayoutParams(marginParams);
                Log.d(TAG, "Margin applied successfully to WebView");
            } else {
                Log.d(TAG, "WebView's LayoutParams is not margin-capable: " + params.getClass().getName());
            }

            return insets;
        });

        ViewCompat.requestApplyInsets(rootView);
    }
}
