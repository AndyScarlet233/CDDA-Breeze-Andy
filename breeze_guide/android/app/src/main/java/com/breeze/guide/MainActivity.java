package com.breeze.guide;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate( Bundle savedInstanceState ) {
        super.onCreate( savedInstanceState );

        getOnBackPressedDispatcher().addCallback( this, new OnBackPressedCallback( true ) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge() == null ? null : getBridge().getWebView();
                if( webView != null && webView.canGoBack() ) {
                    webView.goBack();
                }
                // At the guide home page, Back is intentionally ignored.
                // This prevents an accidental single press from exiting the app.
            }
        } );
    }
}
