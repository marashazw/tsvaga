package app.tsvaga.twa;

import android.os.Bundle;
import android.util.Log;
import android.view.View;
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
            webView.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom);
            return insets;
        });

        ViewCompat.requestApplyInsets(rootView);
    }
}
