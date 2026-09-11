package app.tsvaga.twa;

import android.os.Bundle;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
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
        // engine reports, and independent of the Capacitor config option
        // for this behaving as expected in this specific version.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        ViewCompat.setOnApplyWindowInsetsListener(getBridge().getWebView(), (view, insets) -> {
            Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            view.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom);
            return insets;
        });
    }
}
