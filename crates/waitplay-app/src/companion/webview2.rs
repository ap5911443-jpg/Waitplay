//! Browser-engine services beyond what wry exposes: freezing a hidden page ("sleeping tab"), muting, and the browser process id
//! (so the whole WebView2 tree can be trimmed). Windows implements them over WebView2; elsewhere they are neutral.

use wry::WebView;

#[cfg(windows)]
mod imp {
    use super::WebView;
    use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2_3, ICoreWebView2_8};
    use webview2_com::TrySuspendCompletedHandler;
    use windows::core::Interface;
    use wry::{MemoryUsageLevel, WebViewExtWindows};

    pub fn browser_pid(wv: &WebView) -> u32 {
        let mut pid = 0u32;
        unsafe {
            let _ = wv.webview().BrowserProcessId(&mut pid);
        }
        pid
    }

    pub fn set_muted(wv: &WebView, muted: bool) {
        if let Ok(w8) = wv.webview().cast::<ICoreWebView2_8>() {
            unsafe {
                let _ = w8.SetIsMuted(muted);
            }
        }
    }

    pub fn set_low_memory(wv: &WebView, low: bool) {
        let _ = wv.set_memory_usage_level(if low { MemoryUsageLevel::Low } else { MemoryUsageLevel::Normal });
    }

    /// Freezes the page: no script, no timers, caches dropped. `done(true)` when the freeze took effect. The page must already be
    /// hidden (`WebView::set_visible(false)`), WebView2 refuses to suspend a visible one.
    pub fn try_suspend(wv: &WebView, done: impl FnOnce(bool) + 'static) {
        let Ok(w3) = wv.webview().cast::<ICoreWebView2_3>() else {
            done(false);
            return;
        };
        let cell = std::rc::Rc::new(std::cell::RefCell::new(Some(done)));
        let cell2 = cell.clone();
        let handler = TrySuspendCompletedHandler::create(Box::new(move |_hr, ok| {
            if let Some(d) = cell2.borrow_mut().take() {
                d(ok);
            }
            Ok(())
        }));
        if unsafe { w3.TrySuspend(&handler) }.is_err() {
            if let Some(d) = cell.borrow_mut().take() {
                d(false);
            }
        }
    }

    pub fn resume(wv: &WebView) {
        if let Ok(w3) = wv.webview().cast::<ICoreWebView2_3>() {
            unsafe {
                let _ = w3.Resume();
            }
        }
    }

    /// Trims what the browser does in the background (update checks, telemetry pings, translate, media-router, hint downloads) and keeps
    /// wry's own defaults. Header and site webviews share one browser process, so they MUST get the same string.
    pub fn tune(builder: wry::WebViewBuilder<'_>) -> wry::WebViewBuilder<'_> {
        use wry::WebViewBuilderExtWindows;
        builder.with_additional_browser_args(
            "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,Translate,OptimizationHints,MediaRouter \
             --autoplay-policy=no-user-gesture-required --disable-background-networking --disable-component-update --disable-breakpad --no-pings",
        )
    }
}

#[cfg(not(windows))]
mod imp {
    use super::WebView;

    pub fn browser_pid(_wv: &WebView) -> u32 {
        0
    }
    pub fn set_muted(_wv: &WebView, _muted: bool) {}
    pub fn set_low_memory(_wv: &WebView, _low: bool) {}
    pub fn try_suspend(_wv: &WebView, done: impl FnOnce(bool) + 'static) {
        done(false)
    }
    pub fn resume(_wv: &WebView) {}
    pub fn tune(builder: wry::WebViewBuilder<'_>) -> wry::WebViewBuilder<'_> {
        builder
    }
}

pub use imp::*;
