using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shapes;
using System.Windows.Threading;
using System.Collections;
using System.Threading;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using System.Windows.Interop;
using System.Diagnostics;
using System.Text;
using Microsoft.Web.WebView2.Wpf;
using Microsoft.Web.WebView2.Core;
namespace WaitPlayNative {
    public class CardModel {
        public int Id { get; set; }
        public string Symbol { get; set; }
        public bool IsFlipped { get; set; }
        public bool IsMatched { get; set; }
        public Button Element { get; set; }
        public TextBlock TextElement { get; set; }
    }

    public class MainWindow : Window {
        private const int BRIDGE_PORT = 3150;

        // Wispr Flow Design Tokens from design.md
        private static readonly Color CanvasColor = Color.FromRgb(255, 255, 235);        // #FFFFEB Warm cream canvas
        private static readonly Color CanvasMutedColor = Color.FromRgb(244, 244, 226);   // #F4F4E2 Subtle panel contrast
        private static readonly Color CanvasBorderColor = Color.FromRgb(228, 228, 208);  // #E4E4D0 Muted cream border
        private static readonly Color InkColor = Color.FromRgb(26, 26, 26);              // #1A1A1A Main high-contrast text
        private static readonly Color InkSoftColor = Color.FromRgb(102, 102, 102);       // #666666 Supporting text
        private static readonly Color InkMutedColor = Color.FromRgb(150, 150, 130);      // #969682 Subtle captions & question marks
        private static readonly Color ForestColor = Color.FromRgb(3, 79, 70);            // #034F46 Deep forest accent
        private static readonly Color ForestSoftColor = Color.FromRgb(99, 144, 133);     // #639085 Soft teal/green
        private static readonly Color LavenderColor = Color.FromRgb(240, 215, 255);      // #F0D7FF Primary CTA & flipped card
        private static readonly Color OrangeColor = Color.FromRgb(255, 169, 70);         // #FFA946 Warm accent
        private static readonly Color CardBgColor = Color.FromRgb(255, 255, 255);        // #FFFFFF Pure white card
        private static readonly Color CardBorderColor = Color.FromRgb(220, 220, 200);    // Thin border

        private static ControlTemplate CreateRoundedButtonTemplate(CornerRadius radius) {
            var template = new ControlTemplate(typeof(Button));
            var borderFactory = new FrameworkElementFactory(typeof(Border));
            borderFactory.Name = "border";
            borderFactory.SetValue(Border.CornerRadiusProperty, radius);
            borderFactory.SetValue(Border.BackgroundProperty, new TemplateBindingExtension(Button.BackgroundProperty));
            borderFactory.SetValue(Border.BorderBrushProperty, new TemplateBindingExtension(Button.BorderBrushProperty));
            borderFactory.SetValue(Border.BorderThicknessProperty, new TemplateBindingExtension(Button.BorderThicknessProperty));

            var cp = new FrameworkElementFactory(typeof(ContentPresenter));
            cp.SetValue(ContentPresenter.HorizontalAlignmentProperty, HorizontalAlignment.Center);
            cp.SetValue(ContentPresenter.VerticalAlignmentProperty, VerticalAlignment.Center);
            borderFactory.AppendChild(cp);

            template.VisualTree = borderFactory;
            return template;
        }

        private string[] EMOJIS = new string[] {
            "\uD83D\uDE80", // 🚀
            "\u26A1",       // ⚡
            "\uD83D\uDCBB", // 💻
            "\uD83E\uDDE0", // 🧠
            "\uD83C\uDFAF", // 🎯
            "\uD83D\uDD25", // 🔥
            "\uD83D\uDC8E", // 💎
            "\uD83D\uDEE1"  // 🛡️
        };
        private List<CardModel> cards = new List<CardModel>();
        private CardModel firstCard = null;
        private CardModel secondCard = null;
        private bool isChecking = false;

        private int score = 0;
        private int matchesFound = 0;
        private int moves = 0;
        private int elapsedSeconds = 0;

        private TextBlock statusPillText;
        private Border statusPill;
        private Ellipse statusDot;
        private TextBlock timerText;
        private TextBlock scoreText;
        private TextBlock matchesText;
        private UniformGrid cardGrid;
        private Border bannerBorder;
        private TextBlock bannerTitle;
        private TextBlock bannerSubtitle;
        private TextBlock countdownText;
        private int countdownRemaining = 8;

        private DispatcherTimer gameTimer;
        private DispatcherTimer statusPollTimer;
        private DispatcherTimer pulseTimer;
        private bool dotState = false;
        private string activeAgentName = "AI Agent";
        private Button btnExit;
        private TextBlock hintText;
        private string targetSessionId = "";
        private string terminalLabel = "";
        private long currentPromptTimestamp = 0;
        private Border terminalPill;
        private TextBlock terminalText;
        private IntPtr myHwnd = IntPtr.Zero;
        // Widget-launched windows (no session) follow the window that was in front when they opened
        private IntPtr desktopParent = IntPtr.Zero;
        private DateTime awaySince = DateTime.MinValue;   // when the user left every owning tab
        private bool autoCloseArmed = false;
        private bool hiddenAway = false;                  // hidden while the user is in another tab/app

        // ── Multi-terminal session registry (UI thread only) ─────────────────────
        // One companion process serves every terminal. Each prompt registers its session together
        // with the terminal tab it came from. The window is shown only while the focused tab belongs
        // to a session that is still working, hidden while the user is elsewhere, and closed as soon
        // as no session is left working.
        private sealed class AgentSession {
            public string Id;
            public string Terminal;
            public IntPtr Hwnd;          // terminal's top-level window
            public bool? OnOwnTab;       // latest poll: true / false, null = unknown (no tab strip)
            public bool Finished;        // turn ended, or the user stepped aside for this prompt
            public long StartedAt;       // launch time; older close signals belong to earlier turns
        }
        private readonly Dictionary<string, AgentSession> sessions = new Dictionary<string, AgentSession>(StringComparer.OrdinalIgnoreCase);
        private string ownerId = null;   // session whose tab is currently in front
        private SignalPoller poller;
        private TerminalInputWatcher inputWatcher;
        private Microsoft.Web.WebView2.Wpf.WebView2 webView;
        private DispatcherTimer webReadyTimer;
        private const int WEB_PORT = 5200;
        private const string HOME_URL = "https://www.instagram.com/";
        private const string YT_URL = "https://www.youtube.com/";
        private const string X_URL = "https://x.com/home";
        internal static string StartUrl = null;
        // Set by EntryPoint for the single-instance companion. Windows created inside the widget
        // process (Games button) must not consume launch/close files meant for the companion.
        internal static bool OwnsSignalFiles = false;
        private TextBox addressBar;
        private Button btnBack;
        private Button btnForward;
        private bool isFullscreen = false;
        private Rect savedBounds;

        public MainWindow(string sessionId = "", long promptTime = 0, string terminal = "", uint parentPid = 0, IntPtr parentHwnd = default(IntPtr)) {
            this.targetSessionId = sessionId;
            this.currentPromptTimestamp = promptTime;
            this.terminalLabel = terminal;

            if (string.IsNullOrEmpty(this.terminalLabel) && !string.IsNullOrEmpty(sessionId) && sessionId.Contains("term")) {
                var match = System.Text.RegularExpressions.Regex.Match(sessionId, @"\d+");
                if (match.Success) {
                    this.terminalLabel = "Term - " + match.Value;
                }
            }
            if (!string.IsNullOrEmpty(sessionId)) {
                this.activeAgentName = GetAgentDisplayName(sessionId);
            } else {
                this.activeAgentName = DetectActiveAgent();
            }

            desktopParent = ParentWindowTracker.GetForegroundWindow();
            if (IsWaitPlayWindow(desktopParent)) desktopParent = IntPtr.Zero;

            InitializeWindow();
            BuildUI();

            inputWatcher = new TerminalInputWatcher();
            inputWatcher.Interacted += () => Dispatcher.BeginInvoke(new Action(OnTerminalInteraction));
            poller = new SignalPoller(this);
            if (!string.IsNullOrEmpty(sessionId) && terminal != "Desktop") {
                IntPtr launchHwnd = parentHwnd != IntPtr.Zero ? parentHwnd : desktopParent;
                poller.Enqueue(new LaunchRequest { SessionId = sessionId, Terminal = terminalLabel, Ts = NowMs(), Hwnd = launchHwnd });
                Loaded += (s, e) => KeepClearOfTabRow(launchHwnd);   // before the first frame, so it doesn't jump later
            }
            Closed += (s, e) => { poller.Dispose(); inputWatcher.Dispose(); };
            StartMonitoring();

            // Give the window a moment to appear before visibility rules apply
            var armTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
            armTimer.Tick += (s, e) => { armTimer.Stop(); autoCloseArmed = true; };
            armTimer.Start();
        }

        private static long NowMs() { return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(); }

        private void HideWhileAway() {
            hiddenAway = true;
            inputWatcher.Target = IntPtr.Zero;
            SetMuted(true);    // a playing reel shouldn't keep talking from an invisible window
            Hide();
        }
        private void ShowAfterAway() {
            hiddenAway = false;
            awaySince = DateTime.MinValue;
            ShowActivated = false;   // reappear beside the terminal without stealing its keyboard focus
            Show();
            Topmost = true;
            SetMuted(false);
        }
        private void SetMuted(bool muted) {
            try { if (webView != null && webView.CoreWebView2 != null) webView.CoreWebView2.IsMuted = muted; } catch {}
        }

        // Our own process or a sibling WaitPlay (the widget) holding focus doesn't count as leaving.
        // Cached per window: this runs every tick and process lookups aren't free.
        private IntPtr lastCheckedFg = IntPtr.Zero;
        private bool lastCheckedFgIsWaitPlay = false;
        private bool IsWaitPlayWindowCached(IntPtr hwnd) {
            if (hwnd != lastCheckedFg) { lastCheckedFg = hwnd; lastCheckedFgIsWaitPlay = IsWaitPlayWindow(hwnd); }
            return lastCheckedFgIsWaitPlay;
        }
        private static bool IsWaitPlayWindow(IntPtr hwnd) {
            if (hwnd == IntPtr.Zero) return false;
            uint pid;
            ParentWindowTracker.GetWindowThreadProcessId(hwnd, out pid);
            var self = System.Diagnostics.Process.GetCurrentProcess();
            if (pid == (uint)self.Id) return true;
            try { return System.Diagnostics.Process.GetProcessById((int)pid).ProcessName == self.ProcessName; } catch { return false; }
        }

        public static string DetectActiveAgent() {
            try {
                string userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);

                // 1. OMP
                string ompDir = System.IO.Path.Combine(userProfile, ".omp", "agent", "sessions", "-tmp");
                DateTime ompLastModified = DateTime.MinValue;
                if (System.IO.Directory.Exists(ompDir)) {
                    var files = System.IO.Directory.GetFiles(ompDir, "*.jsonl");
                    foreach (var f in files) {
                        var fi = new System.IO.FileInfo(f);
                        if (fi.LastWriteTime > ompLastModified) {
                            ompLastModified = fi.LastWriteTime;
                        }
                    }
                }

                // 2. Codex / ChatGPT
                string codexDb = System.IO.Path.Combine(userProfile, ".codex", "logs_2.sqlite");
                DateTime codexLastModified = DateTime.MinValue;
                if (System.IO.File.Exists(codexDb)) {
                    var fi = new System.IO.FileInfo(codexDb);
                    codexLastModified = fi.LastWriteTime;
                }

                // 3. OpenCode
                string opencodeDb = System.IO.Path.Combine(userProfile, ".local", "share", "opencode", "opencode.db");
                DateTime opencodeLastModified = DateTime.MinValue;
                if (System.IO.File.Exists(opencodeDb)) {
                    var fi = new System.IO.FileInfo(opencodeDb);
                    opencodeLastModified = fi.LastWriteTime;
                }
                // 4. Cline
                string clineDb = System.IO.Path.Combine(userProfile, ".cline", "data", "db", "sessions.db");
                DateTime clineLastModified = DateTime.MinValue;
                if (System.IO.File.Exists(clineDb)) {
                    var fi = new System.IO.FileInfo(clineDb);
                    clineLastModified = fi.LastWriteTime;
                }

                DateTime mostRecent = DateTime.MinValue;
                string winner = "AI Agent";

                if (ompLastModified > mostRecent && (DateTime.Now - ompLastModified).TotalMinutes < 15) {
                    mostRecent = ompLastModified;
                    winner = "OMP";
                }
                if (codexLastModified > mostRecent && (DateTime.Now - codexLastModified).TotalMinutes < 15) {
                    mostRecent = codexLastModified;
                    winner = "ChatGPT";
                }
                if (opencodeLastModified > mostRecent && (DateTime.Now - opencodeLastModified).TotalMinutes < 15) {
                    mostRecent = opencodeLastModified;
                    winner = "OpenCode";
                }
                if (clineLastModified > mostRecent && (DateTime.Now - clineLastModified).TotalMinutes < 15) {
                    mostRecent = clineLastModified;
                    winner = "Cline";
                }

                return winner;
            } catch {}
            return "AI Agent";
        }

        private void InitializeWindow() {
            Title = "WaitPlay";

            // Centred, large enough that the site's desktop layout fits without scrolling sideways
            Rect wa = SystemParameters.WorkArea;
            Width = Math.Max(480, Math.Min(1400, wa.Width * 0.70));
            Height = Math.Max(420, Math.Min(950, wa.Height * 0.82));
            MinWidth = 360;
            MinHeight = 320;

            WindowStartupLocation = WindowStartupLocation.Manual;
            Left = wa.Left + (wa.Width - Width) / 2;
            Top = wa.Top + (wa.Height - Height) / 2;

            Background = new SolidColorBrush(Color.FromRgb(0, 0, 0));
            Foreground = new SolidColorBrush(InkColor);
            Topmost = true;
            WindowStyle = WindowStyle.None;
            ResizeMode = ResizeMode.CanResizeWithGrip;
            AllowsTransparency = false;
            BorderBrush = new SolidColorBrush(Color.FromRgb(60, 60, 68));
            BorderThickness = new Thickness(1);
            SourceInitialized += (s, e) => {
                try { myHwnd = new WindowInteropHelper(this).Handle; } catch {}
            };
            KeyDown += (s, e) => {
                if (e.Key == Key.Escape) { DismissAll(); Close(); }
            };
        }

        private void BuildUI() {
            var rootGrid = new Grid();
            rootGrid.Background = new SolidColorBrush(Color.FromRgb(0, 0, 0));
            rootGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(34) }); // Top bar
            rootGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(56) }); // Stats bar
            rootGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) }); // Cards
            rootGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(38) }); // Footer

            // Drag window on header click
            var header = new Border {
                Background = new SolidColorBrush(CanvasColor),
                BorderBrush = new SolidColorBrush(CanvasBorderColor),
                BorderThickness = new Thickness(0, 0, 0, 1),
                Padding = new Thickness(16, 0, 14, 0)
            };
            header.MouseLeftButtonDown += (s, e) => {
                if (e.ButtonState == MouseButtonState.Pressed) DragMove();
            };

            var headerPanel = new DockPanel();

            // Left branding
            var brandPanel = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
            var iconBox = new Border {
                Width = 26,
                Height = 26,
                CornerRadius = new CornerRadius(7),
                Background = new SolidColorBrush(ForestColor),
                Margin = new Thickness(0, 0, 10, 0),
                VerticalAlignment = VerticalAlignment.Center
            };
            var gameIcon = new TextBlock {
                Text = "\uD83C\uDFA7", // 🎧
                FontSize = 14,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
            iconBox.Child = gameIcon;

            var appTitle = new TextBlock {
                Text = "WaitPlay",
                FontFamily = new FontFamily("EB Garamond, Georgia, serif"),
                FontWeight = FontWeights.Normal,
                FontSize = 19,
                Foreground = new SolidColorBrush(InkColor),
                VerticalAlignment = VerticalAlignment.Center
            };
            var appSub = new TextBlock {
                Text = " \u2022 Companion Game",
                FontFamily = new FontFamily("Figtree, Segoe UI, sans-serif"),
                FontSize = 12,
                Foreground = new SolidColorBrush(InkSoftColor),
                VerticalAlignment = VerticalAlignment.Center
            };
            brandPanel.Children.Add(iconBox);
            brandPanel.Children.Add(appTitle);
            brandPanel.Children.Add(appSub);
            DockPanel.SetDock(brandPanel, Dock.Left);
            headerPanel.Children.Add(brandPanel);

            // Right window controls
            var controlsPanel = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };

            var btnMin = new Button {
                Content = "\u2014",
                Width = 28,
                Height = 26,
                Background = Brushes.Transparent,
                Foreground = new SolidColorBrush(InkSoftColor),
                BorderThickness = new Thickness(0),
                FontSize = 12,
                Cursor = Cursors.Hand,
                Margin = new Thickness(0, 0, 4, 0)
            };
            btnMin.Click += (s, e) => { WindowState = WindowState.Minimized; };

            var btnClose = new Button {
                Content = "\u2715",
                Width = 28,
                Height = 26,
                Background = Brushes.Transparent,
                Foreground = new SolidColorBrush(InkSoftColor),
                BorderThickness = new Thickness(0),
                FontSize = 13,
                FontWeight = FontWeights.Bold,
                Cursor = Cursors.Hand
            };
            btnClose.MouseEnter += (s, e) => {
                btnClose.Foreground = new SolidColorBrush(Color.FromRgb(220, 38, 38));
            };
            btnClose.MouseLeave += (s, e) => {
                btnClose.Foreground = new SolidColorBrush(InkSoftColor);
            };
            btnClose.Click += (s, e) => { DismissAll(); Close(); };

            controlsPanel.Children.Add(btnMin);
            controlsPanel.Children.Add(btnClose);
            DockPanel.SetDock(controlsPanel, Dock.Right);
            headerPanel.Children.Add(controlsPanel);

            header.Child = headerPanel;
            Grid.SetRow(header, 0);
            rootGrid.Children.Add(header);

            // Row 1: Telemetry & Stats Bar
            var statsBar = new Border {
                Background = new SolidColorBrush(CanvasMutedColor),
                BorderBrush = new SolidColorBrush(CanvasBorderColor),
                BorderThickness = new Thickness(0, 0, 0, 1),
                Padding = new Thickness(16, 8, 16, 8)
            };
            var statsPanel = new DockPanel();

            // Container for Status Pill + Terminal Tab Badge
            var statusContainer = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };

            // Status Pill (Forest tint from design.md)
            statusPill = new Border {
                CornerRadius = new CornerRadius(12),
                Background = new SolidColorBrush(Color.FromArgb(28, 3, 79, 70)),
                BorderBrush = new SolidColorBrush(Color.FromArgb(80, 3, 79, 70)),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(10, 4, 12, 4),
                VerticalAlignment = VerticalAlignment.Center
            };
            var pillContent = new StackPanel { Orientation = Orientation.Horizontal };
            statusDot = new Ellipse {
                Width = 8,
                Height = 8,
                Fill = new SolidColorBrush(ForestColor),
                Margin = new Thickness(0, 0, 6, 0),
                VerticalAlignment = VerticalAlignment.Center
            };
            string initialPill = (activeAgentName == "ChatGPT")
                ? "ChatGPT is Reasoning..."
                : (activeAgentName == "OMP")
                    ? "OMP \u2022 Gemini 3.8 Flash"
                    : (activeAgentName == "OpenCode")
                        ? "OpenCode \u2022 GLM 5.3 Flash"
                        : (activeAgentName == "Cline")
                            ? "Cline \u2022 Claude 3.7 Sonnet"
                            : string.Format("{0} is Working...", activeAgentName);
            statusPillText = new TextBlock {
                Text = initialPill,
                FontFamily = new FontFamily("Figtree, Segoe UI, sans-serif"),
                FontSize = 11,
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(ForestColor),
                VerticalAlignment = VerticalAlignment.Center
            };
            pillContent.Children.Add(statusDot);
            pillContent.Children.Add(statusPillText);
            statusPill.Child = pillContent;
            statusContainer.Children.Add(statusPill);

            // Terminal Tab Badge directly to the right of Status Pill
            terminalPill = new Border {
                CornerRadius = new CornerRadius(10),
                Background = new SolidColorBrush(CardBgColor),
                BorderBrush = new SolidColorBrush(CanvasBorderColor),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(8, 3, 8, 3),
                Margin = new Thickness(8, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Center,
                Visibility = !string.IsNullOrEmpty(terminalLabel) ? Visibility.Visible : Visibility.Collapsed
            };
            terminalText = new TextBlock {
                Text = !string.IsNullOrEmpty(terminalLabel) ? terminalLabel : "Term - 1",
                FontFamily = new FontFamily("Figtree, Segoe UI, sans-serif"),
                FontSize = 11,
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(InkColor),
                VerticalAlignment = VerticalAlignment.Center
            };
            terminalPill.Child = terminalText;
            statusContainer.Children.Add(terminalPill);

            DockPanel.SetDock(statusContainer, Dock.Left);
            statsPanel.Children.Add(statusContainer);

            // Metrics (Score, Matches, Timer)
            var metricsPanel = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Center };

            timerText = new TextBlock {
                Text = "\u23F1 0:00",
                FontFamily = new FontFamily("Figtree, Segoe UI, sans-serif"),
                FontSize = 12,
                Foreground = new SolidColorBrush(InkSoftColor),
                Margin = new Thickness(0, 0, 16, 0),
                VerticalAlignment = VerticalAlignment.Center
            };
            scoreText = new TextBlock {
                Text = "\u2B50 0 pts",
                FontFamily = new FontFamily("Figtree, Segoe UI, sans-serif"),
                FontSize = 12,
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(Color.FromRgb(217, 119, 6)),
                Margin = new Thickness(0, 0, 16, 0),
                VerticalAlignment = VerticalAlignment.Center
            };
            matchesText = new TextBlock {
                Text = "\uD83C\uDCCF 0/8",
                FontFamily = new FontFamily("Figtree, Segoe UI, sans-serif"),
                FontSize = 12,
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(ForestColor),
                VerticalAlignment = VerticalAlignment.Center
            };

            metricsPanel.Children.Add(timerText);
            metricsPanel.Children.Add(scoreText);
            metricsPanel.Children.Add(matchesText);
            DockPanel.SetDock(metricsPanel, Dock.Right);
            statsPanel.Children.Add(metricsPanel);

            statsBar.Child = statsPanel;
            Grid.SetRow(statsBar, 1);
            rootGrid.Children.Add(statsBar);
            statsBar.Visibility = Visibility.Hidden;

            // Row 2: 4x4 Cards Grid
            var cardsContainer = new Grid {
                Margin = new Thickness(16, 16, 16, 16),
                Background = new SolidColorBrush(CanvasColor)
            };
            cardGrid = new UniformGrid {
                Rows = 4,
                Columns = 4,
                HorizontalAlignment = HorizontalAlignment.Stretch,
                VerticalAlignment = VerticalAlignment.Stretch
            };
            cardsContainer.Children.Add(cardGrid);

            // Overlay banner for win / completed notification
            bannerBorder = new Border {
                Background = new SolidColorBrush(Color.FromArgb(248, 255, 255, 245)),
                CornerRadius = new CornerRadius(20),
                BorderBrush = new SolidColorBrush(ForestColor),
                BorderThickness = new Thickness(2),
                Padding = new Thickness(28),
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Visibility = Visibility.Collapsed
            };
            var bannerContent = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
            bannerTitle = new TextBlock {
                Text = "\uD83C\uDF89 Agent Work is Done!",
                FontFamily = new FontFamily("EB Garamond, Georgia, serif"),
                FontSize = 24,
                FontWeight = FontWeights.Normal,
                Foreground = new SolidColorBrush(ForestColor),
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 0, 0, 8)
            };
            bannerSubtitle = new TextBlock {
                Text = "Want to keep playing or quit?",
                FontFamily = new FontFamily("Figtree, Segoe UI, sans-serif"),
                FontSize = 14,
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(InkColor),
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 0, 0, 6)
            };
            countdownText = new TextBlock {
                Text = "Score: 0 pts \u2022 Press Enter to Quit or click Keep Playing",
                FontFamily = new FontFamily("Figtree, Segoe UI, sans-serif"),
                FontSize = 11,
                Foreground = new SolidColorBrush(InkSoftColor),
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 0, 0, 16)
            };
            var bannerBtnRow = new StackPanel {
                Orientation = Orientation.Horizontal,
                HorizontalAlignment = HorizontalAlignment.Center
            };
            btnExit = new Button {
                Content = "Quit to Terminal",
                FontFamily = new FontFamily("Figtree, Segoe UI, sans-serif"),
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(InkColor),
                Background = new SolidColorBrush(LavenderColor),
                BorderBrush = new SolidColorBrush(Color.FromArgb(60, 26, 26, 26)),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(20, 10, 20, 10),
                Cursor = Cursors.Hand,
                Template = CreateRoundedButtonTemplate(new CornerRadius(10))
            };
            btnExit.Click += (s, e) => Close();
            var btnKeepPlaying = new Button {
                Content = "Keep Playing \uD83C\uDFAE",
                FontFamily = new FontFamily("Figtree, Segoe UI, sans-serif"),
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(ForestColor),
                Background = new SolidColorBrush(CardBgColor),
                BorderBrush = new SolidColorBrush(CanvasBorderColor),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(18, 10, 18, 10),
                Margin = new Thickness(12, 0, 0, 0),
                Cursor = Cursors.Hand,
                Template = CreateRoundedButtonTemplate(new CornerRadius(10))
            };
            btnKeepPlaying.Click += (s, e) => {
                bannerBorder.Visibility = Visibility.Collapsed;
                if (webView != null) { try { webView.Visibility = Visibility.Visible; } catch {} }
            };
            bannerBtnRow.Children.Add(btnExit);
            bannerBtnRow.Children.Add(btnKeepPlaying);
            bannerContent.Children.Add(bannerTitle);
            bannerContent.Children.Add(bannerSubtitle);
            bannerContent.Children.Add(countdownText);
            bannerContent.Children.Add(bannerBtnRow);
            bannerBorder.Child = bannerContent;
            cardsContainer.Children.Add(bannerBorder);

            Grid.SetRow(cardsContainer, 2);
            rootGrid.Children.Add(cardsContainer);
            cardsContainer.Visibility = Visibility.Hidden;

            // Row 3: Footer hints
            var footer = new Border {
                Background = new SolidColorBrush(CanvasMutedColor),
                BorderBrush = new SolidColorBrush(CanvasBorderColor),
                BorderThickness = new Thickness(0, 1, 0, 0),
                Padding = new Thickness(16, 0, 16, 0)
            };
            var footerPanel = new DockPanel();
            hintText = new TextBlock {
                Text = "Match all pairs before your coding agent finishes \u2022 Automatically closes on turn end",
                FontFamily = new FontFamily("Figtree, Segoe UI, sans-serif"),
                FontSize = 10.5,
                Foreground = new SolidColorBrush(InkSoftColor),
                VerticalAlignment = VerticalAlignment.Center
            };
            DockPanel.SetDock(hintText, Dock.Left);
            footerPanel.Children.Add(hintText);

            var restartBtn = new Button {
                Content = "\u21BB Restart",
                FontFamily = new FontFamily("Figtree, Segoe UI, sans-serif"),
                FontSize = 11,
                FontWeight = FontWeights.Medium,
                Foreground = new SolidColorBrush(InkColor),
                Background = Brushes.Transparent,
                BorderThickness = new Thickness(0),
                Cursor = Cursors.Hand,
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Right,
                Padding = new Thickness(6, 3, 6, 3)
            };
            restartBtn.Click += (s, e) => StartGame();
            DockPanel.SetDock(restartBtn, Dock.Right);
            footerPanel.Children.Add(restartBtn);

            footer.Child = footerPanel;
            Grid.SetRow(footer, 3);
            rootGrid.Children.Add(footer);
            footer.Visibility = Visibility.Hidden;

            // Browser experience: the WebView2 (Chromium/Edge) fills the whole
            // window and loads the real Instagram site — no toolbar chrome.
            try {
                webView = new Microsoft.Web.WebView2.Wpf.WebView2();
                string udf = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "waitplay", "webview2");
                try { System.IO.Directory.CreateDirectory(udf); } catch {}
                webView.CreationProperties = new Microsoft.Web.WebView2.Wpf.CoreWebView2CreationProperties { UserDataFolder = udf };
                Grid.SetRow(webView, 1);
                Grid.SetRowSpan(webView, 3);
                Panel.SetZIndex(webView, 50);
                rootGrid.Children.Add(webView);
                BuildTopBar(rootGrid);
                webView.SourceChanged += (s, e) => UpdateAddress();
                webView.NavigationCompleted += (s, e) => UpdateNavButtons();
                webView.CoreWebView2InitializationCompleted += (s, e) => {
                    if (e.IsSuccess && webView.CoreWebView2 != null) {
                        try {
                            // Open popups (Facebook login, 2FA / security checkpoint)
                            // in-place instead of dropping them, so login completes.
                            webView.CoreWebView2.NewWindowRequested += (s2, e2) => {
                                e2.Handled = true;
                                try { webView.CoreWebView2.Navigate(e2.Uri); } catch {}
                            };
                        } catch {}
                    }
                };
                try { webView.Source = new Uri(string.IsNullOrEmpty(StartUrl) ? HOME_URL : StartUrl); } catch {}
            } catch {}

            Content = rootGrid;

            // Pulsing dot timer
            pulseTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(500) };
            pulseTimer.Tick += (s, e) => {
                dotState = !dotState;
                statusDot.Opacity = dotState ? 1.0 : 0.3;
            };
            pulseTimer.Start();
        }

        private void StartGame() {
            cards.Clear();
            cardGrid.Children.Clear();
            firstCard = null;
            secondCard = null;
            isChecking = false;
            score = 0;
            matchesFound = 0;
            moves = 0;
            elapsedSeconds = 0;
            bannerBorder.Visibility = Visibility.Collapsed;

            UpdateUIStats();

            // Prepare pairs
            var symbols = new List<string>();
            foreach (var emoji in EMOJIS) {
                symbols.Add(emoji);
                symbols.Add(emoji);
            }

            // Shuffle
            var rng = new Random();
            for (int i = symbols.Count - 1; i > 0; i--) {
                int k = rng.Next(i + 1);
                string temp = symbols[i];
                symbols[i] = symbols[k];
                symbols[k] = temp;
            }

            // Create cards
            for (int i = 0; i < symbols.Count; i++) {
                var card = new CardModel {
                    Id = i,
                    Symbol = symbols[i],
                    IsFlipped = false,
                    IsMatched = false
                };

                var btn = new Button {
                    Margin = new Thickness(4),
                    Background = new SolidColorBrush(CardBgColor),
                    BorderBrush = new SolidColorBrush(CardBorderColor),
                    BorderThickness = new Thickness(1.5),
                    Cursor = Cursors.Hand,
                    Tag = card,
                    Template = CreateRoundedButtonTemplate(new CornerRadius(12))
                };

                btn.MouseEnter += (s, e) => {
                    var c = (s as Button).Tag as CardModel;
                    if (c != null && !c.IsFlipped && !c.IsMatched) {
                        (s as Button).BorderBrush = new SolidColorBrush(ForestSoftColor);
                    }
                };
                btn.MouseLeave += (s, e) => {
                    var c = (s as Button).Tag as CardModel;
                    if (c != null && !c.IsFlipped && !c.IsMatched) {
                        (s as Button).BorderBrush = new SolidColorBrush(CardBorderColor);
                    }
                };

                var txt = new TextBlock {
                    Text = "?",
                    FontFamily = new FontFamily("EB Garamond, Georgia, serif"),
                    FontSize = 32,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                    Foreground = new SolidColorBrush(InkMutedColor)
                };

                btn.Content = txt;
                btn.Click += OnCardClicked;

                card.Element = btn;
                card.TextElement = txt;
                cards.Add(card);
                cardGrid.Children.Add(btn);
            }

            // Game elapsed timer
            if (gameTimer != null) gameTimer.Stop();
            gameTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
            gameTimer.Tick += (s, e) => {
                elapsedSeconds++;
                timerText.Text = string.Format("\u23F1 {0}:{1:D2}", elapsedSeconds / 60, elapsedSeconds % 60);
            };
            gameTimer.Start();
        }

        private void OnCardClicked(object sender, RoutedEventArgs e) {
            if (isChecking) return;

            var btn = sender as Button;
            var card = btn.Tag as CardModel;

            if (card == null || card.IsFlipped || card.IsMatched) return;

            // Flip card
            FlipCard(card, true);

            if (firstCard == null) {
                firstCard = card;
            } else if (secondCard == null) {
                secondCard = card;
                moves++;
                isChecking = true;

                // Check match
                if (firstCard.Symbol == secondCard.Symbol) {
                    // Match found!
                    firstCard.IsMatched = true;
                    secondCard.IsMatched = true;
                    matchesFound++;
                    score += 100;
                    UpdateUIStats();

                    // Flash green
                    // Soft sage/forest match highlight from design.md
                    firstCard.Element.Background = new SolidColorBrush(Color.FromRgb(220, 240, 235));
                    secondCard.Element.Background = new SolidColorBrush(Color.FromRgb(220, 240, 235));
                    firstCard.Element.BorderBrush = new SolidColorBrush(ForestColor);
                    secondCard.Element.BorderBrush = new SolidColorBrush(ForestColor);

                    firstCard = null;
                    secondCard = null;
                    isChecking = false;

                    if (matchesFound >= 8) {
                        OnAllCardsMatched();
                    }
                } else {
                    // Mismatch
                    score = Math.Max(0, score - 15);
                    UpdateUIStats();

                    var flipBackTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(650) };
                    flipBackTimer.Tick += (s2, e2) => {
                        flipBackTimer.Stop();
                        if (firstCard != null) FlipCard(firstCard, false);
                        if (secondCard != null) FlipCard(secondCard, false);
                        firstCard = null;
                        secondCard = null;
                        isChecking = false;
                    };
                    flipBackTimer.Start();
                }
            }
        }

        private void FlipCard(CardModel card, bool flipped) {
            card.IsFlipped = flipped;
            if (flipped) {
                card.TextElement.Text = card.Symbol;
                card.TextElement.FontFamily = new FontFamily("Segoe UI Emoji, Apple Color Emoji, Segoe UI, sans-serif");
                card.TextElement.FontSize = 32;
                card.Element.Background = new SolidColorBrush(LavenderColor); // Signature Lavender #F0D7FF from design.md
                card.Element.BorderBrush = new SolidColorBrush(Color.FromArgb(90, 26, 26, 26));
            } else {
                card.TextElement.Text = "?";
                card.TextElement.FontFamily = new FontFamily("EB Garamond, Georgia, serif");
                card.TextElement.FontSize = 32;
                card.TextElement.Foreground = new SolidColorBrush(InkMutedColor);
                card.Element.Background = new SolidColorBrush(CardBgColor);
                card.Element.BorderBrush = new SolidColorBrush(CardBorderColor);
            }
        }

        private void UpdateUIStats() {
            scoreText.Text = string.Format("\u2B50 {0} pts", score);
            matchesText.Text = string.Format("\uD83C\uDCCF {0}/8", matchesFound);
        }

        private void OnAllCardsMatched() {
            score += 250; // Completion bonus
            UpdateUIStats();

            bannerTitle.Text = "\uD83C\uDF89 Round Cleared!";
            bannerSubtitle.Text = string.Format("Score: {0} pts \u2022 Restarting in 2s...", score);
            bannerBorder.BorderBrush = new SolidColorBrush(ForestColor);
            bannerBorder.Visibility = Visibility.Visible;

            var restartTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(2) };
            restartTimer.Tick += (s, e) => {
                restartTimer.Stop();
                StartGame();
            };
            restartTimer.Start();
        }

        private void StartMonitoring() {
            statusPollTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(100) };
            statusPollTimer.Tick += (s, e) => CheckAgentStatus();
            statusPollTimer.Start();
            CheckAgentStatus();
        }

        private string GetAgentDisplayName(string raw) {
            if (string.IsNullOrEmpty(raw)) return "Coding Agent";
            string lower = raw.ToLower();
            if (lower.Contains("omp")) return "OMP";
            if (lower.Contains("claude")) return "Claude Code";
            if (lower.Contains("opencode")) return "OpenCode";
            if (lower.Contains("cline") || lower.Contains("kilo")) return "Cline";
            if (lower.Contains("cursor")) return "Cursor";
            if (lower.Contains("antigravity")) return "Antigravity";
            if (lower.Contains("codex") || lower.Contains("chatgpt")) return "ChatGPT";
            return raw;
        }
        // UI thread, every 100ms. Only cheap Win32 calls and dictionary work happen here; all I/O is in SignalPoller.
        private void CheckAgentStatus() {
            if (!WaitPlayStateManager.IsEnabled()) {
                // Don't close - user controls the window; just stop polling
                if (statusPollTimer != null) { try { statusPollTimer.Stop(); } catch {} }
                try {
                    statusPillText.Text = "WaitPlay \u2022 Paused";
                    statusDot.Fill = new SolidColorBrush(Color.FromRgb(148, 163, 184));
                } catch {}
                return;
            }
            if (myHwnd == IntPtr.Zero) {
                try { myHwnd = new WindowInteropHelper(this).Handle; } catch {}
            }
            if (!autoCloseArmed) return;

            // Every terminal's agent has finished: nothing left to wait for.
            if (sessions.Count > 0 && !AnyUnfinished()) { Close(); return; }

            IntPtr fg = ParentWindowTracker.GetForegroundWindow();
            if (fg == IntPtr.Zero) { awaySince = DateTime.MinValue; return; }   // locked screen etc.
            if (fg == myHwnd || IsWaitPlayWindowCached(fg)) { awaySince = DateTime.MinValue; return; }

            if (sessions.Count == 0) {
                // Widget-launched: no owning tab, so leaving the window that was in front closes it
                if (fg == desktopParent) { awaySince = DateTime.MinValue; return; }
                if (AwayFor(500)) Close();
                return;
            }

            AgentSession owner = OwnerOf(fg);
            if (owner != null) {
                awaySince = DateTime.MinValue;
                ShowSession(owner);
                if (hiddenAway) ShowAfterAway();
                inputWatcher.Target = owner.Hwnd;   // scrolling/typing in this terminal now dismisses
                return;
            }
            ownerId = null;
            inputWatcher.Target = IntPtr.Zero;
            // 500ms grace so peeking at another tab and straight back doesn't flicker the window
            if (AwayFor(500) && !hiddenAway) HideWhileAway();
        }

        private bool AwayFor(int ms) {
            if (awaySince == DateTime.MinValue) awaySince = DateTime.UtcNow;
            return (DateTime.UtcNow - awaySince).TotalMilliseconds >= ms;
        }

        private bool AnyUnfinished() {
            foreach (var s in sessions.Values) if (!s.Finished) return true;
            return false;
        }

        // The unfinished session living in the focused terminal window's selected tab.
        // Unknown tab state (non-tabbed terminal, or capture still running) counts as a match.
        private AgentSession OwnerOf(IntPtr fg) {
            AgentSession best = null;
            foreach (var s in sessions.Values) {
                if (s.Finished || s.Hwnd != fg || s.OnOwnTab == false) continue;
                if (best == null
                    || (s.OnOwnTab == true && best.OnOwnTab != true)
                    || (s.OnOwnTab == best.OnOwnTab && s.StartedAt > best.StartedAt)) best = s;
            }
            return best;
        }

        // Point the header at the session whose tab is in front
        private void ShowSession(AgentSession s) {
            if (ownerId == s.Id) return;
            ownerId = s.Id;
            targetSessionId = s.Id;
            activeAgentName = GetAgentDisplayName(s.Id);
            if (!string.IsNullOrEmpty(s.Terminal)) {
                terminalLabel = s.Terminal;
                terminalText.Text = s.Terminal;
                terminalPill.Visibility = Visibility.Visible;
            }
            SetWorkingStatus(activeAgentName, "");
            KeepClearOfTabRow(s.Hwnd);
        }

        [StructLayout(LayoutKind.Sequential)] private struct RECT { public int Left, Top, Right, Bottom; }
        [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);

        // Never cover the owning terminal's tab row, or the user can't click over to another tab.
        // In Windows Terminal the tabs share the title row: the top ~48px of the window.
        private void KeepClearOfTabRow(IntPtr terminal) {
            RECT r;
            if (terminal == IntPtr.Zero || !GetWindowRect(terminal, out r)) return;
            var src = PresentationSource.FromVisual(this);
            Matrix toDip = src != null && src.CompositionTarget != null ? src.CompositionTarget.TransformFromDevice : Matrix.Identity;
            Point tl = toDip.Transform(new Point(r.Left, r.Top));
            Point br = toDip.Transform(new Point(r.Right, r.Bottom));
            double rowBottom = tl.Y + 48;
            bool overlapsX = Left < br.X && Left + Width > tl.X;
            if (!overlapsX || Top >= rowBottom) return;
            double newTop = rowBottom + 8;
            double room = SystemParameters.WorkArea.Bottom - newTop - 8;
            if (room < MinHeight) return;   // terminal sits too low to clear it; leave the window as is
            Height = Math.Min(Height, room);
            Top = newTop;
        }

        private void FinishSession(AgentSession s) {
            if (s.Finished) return;
            s.Finished = true;
            poller.Forget(s.Id);
            DismissalTracker.ClearDismissal(s.Id);
        }

        // User scrolled or typed in the terminal that owns the window: they want the agent's
        // output, so step aside for this prompt (other terminals' sessions are unaffected).
        private void OnTerminalInteraction() {
            AgentSession s;
            if (ownerId == null || !sessions.TryGetValue(ownerId, out s)) return;
            FinishSession(s);
            ownerId = null;
            if (!AnyUnfinished()) Close();
            else HideWhileAway();
        }

        // X button / Escape: don't re-pop for any prompt that is still running
        private void DismissAll() {
            foreach (var s in sessions.Values) if (!s.Finished) DismissalTracker.RecordDismissal(s.Id);
        }

        // Results from the background poller, applied on the UI thread.
        private void ApplyPoll(PollResult r) {
            foreach (var l in r.Launches) {
                if (string.IsNullOrEmpty(l.SessionId)) {   // widget button while we're running: show here
                    if (hiddenAway) ShowAfterAway();
                    continue;
                }
                AgentSession s;
                if (!sessions.TryGetValue(l.SessionId, out s)) { s = new AgentSession { Id = l.SessionId }; sessions[l.SessionId] = s; }
                if (!string.IsNullOrEmpty(l.Terminal)) s.Terminal = l.Terminal;
                s.Hwnd = l.Hwnd;
                s.StartedAt = l.Ts;
                s.Finished = false;
                s.OnOwnTab = null;
                if (ownerId == s.Id) ownerId = null;   // refresh the header for the new prompt
            }
            foreach (var c in r.Closed) {
                AgentSession s;
                if (sessions.TryGetValue(c.Key, out s) && c.Value >= s.StartedAt) FinishSession(s);
            }
            foreach (var kv in r.OwnTab) {
                AgentSession s;
                if (sessions.TryGetValue(kv.Key, out s)) s.OnOwnTab = kv.Value;
            }
            if (r.BridgeJson != null) ApplyBridge(r.BridgeJson);
        }

        // Bridge (when running) adds model/tool/waiting detail and is a second completion source.
        private void ApplyBridge(string json) {
            try {
                var root = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(json);
                var list = root != null && root.ContainsKey("sessions") ? root["sessions"] as ArrayList : null;
                if (list == null) return;
                foreach (object item in list) {
                    var b = item as Dictionary<string, object>;
                    if (b == null) continue;
                    string sid = b.ContainsKey("sessionId") ? Convert.ToString(b["sessionId"]) : "";
                    AgentSession s;
                    if (!sessions.TryGetValue(sid, out s)) continue;
                    string status = b.ContainsKey("status") ? Convert.ToString(b["status"]) : "";
                    long ev = b.ContainsKey("lastEventAt") && b["lastEventAt"] != null ? Convert.ToInt64(b["lastEventAt"]) : 0;
                    // A COMPLETED left over from the previous turn predates this launch
                    if (status == "COMPLETED" && ev >= s.StartedAt) { FinishSession(s); continue; }
                    if (sid != ownerId) continue;
                    if (status == "WORKING" || status == "GAME_ACTIVE") {
                        string model = b.ContainsKey("model") ? Convert.ToString(b["model"]) : "";
                        string tool = b.ContainsKey("tool") ? Convert.ToString(b["tool"]) : "";
                        SetWorkingStatus(activeAgentName, model);
                        if (!string.IsNullOrEmpty(tool) && hintText != null) hintText.Text = string.Format("Active Tool: {0} \u2022 Working on your task...", tool);
                    } else if (status == "WAITING_FOR_INPUT") {
                        statusPillText.Text = string.Format("\u23F8 {0} waiting for input", activeAgentName);
                        statusPill.Background = new SolidColorBrush(Color.FromArgb(30, 255, 169, 70));
                        statusPill.BorderBrush = new SolidColorBrush(Color.FromArgb(120, 255, 169, 70));
                        statusDot.Fill = new SolidColorBrush(OrangeColor);
                        statusPillText.Foreground = new SolidColorBrush(Color.FromRgb(180, 83, 9));
                        string prompt = b.ContainsKey("waitingForInputPrompt") ? Convert.ToString(b["waitingForInputPrompt"]) : "";
                        if (!string.IsNullOrEmpty(prompt) && hintText != null) hintText.Text = string.Format("Input required: {0}", prompt);
                    }
                }
            } catch {}
        }

        private void SetWorkingStatus(string agent, string model) {
            statusPillText.Text = !string.IsNullOrEmpty(model) ? string.Format("{0} \u2022 {1}", agent, model) : string.Format("{0} is Working...", agent);
            statusPill.Background = new SolidColorBrush(Color.FromArgb(28, 3, 79, 70));
            statusPill.BorderBrush = new SolidColorBrush(Color.FromArgb(80, 3, 79, 70));
            statusDot.Fill = new SolidColorBrush(ForestColor);
            statusPillText.Foreground = new SolidColorBrush(ForestColor);
        }

        // ── Background signal poller ─────────────────────────────────────────────
        // Hand-off files are per session so terminals never consume or delete each other's signals:
        //   .waitplay-launch-<id>.txt   "id|terminal|unixMs|hwnd"       (written by later WaitPlay launches)
        //   .waitplay-close-<id>.json   {"sessionId":..,"ts":..}         (written by agent hooks on turn end)
        internal static string SignalFileId(string sessionId) {
            var sb = new StringBuilder();
            foreach (char ch in sessionId ?? "") sb.Append(char.IsLetterOrDigit(ch) || ch == '-' || ch == '_' ? ch : '_');
            return sb.Length > 0 ? sb.ToString() : "_summon";
        }
        internal static string SignalDir() { return System.IO.Path.Combine(System.IO.Path.GetTempPath(), "waitplay"); }

        private sealed class LaunchRequest {
            public string SessionId, Terminal;
            public long Ts;
            public IntPtr Hwnd;
            public TerminalTabTracker Tab;   // captured on the poller thread
        }
        private sealed class PollResult {
            public readonly List<LaunchRequest> Launches = new List<LaunchRequest>();
            public readonly List<KeyValuePair<string, long>> Closed = new List<KeyValuePair<string, long>>();   // id, signal time
            public readonly Dictionary<string, bool?> OwnTab = new Dictionary<string, bool?>(StringComparer.OrdinalIgnoreCase);
            public string BridgeJson;
        }

        // All file, UI Automation and HTTP work happens here, off the UI thread, so the companion
        // (and the low-level input hook, which runs on the UI thread) never stalls.
        private sealed class SignalPoller : IDisposable {
            private readonly MainWindow owner;
            private readonly System.Threading.Timer timer;
            private readonly object gate = new object();
            private readonly List<LaunchRequest> pending = new List<LaunchRequest>();
            private readonly Dictionary<string, LaunchRequest> live = new Dictionary<string, LaunchRequest>(StringComparer.OrdinalIgnoreCase);
            private DateTime nextBridgePoll = DateTime.MinValue;
            private int busy;
            private volatile bool disposed;

            public SignalPoller(MainWindow owner) {
                this.owner = owner;
                timer = new System.Threading.Timer(_ => Tick(), null, 0, 150);
            }
            public void Enqueue(LaunchRequest r) { lock (gate) pending.Add(r); }
            public void Forget(string id) { lock (gate) live.Remove(id); }
            public void Dispose() { disposed = true; timer.Dispose(); }

            private void Tick() {
                if (disposed || Interlocked.Exchange(ref busy, 1) == 1) return;   // previous tick still running
                try {
                    var r = new PollResult();
                    List<LaunchRequest> batch;
                    lock (gate) { batch = new List<LaunchRequest>(pending); pending.Clear(); }
                    if (OwnsSignalFiles) batch.AddRange(ReadLaunchFiles());
                    foreach (var l in batch) {
                        // The prompt was just submitted, so the selected tab right now is the session's tab
                        if (!string.IsNullOrEmpty(l.SessionId) && l.Hwnd != IntPtr.Zero) l.Tab = TerminalTabTracker.Capture(l.Hwnd);
                        if (!string.IsNullOrEmpty(l.SessionId)) lock (gate) live[l.SessionId] = l;
                        r.Launches.Add(l);
                    }
                    if (OwnsSignalFiles) r.Closed.AddRange(ReadCloseFiles());

                    List<LaunchRequest> watched;
                    lock (gate) watched = new List<LaunchRequest>(live.Values);
                    foreach (var l in watched) {
                        // Terminal window or tab closed: that session can never finish normally
                        bool? own = l.Tab != null ? l.Tab.OwnTabSelected() : (bool?)null;
                        if ((l.Hwnd != IntPtr.Zero && !ParentWindowTracker.IsWindow(l.Hwnd)) || (l.Tab != null && l.Tab.Gone)) {
                            r.Closed.Add(new KeyValuePair<string, long>(l.SessionId, long.MaxValue));
                            continue;
                        }
                        r.OwnTab[l.SessionId] = own;
                    }

                    if (DateTime.UtcNow >= nextBridgePoll) r.BridgeJson = PollBridge();
                    if (!disposed) owner.Dispatcher.BeginInvoke(new Action(() => owner.ApplyPoll(r)));
                } catch {
                } finally { Volatile.Write(ref busy, 0); }
            }

            private static List<LaunchRequest> ReadLaunchFiles() {
                var list = new List<LaunchRequest>();
                string dir = SignalDir();
                if (!System.IO.Directory.Exists(dir)) return list;
                foreach (var f in System.IO.Directory.GetFiles(dir, ".waitplay-launch-*.txt")) {
                    try {
                        string[] p = System.IO.File.ReadAllText(f).Trim().Split('|');
                        long ts, h;
                        if (p.Length < 4 || !long.TryParse(p[2], out ts) || !long.TryParse(p[3], out h)) { DeleteIfOld(f); continue; }   // mid-write: retry next tick
                        System.IO.File.Delete(f);
                        if (NowMs() - ts > 15000) continue;   // left over from a companion that died
                        list.Add(new LaunchRequest { SessionId = p[0], Terminal = p[1], Ts = ts, Hwnd = (IntPtr)h });
                    } catch {}
                }
                return list;
            }

            private static List<KeyValuePair<string, long>> ReadCloseFiles() {
                var list = new List<KeyValuePair<string, long>>();
                string dir = SignalDir();
                if (!System.IO.Directory.Exists(dir)) return list;
                foreach (var f in System.IO.Directory.GetFiles(dir, ".waitplay-close-*.json")) {
                    try {
                        var d = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(System.IO.File.ReadAllText(f));
                        if (d == null || !d.ContainsKey("sessionId") || !d.ContainsKey("ts")) { DeleteIfOld(f); continue; }
                        System.IO.File.Delete(f);
                        list.Add(new KeyValuePair<string, long>(Convert.ToString(d["sessionId"]), Convert.ToInt64(d["ts"])));
                    } catch { DeleteIfOld(f); }
                }
                return list;
            }

            private static void DeleteIfOld(string f) {
                try { if ((DateTime.UtcNow - System.IO.File.GetLastWriteTimeUtc(f)).TotalSeconds > 30) System.IO.File.Delete(f); } catch {}
            }

            // Short timeout and a 5s back-off while the bridge is down (a refused localhost connect costs ~420ms)
            private string PollBridge() {
                try {
                    var req = (HttpWebRequest)WebRequest.Create(string.Format("http://127.0.0.1:{0}/sessions", BRIDGE_PORT));
                    req.Timeout = 300;
                    using (var res = (HttpWebResponse)req.GetResponse())
                    using (var rd = new StreamReader(res.GetResponseStream())) {
                        nextBridgePoll = DateTime.UtcNow.AddSeconds(1);
                        return rd.ReadToEnd();
                    }
                } catch {
                    nextBridgePoll = DateTime.UtcNow.AddSeconds(5);
                    return null;
                }
            }
        }
        // --- Instagram WebView2 companion plumbing -------------------------------

        private bool IsPortOpen(int port) {
            try {
                using (var client = new System.Net.Sockets.TcpClient()) {
                    var ar = client.BeginConnect("127.0.0.1", port, null, null);
                    bool ok = ar.AsyncWaitHandle.WaitOne(TimeSpan.FromMilliseconds(250));
                    if (ok) { try { client.EndConnect(ar); } catch { return false; } return true; }
                    return false;
                }
            } catch { return false; }
        }

        private void EnsureWebServer() {
            try {
                if (IsPortOpen(WEB_PORT)) return;
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string repoRoot = System.IO.Path.GetFullPath(System.IO.Path.Combine(baseDir, "..", ".."));
                string serveScript = System.IO.Path.Combine(repoRoot, "apps", "web", "serve.cjs");
                if (!System.IO.File.Exists(serveScript)) {
                    serveScript = @"C:\Users\ASUS\waitplay\apps\web\serve.cjs";
                }
                if (!System.IO.File.Exists(serveScript)) return;
                var psi = new ProcessStartInfo("node", "\"" + serveScript + "\"");
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.WindowStyle = ProcessWindowStyle.Hidden;
                psi.WorkingDirectory = System.IO.Path.GetDirectoryName(serveScript);
                Process.Start(psi);
            } catch {}
        }

        private void StartWebNavigationWhenReady() {
            string url = string.Format("http://127.0.0.1:{0}/?popup=1&mode=fullscreen", WEB_PORT);
            int attempts = 0;
            webReadyTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(350) };
            webReadyTimer.Tick += (s, e) => {
                attempts++;
                if (IsPortOpen(WEB_PORT)) {
                    webReadyTimer.Stop();
                    try { if (webView != null) webView.Source = new Uri(url); } catch {}
                } else if (attempts > 60) {
                    webReadyTimer.Stop();
                }
            };
            webReadyTimer.Start();
        }

        // --- Browser toolbar (back / forward / reload / address) ----------------

        private Button MakeSiteButton(string label, Color accent) {
            return new Button {
                Content = label,
                Height = 26,
                FontSize = 12,
                FontWeight = FontWeights.SemiBold,
                Padding = new Thickness(11, 0, 11, 0),
                Margin = new Thickness(3, 0, 0, 0),
                Foreground = new SolidColorBrush(accent),
                Background = Brushes.Transparent,
                BorderBrush = new SolidColorBrush(Color.FromRgb(70, 70, 76)),
                BorderThickness = new Thickness(1),
                Cursor = Cursors.Hand,
                VerticalAlignment = VerticalAlignment.Center,
                Template = CreateRoundedButtonTemplate(new CornerRadius(13))
            };
        }

        private Button MakeWinButton(string glyph, Color hover) {
            var b = new Button {
                Content = glyph,
                Width = 46,
                Height = 34,
                FontSize = 13,
                Foreground = new SolidColorBrush(Color.FromRgb(235, 235, 235)),
                Background = Brushes.Transparent,
                BorderThickness = new Thickness(0),
                Cursor = Cursors.Hand,
                VerticalAlignment = VerticalAlignment.Stretch,
                Template = CreateRoundedButtonTemplate(new CornerRadius(0))
            };
            b.MouseEnter += (s, e) => b.Background = new SolidColorBrush(hover);
            b.MouseLeave += (s, e) => b.Background = Brushes.Transparent;
            return b;
        }

        private void ToggleFullscreen() {
            if (!isFullscreen) {
                savedBounds = new Rect(Left, Top, Width, Height);
                Left = 0;
                Top = 0;
                Width = SystemParameters.PrimaryScreenWidth;
                Height = SystemParameters.PrimaryScreenHeight;
                isFullscreen = true;
            } else {
                Left = savedBounds.Left;
                Top = savedBounds.Top;
                Width = savedBounds.Width;
                Height = savedBounds.Height;
                isFullscreen = false;
            }
        }

        private void BuildTopBar(Grid root) {
            var bar = new Border {
                Background = new SolidColorBrush(Color.FromRgb(0, 0, 0)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(28, 28, 30)),
                BorderThickness = new Thickness(0, 0, 0, 1)
            };
            bar.MouseLeftButtonDown += (s, e) => {
                if (e.ButtonState != MouseButtonState.Pressed) return;
                if (e.ClickCount == 2) { ToggleFullscreen(); }
                else { try { DragMove(); } catch {} }
            };
            var dock = new DockPanel { LastChildFill = true };

            var btnClose = MakeWinButton("\u2715", Color.FromRgb(232, 60, 60));
            btnClose.ToolTip = "Quit";
            btnClose.Click += (s, e) => Close();
            DockPanel.SetDock(btnClose, Dock.Right);
            dock.Children.Add(btnClose);

            var btnFull = MakeWinButton("\u2922", Color.FromRgb(48, 48, 56));
            btnFull.ToolTip = "Full screen";
            btnFull.Click += (s, e) => ToggleFullscreen();
            DockPanel.SetDock(btnFull, Dock.Right);
            dock.Children.Add(btnFull);

            var btnMin = MakeWinButton("\u2013", Color.FromRgb(48, 48, 56));
            btnMin.ToolTip = "Minimize";
            btnMin.Click += (s, e) => { try { this.WindowState = WindowState.Minimized; } catch {} };
            DockPanel.SetDock(btnMin, Dock.Right);
            dock.Children.Add(btnMin);

            // Remaining space is the draggable title area.
            var dragArea = new Border { Background = Brushes.Transparent };
            dock.Children.Add(dragArea);

            bar.Child = dock;
            Grid.SetRow(bar, 0);
            Panel.SetZIndex(bar, 100);
            root.Children.Add(bar);
        }

        private Button MakeToolbarButton(string glyph) {
            return new Button {
                Content = glyph,
                Width = 32,
                Height = 30,
                FontSize = 16,
                Foreground = new SolidColorBrush(Color.FromRgb(235, 235, 235)),
                Background = Brushes.Transparent,
                BorderThickness = new Thickness(0),
                Cursor = Cursors.Hand,
                VerticalAlignment = VerticalAlignment.Center,
                Template = CreateRoundedButtonTemplate(new CornerRadius(6))
            };
        }

        private void BuildBrowserToolbar(Grid root) {
            var bar = new Border {
                Background = new SolidColorBrush(Color.FromRgb(0, 0, 0)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(28, 28, 30)),
                BorderThickness = new Thickness(0, 0, 0, 1)
            };
            bar.MouseLeftButtonDown += (s, e) => {
                if (e.ButtonState == MouseButtonState.Pressed && !(e.OriginalSource is TextBox)) {
                    try { DragMove(); } catch {}
                }
            };
            var dock = new DockPanel { LastChildFill = true, Margin = new Thickness(8, 0, 8, 0) };

            var btnClose = MakeToolbarButton("\u2715");
            btnClose.Click += (s, e) => Close();
            DockPanel.SetDock(btnClose, Dock.Right);
            dock.Children.Add(btnClose);

            var btnHome = MakeToolbarButton("\u2302");
            btnHome.Click += (s, e) => NavigateTo(HOME_URL);
            DockPanel.SetDock(btnHome, Dock.Right);
            dock.Children.Add(btnHome);

            btnBack = MakeToolbarButton("\u2039");
            btnBack.Click += (s, e) => { try { if (webView != null && webView.CanGoBack) webView.GoBack(); } catch {} };
            DockPanel.SetDock(btnBack, Dock.Left);
            dock.Children.Add(btnBack);

            btnForward = MakeToolbarButton("\u203A");
            btnForward.Click += (s, e) => { try { if (webView != null && webView.CanGoForward) webView.GoForward(); } catch {} };
            DockPanel.SetDock(btnForward, Dock.Left);
            dock.Children.Add(btnForward);

            var btnReload = MakeToolbarButton("\u21BB");
            btnReload.Click += (s, e) => { try { if (webView != null) webView.Reload(); } catch {} };
            DockPanel.SetDock(btnReload, Dock.Left);
            dock.Children.Add(btnReload);

            var sites = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(6, 0, 0, 0) };
            var igBtn = MakeSiteButton("Instagram", Color.FromRgb(214, 41, 118));
            igBtn.Click += (s, e) => NavigateTo(HOME_URL);
            sites.Children.Add(igBtn);
            DockPanel.SetDock(sites, Dock.Left);
            dock.Children.Add(sites);

            var addrWrap = new Border {
                Background = new SolidColorBrush(Color.FromRgb(38, 38, 42)),
                CornerRadius = new CornerRadius(8),
                Margin = new Thickness(8, 6, 8, 6),
                Padding = new Thickness(10, 0, 10, 0)
            };
            addressBar = new TextBox {
                Text = HOME_URL,
                VerticalContentAlignment = VerticalAlignment.Center,
                Background = Brushes.Transparent,
                BorderThickness = new Thickness(0),
                FontSize = 12,
                Foreground = new SolidColorBrush(Color.FromRgb(220, 220, 222))
            };
            addressBar.KeyDown += (s, e) => {
                if (e.Key == Key.Enter) { NavigateTo(addressBar.Text); }
            };
            addrWrap.Child = addressBar;
            dock.Children.Add(addrWrap);

            bar.Child = dock;
            Grid.SetRow(bar, 0);
            Panel.SetZIndex(bar, 100);
            root.Children.Add(bar);
        }

        private void NavigateTo(string input) {
            if (string.IsNullOrWhiteSpace(input)) return;
            string u = input.Trim();
            if (!u.StartsWith("http://") && !u.StartsWith("https://")) {
                if (u.Contains(" ") || !u.Contains(".")) {
                    u = "https://www.google.com/search?q=" + Uri.EscapeDataString(u);
                } else {
                    u = "https://" + u;
                }
            }
            try { if (webView != null) webView.Source = new Uri(u); } catch {}
        }

        private void UpdateAddress() {
            try {
                if (addressBar != null && webView != null && webView.Source != null && !addressBar.IsKeyboardFocused) {
                    addressBar.Text = webView.Source.ToString();
                }
            } catch {}
        }

        private void UpdateNavButtons() {
            try {
                if (btnBack != null && webView != null) btnBack.Opacity = webView.CanGoBack ? 1.0 : 0.4;
                if (btnForward != null && webView != null) btnForward.Opacity = webView.CanGoForward ? 1.0 : 0.4;
            } catch {}
        }
    }

    public static class ParentWindowTracker {
        [DllImport("user32.dll")]
        public static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        public static extern bool IsWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern bool IsIconic(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll")]
        public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        [DllImport("user32.dll")]
        public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
        public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll")]
        public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern IntPtr CreateToolhelp32Snapshot(uint dwFlags, uint th32ProcessID);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool Process32First(IntPtr hSnapshot, ref PROCESSENTRY32 lppe);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool Process32Next(IntPtr hSnapshot, ref PROCESSENTRY32 lppe);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool CloseHandle(IntPtr hObject);

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
        public struct PROCESSENTRY32 {
            public uint dwSize;
            public uint cntUsage;
            public uint th32ProcessID;
            public IntPtr th32DefaultHeapID;
            public uint th32ModuleID;
            public uint cntThreads;
            public uint th32ParentProcessID;
            public int pcPriClassBase;
            public uint dwFlags;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
            public string szExeFile;
        }

        public static uint GetParentProcessId(uint pid) {
            IntPtr snapshot = CreateToolhelp32Snapshot(0x00000002, 0); // TH32CS_SNAPPROCESS
            if (snapshot == IntPtr.Zero || snapshot == (IntPtr)(-1)) return 0;
            try {
                PROCESSENTRY32 pe = new PROCESSENTRY32();
                pe.dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32));
                if (Process32First(snapshot, ref pe)) {
                    do {
                        if (pe.th32ProcessID == pid) {
                            return pe.th32ParentProcessID;
                        }
                    } while (Process32Next(snapshot, ref pe));
                }
            } catch {}
            finally {
                CloseHandle(snapshot);
            }
            return 0;
        }

        public static IntPtr FindTopWindowForPid(uint startPid) {
            if (startPid == 0) return IntPtr.Zero;
            uint curr = startPid;
            for (int depth = 0; depth < 8 && curr > 0; depth++) {
                IntPtr found = IntPtr.Zero;
                uint targetPid = curr;
                EnumWindows((hWnd, lParam) => {
                    if (IsWindow(hWnd) && (IsWindowVisible(hWnd) || IsIconic(hWnd))) {
                        uint p;
                        GetWindowThreadProcessId(hWnd, out p);
                        if (p == targetPid) {
                            StringBuilder sb = new StringBuilder(256);
                            GetWindowText(hWnd, sb, 256);
                            if (sb.Length > 0) {
                                found = hWnd;
                                return false; // Stop enum
                            }
                        }
                    }
                    return true;
                }, IntPtr.Zero);

                if (found != IntPtr.Zero) return found;
                curr = GetParentProcessId(curr);
            }
            return IntPtr.Zero;
        }

        public static IntPtr FindWindowForAgent(string agentName) {
            try {
                if (string.IsNullOrEmpty(agentName)) return IntPtr.Zero;
                string lower = agentName.ToLower();

                if (lower.Contains("omp")) {
                    var procs = Process.GetProcessesByName("omp");
                    foreach (var p in procs) {
                        IntPtr win = FindTopWindowForPid((uint)p.Id);
                        if (win != IntPtr.Zero) return win;
                    }
                } else if (lower.Contains("opencode")) {
                    var procs = Process.GetProcessesByName("opencode");
                    foreach (var p in procs) {
                        IntPtr win = FindTopWindowForPid((uint)p.Id);
                        if (win != IntPtr.Zero) return win;
                    }
                } else if (lower.Contains("cline") || lower.Contains("kilo")) {
                    var procs = Process.GetProcessesByName("Cursor");
                    if (procs.Length == 0) procs = Process.GetProcessesByName("Code");
                    foreach (var p in procs) {
                        IntPtr win = FindTopWindowForPid((uint)p.Id);
                        if (win != IntPtr.Zero) return win;
                    }
                } else if (lower.Contains("cursor")) {
                    var procs = Process.GetProcessesByName("Cursor");
                    foreach (var p in procs) {
                        IntPtr win = FindTopWindowForPid((uint)p.Id);
                        if (win != IntPtr.Zero) return win;
                    }
                } else if (lower.Contains("chatgpt") || lower.Contains("codex")) {
                    var procs = Process.GetProcessesByName("codex");
                    foreach (var p in procs) {
                        IntPtr win = FindTopWindowForPid((uint)p.Id);
                        if (win != IntPtr.Zero) return win;
                    }
                }
            } catch {}
            return IntPtr.Zero;
        }
    }

    public static class DismissalTracker {
        private static string GetFilePath() {
            string dir = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "waitplay");
            if (!System.IO.Directory.Exists(dir)) {
                try { System.IO.Directory.CreateDirectory(dir); } catch {}
            }
            return System.IO.Path.Combine(dir, ".waitplay-dismissed.json");
        }

        public static bool IsPromptDismissed(string sessionId) {
            try {
                if (string.IsNullOrEmpty(sessionId)) return false;
                string filePath = GetFilePath();
                if (!System.IO.File.Exists(filePath)) return false;
                string json = System.IO.File.ReadAllText(filePath);
                var serializer = new JavaScriptSerializer();
                var dict = serializer.Deserialize<Dictionary<string, object>>(json);
                if (dict == null || !dict.ContainsKey(sessionId)) return false;

                var entry = dict[sessionId] as Dictionary<string, object>;
                if (entry == null) return false;

                bool isDismissed = entry.ContainsKey("dismissed") && Convert.ToBoolean(entry["dismissed"]);
                if (!isDismissed) return false;

                long dismissedAt = entry.ContainsKey("dismissedAt") ? Convert.ToInt64(entry["dismissedAt"]) : 0;
                long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                if (dismissedAt > 0 && (now - dismissedAt) > 300000) {
                    ClearDismissal(sessionId);
                    return false;
                }

                return true;
            } catch {}
            return false;
        }

        public static void RecordDismissal(string sessionId) {
            try {
                if (string.IsNullOrEmpty(sessionId)) return;
                string filePath = GetFilePath();
                var serializer = new JavaScriptSerializer();
                Dictionary<string, object> dict = new Dictionary<string, object>();
                if (System.IO.File.Exists(filePath)) {
                    try {
                        string existing = System.IO.File.ReadAllText(filePath);
                        dict = serializer.Deserialize<Dictionary<string, object>>(existing) ?? new Dictionary<string, object>();
                    } catch {}
                }

                var entry = new Dictionary<string, object> {
                    { "dismissed", true },
                    { "dismissedAt", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }
                };
                dict[sessionId] = entry;
                System.IO.File.WriteAllText(filePath, serializer.Serialize(dict));
            } catch {}
        }

        public static void ClearDismissal(string sessionId) {
            try {
                if (string.IsNullOrEmpty(sessionId)) return;
                string filePath = GetFilePath();
                if (!System.IO.File.Exists(filePath)) return;
                var serializer = new JavaScriptSerializer();
                string existing = System.IO.File.ReadAllText(filePath);
                var dict = serializer.Deserialize<Dictionary<string, object>>(existing);
                if (dict != null && dict.ContainsKey(sessionId)) {
                    dict.Remove(sessionId);
                    System.IO.File.WriteAllText(filePath, serializer.Serialize(dict));
                }
            } catch {}
        }
    }

    
    public static class WaitPlayStateManager {
        private static string GetTempPath() {
            string dir = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "waitplay");
            if (!System.IO.Directory.Exists(dir)) {
                try { System.IO.Directory.CreateDirectory(dir); } catch {}
            }
            return System.IO.Path.Combine(dir, ".waitplay-enabled.json");
        }

        private static string GetRepoPath() {
            return @"C:\Users\ASUS\waitplay\.waitplay-enabled.json";
        }

        public static bool IsEnabled() {
            try {
                long latestTime = -1;
                bool latestVal = true;
                bool found = false;
                string[] paths = new string[] { GetTempPath(), GetRepoPath() };
                foreach (var p in paths) {
                    if (System.IO.File.Exists(p)) {
                        string json = System.IO.File.ReadAllText(p);
                        var ser = new JavaScriptSerializer();
                        var dict = ser.Deserialize<Dictionary<string, object>>(json);
                        if (dict != null && dict.ContainsKey("enabled")) {
                            long time = dict.ContainsKey("updatedAt") ? Convert.ToInt64(dict["updatedAt"]) : 0;
                            if (time > latestTime) {
                                latestTime = time;
                                latestVal = Convert.ToBoolean(dict["enabled"]);
                                found = true;
                            }
                        }
                    }
                }
                if (found) return latestVal;
            } catch {}
            return true;
        }

        public static bool Toggle() {
            bool s = !IsEnabled();
            SetEnabled(s);
            return s;
        }

        public static void SetEnabled(bool enabled) {
            try {
                var dict = new Dictionary<string, object>();
                dict["enabled"] = enabled;
                dict["updatedAt"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                var ser = new JavaScriptSerializer();
                string json = ser.Serialize(dict);
                string[] paths = new string[] { GetTempPath(), GetRepoPath() };
                foreach (var p in paths) {
                    try {
                        string d = System.IO.Path.GetDirectoryName(p);
                        if (!System.IO.Directory.Exists(d)) System.IO.Directory.CreateDirectory(d);
                        System.IO.File.WriteAllText(p, json);
                    } catch {}
                }
                NotifyBridge(enabled);
            } catch {}
        }

        public static void NotifyBridge(bool enabled) {
            System.Threading.ThreadPool.QueueUserWorkItem(_ => {
                try {
                    string url = "http://127.0.0.1:3150/state";
                    var request = (HttpWebRequest)WebRequest.Create(url);
                    request.Timeout = 400;
                    request.Method = "POST";
                    request.ContentType = "application/json";
                    string body = string.Format("{{\"enabled\":{0}}}", enabled ? "true" : "false");
                    byte[] data = System.Text.Encoding.UTF8.GetBytes(body);
                    request.ContentLength = data.Length;
                    using (var s = request.GetRequestStream()) {
                        s.Write(data, 0, data.Length);
                    }
                    using (var resp = (HttpWebResponse)request.GetResponse()) {}
                } catch {}
            });
        }
    }

    // ─────────────────────────────────────────────────────────────────
    //  WhisperFlow-style floating pill widget
    // ─────────────────────────────────────────────────────────────────

    // ─────────────────────────────────────────────────────────────────
    //  WhisperFlow-style floating widget
    //  Default: just two circular buttons (power + secondary)
    //  Hover power button: text pill slides out to the left
    // ─────────────────────────────────────────────────────────────────

    public enum DockSide { Right, Left, Bottom }

    public class FloatingFlowWidget : Window {
        [DllImport("user32.dll")]
        private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);
        [DllImport("user32.dll")]
        private static extern bool UnregisterHotKey(IntPtr hWnd, int id);
        [DllImport("user32.dll")]
        private static extern bool GetCursorPos(out POINT lpPoint);
        [StructLayout(LayoutKind.Sequential)]
        public struct POINT { public int X; public int Y; }

        private const int HOTKEY_ID = 9001;

        // State
        private bool isEnabled = true;
        private bool isMenuOpen = false;
        private DockSide dock = DockSide.Right;
        private IntPtr myHwnd = IntPtr.Zero;
        private MainWindow activeGameWindow = null;

        // UI
        private Canvas rootCanvas;
        private Border edgeHandle;
        private Grid hoverGroup;
        private Border mainCapsule;
        private System.Windows.Shapes.Path mainIcon;
        private Border textPill;
        private TextBlock pillLabel;
        private System.Windows.Documents.Run pillAction;
        private System.Windows.Documents.Run pillKey;
        private TranslateTransform pillSlide;
        private ScaleTransform uiScale;
        private Border secButton;
        private Ellipse secDot;
        private Border appPicker;
        private DispatcherTimer collapseTimer;
        private DispatcherTimer statusTimer;

        // Drag-to-dock
        private bool capsulePressed, dragging;
        private Point pressPoint;
        private DockDragOverlay dragOverlay;

        // Design.md light palette (user-specified tokens)
        static readonly Color Bg         = Color.FromRgb(255, 255, 255);    // #FFFFFF surfaces: capsule, pill, menu
        static readonly Color BgSec      = Color.FromRgb(245, 245, 243);    // #F5F5F3 secondary circle / idle handle
        static readonly Color Hover      = Color.FromRgb(235, 235, 231);    // #EBEBE7 hover background
        static readonly Color Selected   = Color.FromRgb(240, 215, 255);    // #F0D7FF selected / pressed state
        static readonly Color Brd        = Color.FromRgb(218, 218, 214);    // #DADAD6 border
        static readonly Color Txt        = Color.FromRgb(26, 26, 26);       // #1A1A1A primary text (also on Selected)
        static readonly Color TxtSec     = Color.FromRgb(119, 119, 119);    // #777777 secondary text / paused
        static readonly Color Active     = Color.FromRgb(99, 144, 133);     // #639085 active indicator
        static readonly Color WorkDot    = Color.FromRgb(96, 165, 250);     // Agent working
        static readonly Color AmberDot   = Color.FromRgb(251, 191, 36);     // Needs input
        const double BaseW = 280, BaseH = 190;                               // Unscaled canvas size

        public FloatingFlowWidget() {
            Title = "WaitPlay";
            WindowStyle = WindowStyle.None;
            AllowsTransparency = true;
            Background = Brushes.Transparent;
            Topmost = true;
            ShowInTaskbar = false;
            ResizeMode = ResizeMode.NoResize;
            Width = BaseW; Height = BaseH;

            SourceInitialized += (s, e) => {
                try {
                    myHwnd = new WindowInteropHelper(this).Handle;
                    RegisterHotKey(myHwnd, HOTKEY_ID, 0x0001, 0x57);
                    var src = HwndSource.FromHwnd(myHwnd);
                    if (src != null) src.AddHook(HwndHook);
                } catch {}
            };
            Closed += (s, e) => {
                try { if (myHwnd != IntPtr.Zero) UnregisterHotKey(myHwnd, HOTKEY_ID); } catch {}
                Microsoft.Win32.SystemEvents.DisplaySettingsChanged -= OnDisplayChanged;
            };
            // Re-fit when resolution, scaling or taskbar changes
            Microsoft.Win32.SystemEvents.DisplaySettingsChanged += OnDisplayChanged;
            SystemParameters.StaticPropertyChanged += (s, e) => { if (e.PropertyName == "WorkArea") Dispatcher.BeginInvoke(new Action(ApplyDock)); };

            BuildUI();
            LoadDock();
            ApplyDock();
            SetIdle();
            isEnabled = WaitPlayStateManager.IsEnabled();
            UpdateVisuals();
            statusTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(3) };
            statusTimer.Tick += (s, e) => PollStatus();
            statusTimer.Start();
        }

        // ════════════════════════════════════════════════════════════
        //  UI — builds once, state changes show/hide elements
        // ════════════════════════════════════════════════════════════
        private void BuildUI() {
            rootCanvas = new Canvas { Width = BaseW, Height = BaseH };
            uiScale = new ScaleTransform(1, 1);
            rootCanvas.LayoutTransform = uiScale;

            // ── Edge handle (idle) ────────────────────────────────
            edgeHandle = new Border {
                Width = 12, Height = 44,
                CornerRadius = new CornerRadius(6),
                Background = new SolidColorBrush(BgSec),
                BorderBrush = new SolidColorBrush(Brd),
                BorderThickness = new Thickness(1.2),
                Cursor = Cursors.Hand
            };
            edgeHandle.MouseEnter += (s, e) => Expand();
            rootCanvas.Children.Add(edgeHandle);

            // ── Hover group (Grid so pill + capsule overlap) ──────
            hoverGroup = new Grid { Visibility = Visibility.Collapsed };
            rootCanvas.Children.Add(hoverGroup);

            // We'll add the rows via a vertical StackPanel inside the Grid
            var vstack = new StackPanel { Orientation = Orientation.Vertical };

            // Row 1: pill + capsule
            var row1 = new Grid();
            row1.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); // pill
            row1.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); // capsule

            // Text pill — white, separate from capsule (6px gap set in ApplyDock)
            textPill = new Border {
                Background = new SolidColorBrush(Bg),
                BorderBrush = new SolidColorBrush(Brd),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(17),
                Padding = new Thickness(13, 7, 13, 8),
                VerticalAlignment = VerticalAlignment.Center,
                Opacity = 0
            };
            // "Dictate **Caps Lock**" style: action in secondary text, shortcut bold in primary
            pillAction = new System.Windows.Documents.Run("Pause ") { FontWeight = FontWeights.Normal, Foreground = new SolidColorBrush(TxtSec) };
            pillKey = new System.Windows.Documents.Run("Alt W") { FontWeight = FontWeights.Bold, Foreground = new SolidColorBrush(Txt) };
            pillLabel = new TextBlock {
                FontFamily = new FontFamily("Figtree, Segoe UI, sans-serif"),
                FontSize = 13,
                Foreground = new SolidColorBrush(Txt),
                VerticalAlignment = VerticalAlignment.Center
            };
            pillLabel.Inlines.Add(pillAction);
            pillLabel.Inlines.Add(pillKey);
            textPill.Child = pillLabel;
            pillSlide = new TranslateTransform();
            textPill.RenderTransform = pillSlide;
            mainCapsule = new Border {
                Width = 32, Height = 52,
                CornerRadius = new CornerRadius(16),
                Background = new SolidColorBrush(Bg),
                BorderBrush = new SolidColorBrush(Brd),
                BorderThickness = new Thickness(1),
                Cursor = Cursors.Hand,
                VerticalAlignment = VerticalAlignment.Center
            };
            Panel.SetZIndex(mainCapsule, 5);
            mainIcon = new System.Windows.Shapes.Path {
                Data = Geometry.Parse("M12,3 L12,11 M6.3,6.3 A7,7 0 1,0 17.7,6.3"),
                Stroke = new SolidColorBrush(Txt),
                StrokeThickness = 2.0,
                Fill = Brushes.Transparent,
                Width = 14, Height = 14,
                Stretch = Stretch.Uniform,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
            mainCapsule.Child = mainIcon;
            mainCapsule.MouseEnter += (s, e) => { if (capsulePressed) return; mainCapsule.Background = new SolidColorBrush(Hover); CancelCollapse(); ShowPill(); };
            mainCapsule.MouseLeave += (s, e) => { if (capsulePressed) return; mainCapsule.Background = new SolidColorBrush(Bg); ScheduleCollapse(); };
            // Click toggles; press + drag past a small threshold re-docks (see Capsule_* below)
            mainCapsule.MouseLeftButtonDown += Capsule_Down;
            mainCapsule.MouseMove += Capsule_Move;
            mainCapsule.MouseLeftButtonUp += Capsule_Up;
            mainCapsule.LostMouseCapture += Capsule_LostCapture;

            // Layout depends on dock side — will be set in ApplyDock
            Grid.SetColumn(textPill, 0);
            Grid.SetColumn(mainCapsule, 1);
            row1.Children.Add(textPill);
            row1.Children.Add(mainCapsule);

            // Row 2: secondary circle, centered under the capsule
            var row2wrap = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 5, 1, 0) };
            secButton = new Border {
                Width = 30, Height = 30,
                CornerRadius = new CornerRadius(15),
                Background = new SolidColorBrush(BgSec),
                BorderBrush = new SolidColorBrush(Brd),
                BorderThickness = new Thickness(1),
                Cursor = Cursors.Hand
            };
            var secGrid = new Grid();
            var ring = new Ellipse { Width = 13, Height = 13, Stroke = new SolidColorBrush(Txt), StrokeThickness = 1.5, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
            var cdot = new Ellipse { Width = 6, Height = 6, Fill = new SolidColorBrush(Txt), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
            // Status dot sits on the top-right rim, ringed in white
            var secDotBg = new Ellipse { Width = 11, Height = 11, Fill = new SolidColorBrush(Bg), HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Top, Margin = new Thickness(0,-4,-4,0) };
            secDot = new Ellipse { Width = 8, Height = 8, Fill = new SolidColorBrush(Active), HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Top, Margin = new Thickness(0,-2.5,-2.5,0) };
            secGrid.Children.Add(ring); secGrid.Children.Add(cdot); secGrid.Children.Add(secDotBg); secGrid.Children.Add(secDot);
            secButton.Child = secGrid;
            secButton.MouseEnter += (s, e) => { if (!isMenuOpen) secButton.Background = new SolidColorBrush(Hover); CancelCollapse(); };
            secButton.MouseLeave += (s, e) => { if (!isMenuOpen) secButton.Background = new SolidColorBrush(BgSec); ScheduleCollapse(); };
            secButton.MouseLeftButtonUp += (s, e) => { ToggleAppPicker(); e.Handled = true; };
            row2wrap.Children.Add(secButton);

            vstack.Children.Add(row1);
            vstack.Children.Add(row2wrap);
            hoverGroup.Children.Add(vstack);

            // ── App picker ────────────────────────────────────────
            appPicker = new Border {
                Background = new SolidColorBrush(Bg),
                BorderBrush = new SolidColorBrush(Brd),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(12),
                Padding = new Thickness(6, 5, 6, 5),
                Visibility = Visibility.Collapsed
            };
            var appStack = new StackPanel();
            // Games — gamepad icon
            appStack.Children.Add(AppItem(BuildGamepadIcon(), "Games", () => OpenGameWindow()));
            // Instagram — camera icon
            appStack.Children.Add(AppItem(BuildInstagramIcon(), "Instagram", () => LaunchSite("instagram")));
            // X — letter X
            appStack.Children.Add(AppItem(BuildXIcon(), "X", () => LaunchSite("x")));
            appPicker.Child = appStack;
            appPicker.MouseEnter += (s, e) => CancelCollapse();
            appPicker.MouseLeave += (s, e) => ScheduleCollapse();
            rootCanvas.Children.Add(appPicker);

            Content = rootCanvas;

            collapseTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(600) };
            collapseTimer.Tick += (s, e) => { collapseTimer.Stop(); SetIdle(); };

            // Context menu
            var ctx = new ContextMenu();
            var d1 = new MenuItem { Header = "▸ Right Edge" }; d1.Click += (s,e) => { dock = DockSide.Right; ApplyDock(); SaveDock(); };
            var d2 = new MenuItem { Header = "◂ Left Edge" }; d2.Click += (s,e) => { dock = DockSide.Left; ApplyDock(); SaveDock(); };
            var d3 = new MenuItem { Header = "▾ Bottom Edge" }; d3.Click += (s,e) => { dock = DockSide.Bottom; ApplyDock(); SaveDock(); };
            ctx.Items.Add(d1); ctx.Items.Add(d2); ctx.Items.Add(d3);
            ctx.Items.Add(new Separator());
            var ex = new MenuItem { Header = "Exit" }; ex.Click += (s,e) => Close();
            ctx.Items.Add(ex);
            ContextMenu = ctx;
        }

        // ── Proper vector icons ───────────────────────────────────
        private UIElement BuildGamepadIcon() {
            var g = new Grid { Width = 16, Height = 16 };
            // Gamepad body
            var body = new System.Windows.Shapes.Path {
                Data = Geometry.Parse("M4,6 C2,6 1,7.5 1,9.5 C1,11.5 2,13 4,13 L6,13 L7,11 L9,11 L10,13 L12,13 C14,13 15,11.5 15,9.5 C15,7.5 14,6 12,6 Z"),
                Fill = new SolidColorBrush(Txt),
                Stretch = Stretch.Uniform,
                Width = 16, Height = 12,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
            // D-pad cross
            var dpad = new System.Windows.Shapes.Path {
                Data = Geometry.Parse("M4.5,8.5 L4.5,10.5 M3.5,9.5 L5.5,9.5"),
                Stroke = new SolidColorBrush(Bg),
                StrokeThickness = 1.2,
                Stretch = Stretch.None,
                HorizontalAlignment = HorizontalAlignment.Left,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0,0,0,0)
            };
            // Action buttons (two dots)
            var b1 = new Ellipse { Width = 2, Height = 2, Fill = new SolidColorBrush(Bg), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(4,-2,0,0) };
            var b2 = new Ellipse { Width = 2, Height = 2, Fill = new SolidColorBrush(Bg), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(8,0,0,0) };
            g.Children.Add(body);
            g.Children.Add(b1); g.Children.Add(b2);
            return g;
        }

        private UIElement BuildInstagramIcon() {
            var g = new Grid { Width = 16, Height = 16 };
            // Rounded square
            var sq = new Border {
                Width = 14, Height = 14,
                CornerRadius = new CornerRadius(4),
                BorderBrush = new SolidColorBrush(Txt),
                BorderThickness = new Thickness(1.6),
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
            // Center circle (lens)
            var lens = new Ellipse {
                Width = 6, Height = 6,
                Stroke = new SolidColorBrush(Txt),
                StrokeThickness = 1.4,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
            // Flash dot
            var flash = new Ellipse {
                Width = 2.5, Height = 2.5,
                Fill = new SolidColorBrush(Txt),
                HorizontalAlignment = HorizontalAlignment.Right,
                VerticalAlignment = VerticalAlignment.Top,
                Margin = new Thickness(0, 2.5, 2.5, 0)
            };
            g.Children.Add(sq); g.Children.Add(lens); g.Children.Add(flash);
            return g;
        }

        private UIElement BuildXIcon() {
            return new TextBlock {
                Text = "\uD835\uDD4F", // 𝕏 math double-struck X
                FontFamily = new FontFamily("Segoe UI"),
                FontSize = 14, FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(Txt),
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
        }

        private Border AppItem(UIElement icon, string label, Action onClick) {
            var b = new Border {
                Background = Brushes.Transparent, CornerRadius = new CornerRadius(8),
                Padding = new Thickness(10, 6, 10, 6), Cursor = Cursors.Hand
            };
            var sp = new StackPanel { Orientation = Orientation.Horizontal };
            var iconWrap = new Border { Width = 20, Height = 18, Child = icon, Margin = new Thickness(0,0,8,0), VerticalAlignment = VerticalAlignment.Center };
            sp.Children.Add(iconWrap);
            sp.Children.Add(new TextBlock {
                Text = label, FontFamily = new FontFamily("Segoe UI"),
                FontSize = 12, FontWeight = FontWeights.Medium,
                Foreground = new SolidColorBrush(Txt),
                VerticalAlignment = VerticalAlignment.Center
            });
            b.Child = sp;
            b.MouseEnter += (s,e) => { b.Background = new SolidColorBrush(Hover); };
            b.MouseLeave += (s,e) => { b.Background = Brushes.Transparent; };
            b.MouseLeftButtonUp += (s,e) => { CloseAppPicker(); onClick(); e.Handled = true; };
            return b;
        }

        // ════════════════════════════════════════════════════════════
        //  State transitions
        // ════════════════════════════════════════════════════════════
        private void SetIdle() {
            CloseAppPicker();
            hoverGroup.Visibility = Visibility.Collapsed;
            edgeHandle.Visibility = Visibility.Visible;
            // Drop held animation values, otherwise the local value is ignored
            textPill.BeginAnimation(OpacityProperty, null);
            pillSlide.BeginAnimation(TranslateTransform.XProperty, null);
            textPill.Opacity = 0;
            mainCapsule.Background = new SolidColorBrush(Bg);
        }
        private void Expand() {
            CancelCollapse();
            edgeHandle.Visibility = Visibility.Collapsed;
            hoverGroup.Visibility = Visibility.Visible;
        }
        private void ShowPill() {
            if (isMenuOpen) return;
            var dur = TimeSpan.FromMilliseconds(120);
            var ease = new CubicEase { EasingMode = EasingMode.EaseOut };
            // Pill slides out from the capsule side toward its resting spot
            double from = dock == DockSide.Left ? -8 : 8;
            textPill.BeginAnimation(OpacityProperty, new DoubleAnimation { To = 1, Duration = dur, EasingFunction = ease });
            pillSlide.BeginAnimation(TranslateTransform.XProperty, new DoubleAnimation { From = from, To = 0, Duration = dur, EasingFunction = ease });
        }
        private void HidePill() {
            textPill.BeginAnimation(OpacityProperty, new DoubleAnimation { To = 0, Duration = TimeSpan.FromMilliseconds(120) });
        }
        private void ScheduleCollapse() { collapseTimer.Stop(); collapseTimer.Start(); }
        private void CancelCollapse() { collapseTimer.Stop(); }
        private void ToggleAppPicker() {
            if (isMenuOpen) CloseAppPicker();
            else { isMenuOpen = true; HidePill(); appPicker.Visibility = Visibility.Visible; secButton.Background = new SolidColorBrush(Selected); }
        }
        private void CloseAppPicker() { isMenuOpen = false; appPicker.Visibility = Visibility.Collapsed; secButton.Background = new SolidColorBrush(BgSec); }
        private void OnDisplayChanged(object sender, EventArgs e) { Dispatcher.BeginInvoke(new Action(ApplyDock)); }

        // ════════════════════════════════════════════════════════════
        //  Drag to re-dock (WhisperFlow): grab the capsule, drop on a zone
        // ════════════════════════════════════════════════════════════
        private void Capsule_Down(object s, MouseButtonEventArgs e) {
            capsulePressed = true; dragging = false;
            pressPoint = e.GetPosition(this);
            mainCapsule.Background = new SolidColorBrush(Selected);
            mainCapsule.CaptureMouse();
            e.Handled = true;
        }
        private void Capsule_Move(object s, MouseEventArgs e) {
            if (!capsulePressed) return;
            Point p = e.GetPosition(this);
            if (!dragging) {
                if (Math.Abs(p.X - pressPoint.X) < 6 && Math.Abs(p.Y - pressPoint.Y) < 6) return;
                BeginDrag();
            }
            dragOverlay.MoveBall(PointToScreen(p));
        }
        private void Capsule_Up(object s, MouseButtonEventArgs e) {
            if (!capsulePressed) return;
            capsulePressed = false;
            Point screen = PointToScreen(e.GetPosition(this));
            mainCapsule.ReleaseMouseCapture();
            if (dragging) EndDrag(screen);
            else { mainCapsule.Background = new SolidColorBrush(Hover); ToggleEnabled(); }
            e.Handled = true;
        }
        private void Capsule_LostCapture(object s, MouseEventArgs e) {
            // Capture stolen mid-drag (Alt-Tab, Win key): still land on the nearest zone
            if (!capsulePressed) return;
            capsulePressed = false;
            if (dragging) EndDrag(PointToScreen(Mouse.GetPosition(this)));
            else mainCapsule.Background = new SolidColorBrush(Bg);
        }
        private void BeginDrag() {
            dragging = true;
            CancelCollapse();
            CloseAppPicker();
            rootCanvas.Opacity = 0;   // widget stays alive (keeps capture); the overlay's ball stands in for it
            dragOverlay = new DockDragOverlay(mainIcon.Data, isEnabled ? Txt : TxtSec, Bg, Brd);
            dragOverlay.Show();
        }
        private void EndDrag(Point screen) {
            dragging = false;
            var ov = dragOverlay; dragOverlay = null;
            if (ov == null) return;
            dock = ov.Nearest(screen);
            ov.SnapTo(dock, () => {
                ov.Close();
                SaveDock();
                ApplyDock();
                rootCanvas.Opacity = 1;
            });
        }

        // ════════════════════════════════════════════════════════════
        //  3 fixed positions — pill direction flips per dock side
        // ════════════════════════════════════════════════════════════
        private void ApplyDock() {
            Rect wa = SystemParameters.WorkArea;

            // Responsive: scale with usable screen height (DIPs, so Windows DPI scaling is already applied).
            // ~1040 DIP (1080p @100%) → 1.0; small laptops shrink, tall/1440p displays grow.
            double s = Math.Max(0.85, Math.Min(1.35, wa.Height / 1040.0));
            uiScale.ScaleX = s; uiScale.ScaleY = s;
            Width = BaseW * s; Height = BaseH * s;

            var vstack = hoverGroup.Children[0] as StackPanel;
            var row1 = vstack.Children[0] as Grid;
            var row2wrap = vstack.Children[1] as StackPanel;

            // Group = capsule(52) + gap(5) + secondary(30); canvas coords are unscaled
            const double groupH = 87, capW = 32, edge = 6, gap = 6;
            double groupTop = (BaseH - groupH) / 2;
            foreach (var el in new UIElement[] { edgeHandle, hoverGroup, appPicker }) {
                Canvas.SetLeft(el, double.NaN); Canvas.SetRight(el, double.NaN);
            }

            switch (dock) {
                case DockSide.Right:
                    Left = wa.Right - Width; Top = wa.Top + (wa.Height - Height) / 2;
                    textPill.Margin = new Thickness(0, 0, gap, 0);
                    Grid.SetColumn(textPill, 0); Grid.SetColumn(mainCapsule, 1);
                    row1.HorizontalAlignment = HorizontalAlignment.Right;
                    row2wrap.HorizontalAlignment = HorizontalAlignment.Right;
                    row2wrap.Margin = new Thickness(0, 5, 1, 0);
                    edgeHandle.Width = 12; edgeHandle.Height = 44;
                    Canvas.SetRight(edgeHandle, 2); Canvas.SetTop(edgeHandle, groupTop + 4);
                    Canvas.SetRight(hoverGroup, edge); Canvas.SetTop(hoverGroup, groupTop);
                    Canvas.SetRight(appPicker, edge + capW + gap); Canvas.SetTop(appPicker, groupTop);
                    break;

                case DockSide.Left:
                    Left = wa.Left; Top = wa.Top + (wa.Height - Height) / 2;
                    textPill.Margin = new Thickness(gap, 0, 0, 0);
                    Grid.SetColumn(mainCapsule, 0); Grid.SetColumn(textPill, 1);
                    row1.HorizontalAlignment = HorizontalAlignment.Left;
                    row2wrap.HorizontalAlignment = HorizontalAlignment.Left;
                    row2wrap.Margin = new Thickness(1, 5, 0, 0);
                    edgeHandle.Width = 12; edgeHandle.Height = 44;
                    Canvas.SetLeft(edgeHandle, 2); Canvas.SetTop(edgeHandle, groupTop + 4);
                    Canvas.SetLeft(hoverGroup, edge); Canvas.SetTop(hoverGroup, groupTop);
                    Canvas.SetLeft(appPicker, edge + capW + gap); Canvas.SetTop(appPicker, groupTop);
                    break;

                case DockSide.Bottom:
                    Left = wa.Left + (wa.Width - Width) / 2; Top = wa.Bottom - Height;
                    textPill.Margin = new Thickness(0, 0, gap, 0);
                    Grid.SetColumn(textPill, 0); Grid.SetColumn(mainCapsule, 1);
                    // Capsule column sits on the screen centre; pill hangs to its left
                    row1.HorizontalAlignment = HorizontalAlignment.Right;
                    row2wrap.HorizontalAlignment = HorizontalAlignment.Right;
                    row2wrap.Margin = new Thickness(0, 5, 1, 0);
                    edgeHandle.Width = 44; edgeHandle.Height = 12;
                    Canvas.SetLeft(edgeHandle, (BaseW - 44) / 2); Canvas.SetTop(edgeHandle, BaseH - 14);
                    Canvas.SetRight(hoverGroup, BaseW / 2 - capW / 2); Canvas.SetTop(hoverGroup, BaseH - groupH - edge);
                    Canvas.SetLeft(appPicker, BaseW / 2 + capW / 2 + gap); Canvas.SetTop(appPicker, BaseH - groupH - edge);
                    break;
            }
            SetIdle();
        }

        private string DockPath() {
            string dir = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "waitplay");
            try { if (!System.IO.Directory.Exists(dir)) System.IO.Directory.CreateDirectory(dir); } catch {}
            return System.IO.Path.Combine(dir, ".waitplay-dock.txt");
        }
        private void SaveDock() { try { System.IO.File.WriteAllText(DockPath(), dock.ToString()); } catch {} }
        private void LoadDock() {
            try {
                string p = DockPath();
                if (System.IO.File.Exists(p)) {
                    string v = System.IO.File.ReadAllText(p).Trim();
                    if (v == "Left") dock = DockSide.Left;
                    else if (v == "Bottom") dock = DockSide.Bottom;
                    else dock = DockSide.Right;
                    return;
                }
            } catch {}
            dock = DockSide.Right;
        }

        // ════════════════════════════════════════════════════════════
        //  Toggle & visuals — design.md forest green accent
        // ════════════════════════════════════════════════════════════
        private void ToggleEnabled() {
            isEnabled = !isEnabled;
            WaitPlayStateManager.SetEnabled(isEnabled);
            UpdateVisuals();
            if (!isEnabled) {
                if (activeGameWindow != null) { try { activeGameWindow.Close(); } catch {} activeGameWindow = null; }
                CloseOtherGameWindows();
            }
        }
        private void UpdateVisuals() {
            // Mirrors "Dictate **Caps Lock**": action in regular weight, hotkey (Alt+W) in bold
            pillAction.Text = isEnabled ? "Pause " : "Resume ";
            pillKey.Text = "Alt W";
            mainIcon.Stroke = new SolidColorBrush(isEnabled ? Txt : TxtSec);
            SetStatus(isEnabled ? Active : TxtSec);
        }
        private void SetStatus(Color c) { secDot.Fill = new SolidColorBrush(c); }

        // ════════════════════════════════════════════════════════════
        //  Agent polling
        // ════════════════════════════════════════════════════════════
        private void PollStatus() {
            if (!isEnabled) return;
            System.Threading.ThreadPool.QueueUserWorkItem(_ => {
                try {
                    var req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:3150/sessions");
                    req.Timeout = 400;
                    using (var res = (HttpWebResponse)req.GetResponse())
                    using (var r = new StreamReader(res.GetResponseStream())) {
                        string json = r.ReadToEnd();
                        Dispatcher.BeginInvoke(new Action(() => ParseSessions(json)));
                    }
                } catch {
                    Dispatcher.BeginInvoke(new Action(() => { if (isEnabled) SetStatus(Active); }));
                }
            });
        }
        private void ParseSessions(string json) {
            try {
                var root = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(json);
                if (root == null || !root.ContainsKey("sessions")) return;
                var sessions = root["sessions"] as System.Collections.ArrayList; if (sessions == null) return;
                long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                bool working = false, waiting = false;
                foreach (object item in sessions) {
                    var s = item as Dictionary<string, object>; if (s == null) continue;
                    string st = s.ContainsKey("status") ? Convert.ToString(s["status"]) : "";
                    long ev = s.ContainsKey("lastEventAt") && s["lastEventAt"] != null ? Convert.ToInt64(s["lastEventAt"]) : 0;
                    if ((now - ev) > 15000) continue;
                    if (st == "WORKING" || st == "GAME_ACTIVE") working = true;
                    else if (st == "WAITING_FOR_INPUT") waiting = true;
                }
                if (working) SetStatus(WorkDot);
                else if (waiting) SetStatus(AmberDot);
                else SetStatus(Active);
            } catch {}
        }

        // ════════════════════════════════════════════════════════════
        //  Launch
        // ════════════════════════════════════════════════════════════
        private void LaunchSite(string site) {
            try {
                var psi = new ProcessStartInfo(Process.GetCurrentProcess().MainModule.FileName, "--game --site=" + site);
                psi.UseShellExecute = false; psi.CreateNoWindow = true; Process.Start(psi);
            } catch {}
        }
        private void OpenGameWindow() {
            try {
                if (!isEnabled) { isEnabled = true; WaitPlayStateManager.SetEnabled(true); UpdateVisuals(); }
                if (activeGameWindow == null || !activeGameWindow.IsLoaded) {
                    activeGameWindow = new MainWindow("", 0, "Desktop", 0, IntPtr.Zero);
                    activeGameWindow.Closed += (s,e) => { activeGameWindow = null; };
                    activeGameWindow.Show(); activeGameWindow.Activate();
                } else { activeGameWindow.Show(); activeGameWindow.Activate(); }
            } catch {}
        }
        private void CloseOtherGameWindows() {
            try {
                int pid = Process.GetCurrentProcess().Id;
                foreach (var p in Process.GetProcessesByName("WaitPlay")) {
                    if (p.Id != pid) { try { p.CloseMainWindow(); if (!p.WaitForExit(150)) p.Kill(); } catch {} }
                }
            } catch {}
        }

        private IntPtr HwndHook(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled) {
            if (msg == 0x0312 && wParam.ToInt32() == HOTKEY_ID) { ToggleEnabled(); handled = true; }
            return IntPtr.Zero;
        }
    }

    // Identifies the Windows Terminal tab a session belongs to. All WT tabs share one top-level window,
    // so foreground checks can't see a tab switch; UI Automation exposes the tab strip instead.
    // Tabs are tracked by position: UIA RuntimeIds are NOT stable (WT rebuilds a tab's peer when it is
    // selected/hovered), and titles churn (agent spinners). When tabs are added or closed, the tab is
    // re-located by its ASCII-only title; if it can't be found, the tab is gone.
    internal class TerminalTabTracker {
        private readonly IntPtr hwnd;
        private System.Windows.Automation.AutomationElement strip;
        private int ownIndex;
        private string ownTitle;
        private int lastCount;
        public bool Gone { get; private set; }   // the session's tab was closed
        private int pendingCount = -1, pendingPolls = 0;

        private static readonly System.Windows.Automation.Condition TabItemCond =
            new System.Windows.Automation.PropertyCondition(System.Windows.Automation.AutomationElement.ControlTypeProperty, System.Windows.Automation.ControlType.TabItem);

        private TerminalTabTracker(IntPtr hwnd) { this.hwnd = hwnd; }

        // Null when the window has no tab strip (non-tabbed terminal): caller then goes by window only.
        public static TerminalTabTracker Capture(IntPtr hwnd) {
            var t = new TerminalTabTracker(hwnd);
            var items = t.Items();
            if (items == null) return null;
            for (int i = 0; i < items.Count; i++) {
                if (!IsSelected(items[i])) continue;
                t.ownIndex = i; t.ownTitle = StableTitle(items[i]); t.lastCount = items.Count;
                return t;
            }
            return null;
        }

        // true: our tab is selected; false: another tab is; null: unknown (minimized, UIA error, tab list
        // in flux, or tab gone — see Gone).
        public bool? OwnTabSelected() {
            if (Gone) return null;
            // A minimized WT exposes an empty/partial tab list; don't read anything into it
            if (ParentWindowTracker.IsIconic(hwnd)) { pendingPolls = 0; return null; }
            var items = Items();
            if (items == null || items.Count == 0) return null;
            if (items.Count != lastCount) {
                // Only trust a new tab count once it has held for 3 polls (~450ms): right after a
                // restore WT briefly reports a partial list, which must not look like closed tabs.
                if (items.Count != pendingCount) { pendingCount = items.Count; pendingPolls = 1; return null; }
                if (++pendingPolls < 3) return null;
                bool grew = items.Count > lastCount;
                lastCount = items.Count;
                pendingCount = -1;
                if (!Relocate(items, grew)) { Gone = true; return null; }
            } else {
                pendingCount = -1;
            }
            if (ownIndex >= items.Count) return null;
            bool selected = IsSelected(items[ownIndex]);
            if (selected) ownTitle = StableTitle(items[ownIndex]);   // follow renames while we're looking at it
            return selected;
        }

        // Tabs were opened/closed: find ours again by title, preferring the slot nearest its old position.
        // If the title changed while unselected and tabs were only added (WT appends them), keep our slot.
        private bool Relocate(List<System.Windows.Automation.AutomationElement> items, bool grew) {
            int best = -1;
            for (int i = 0; i < items.Count; i++) {
                if (StableTitle(items[i]) != ownTitle) continue;
                if (best < 0 || Math.Abs(i - ownIndex) < Math.Abs(best - ownIndex)) best = i;
            }
            if (best < 0) return grew && ownIndex < items.Count;
            ownIndex = best;
            return true;
        }

        private List<System.Windows.Automation.AutomationElement> Items() {
            try {
                if (strip == null) {
                    var root = System.Windows.Automation.AutomationElement.FromHandle(hwnd);
                    strip = root.FindFirst(System.Windows.Automation.TreeScope.Descendants,
                        new System.Windows.Automation.PropertyCondition(System.Windows.Automation.AutomationElement.ControlTypeProperty, System.Windows.Automation.ControlType.Tab));
                    if (strip == null) return null;
                }
                var list = new List<System.Windows.Automation.AutomationElement>();
                foreach (System.Windows.Automation.AutomationElement e in strip.FindAll(System.Windows.Automation.TreeScope.Descendants, TabItemCond)) list.Add(e);
                return list;
            } catch {
                strip = null;   // stale element (e.g. tab row rebuilt): look it up again next time
                return null;
            }
        }

        private static bool IsSelected(System.Windows.Automation.AutomationElement e) {
            try { return ((System.Windows.Automation.SelectionItemPattern)e.GetCurrentPattern(System.Windows.Automation.SelectionItemPattern.Pattern)).Current.IsSelected; }
            catch { return false; }
        }

        // Title with spinner/emoji/status glyphs removed: ASCII only, leading punctuation trimmed
        private static string StableTitle(System.Windows.Automation.AutomationElement e) {
            string name;
            try { name = e.Current.Name ?? ""; } catch { return ""; }
            var sb = new StringBuilder();
            foreach (char ch in name) if (ch >= 0x20 && ch < 0x7F) sb.Append(ch);
            string s = sb.ToString();
            int start = 0;
            while (start < s.Length && !char.IsLetterOrDigit(s[start])) start++;
            return s.Substring(start).Trim();
        }
    }

    // Fires when the user scrolls over, or types into, the watched terminal window — i.e. goes back to
    // reading the agent's output. Low-level hooks are installed only while a target is set, so nothing
    // sits in the system input path while the companion is hidden. Callbacks run on the UI thread.
    internal sealed class TerminalInputWatcher : IDisposable {
        private delegate IntPtr HookProc(int code, IntPtr wParam, IntPtr lParam);
        [StructLayout(LayoutKind.Sequential)] private struct POINT { public int X, Y; }
        [StructLayout(LayoutKind.Sequential)] private struct MSLLHOOKSTRUCT { public POINT pt; public uint mouseData, flags, time; public IntPtr extra; }
        [StructLayout(LayoutKind.Sequential)] private struct KBDLLHOOKSTRUCT { public uint vkCode, scanCode, flags, time; public IntPtr extra; }
        [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr SetWindowsHookEx(int idHook, HookProc fn, IntPtr hMod, uint threadId);
        [DllImport("user32.dll")] private static extern bool UnhookWindowsHookEx(IntPtr hook);
        [DllImport("user32.dll")] private static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr wParam, IntPtr lParam);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr GetModuleHandle(string name);
        [DllImport("user32.dll")] private static extern IntPtr WindowFromPoint(POINT p);
        [DllImport("user32.dll")] private static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
        [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int vk);

        private const int WH_KEYBOARD_LL = 13, WH_MOUSE_LL = 14, WM_KEYDOWN = 0x0100, WM_MOUSEWHEEL = 0x020A, WM_MOUSEHWHEEL = 0x020E;
        private const uint GA_ROOT = 2;
        private readonly HookProc mouseProc, keyProc;   // held in fields so the GC can't collect them while hooked
        private IntPtr mouseHook = IntPtr.Zero, keyHook = IntPtr.Zero;
        private IntPtr target = IntPtr.Zero;
        public event Action Interacted;

        public TerminalInputWatcher() { mouseProc = OnMouse; keyProc = OnKey; }

        public IntPtr Target {
            get { return target; }
            set {
                if (value == target) return;
                target = value;
                if (target != IntPtr.Zero && mouseHook == IntPtr.Zero) {
                    IntPtr mod = GetModuleHandle(null);
                    mouseHook = SetWindowsHookEx(WH_MOUSE_LL, mouseProc, mod, 0);
                    keyHook = SetWindowsHookEx(WH_KEYBOARD_LL, keyProc, mod, 0);
                } else if (target == IntPtr.Zero) {
                    Unhook();
                }
            }
        }

        private IntPtr OnMouse(int code, IntPtr wParam, IntPtr lParam) {
            if (code >= 0 && target != IntPtr.Zero) {
                int msg = wParam.ToInt32();
                if (msg == WM_MOUSEWHEEL || msg == WM_MOUSEHWHEEL) {
                    var info = (MSLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(MSLLHOOKSTRUCT));
                    if (GetAncestor(WindowFromPoint(info.pt), GA_ROOT) == target) Fire();
                }
            }
            return CallNextHookEx(mouseHook, code, wParam, lParam);
        }

        // WM_KEYDOWN only: Alt combinations arrive as WM_SYSKEYDOWN and are ignored by design.
        private IntPtr OnKey(int code, IntPtr wParam, IntPtr lParam) {
            if (code >= 0 && target != IntPtr.Zero && wParam.ToInt32() == WM_KEYDOWN && GetForegroundWindow() == target) {
                var info = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));
                if (!IsModifier(info.vkCode) && !ChordHeld()) Fire();
            }
            return CallNextHookEx(keyHook, code, wParam, lParam);
        }

        // Shift/Ctrl/Alt (incl. left/right), Win, CapsLock on their own don't count
        private static bool IsModifier(uint vk) { return (vk >= 0x10 && vk <= 0x12) || (vk >= 0xA0 && vk <= 0xA5) || vk == 0x5B || vk == 0x5C || vk == 0x14; }
        // Ctrl/Win chords are terminal or OS shortcuts (Ctrl+Tab switches tabs), not reading the output
        private static bool ChordHeld() {
            return (GetAsyncKeyState(0x11) & 0x8000) != 0 || (GetAsyncKeyState(0x5B) & 0x8000) != 0 || (GetAsyncKeyState(0x5C) & 0x8000) != 0;
        }

        // One-shot until the companion sets a target again
        private void Fire() {
            Target = IntPtr.Zero;
            var h = Interacted;
            if (h != null) h();
        }

        private void Unhook() {
            if (mouseHook != IntPtr.Zero) { UnhookWindowsHookEx(mouseHook); mouseHook = IntPtr.Zero; }
            if (keyHook != IntPtr.Zero) { UnhookWindowsHookEx(keyHook); keyHook = IntPtr.Zero; }
        }
        public void Dispose() { target = IntPtr.Zero; Unhook(); }
    }

    // Full-work-area overlay shown while dragging the widget: light dim, three drop zones
    // (left, right, bottom) and a small dark ball under the cursor. Purely visual: the widget
    // keeps mouse capture and feeds cursor positions in.
    internal class DockDragOverlay : Window {
        private readonly Canvas canvas;
        private readonly Ellipse[] zones = new Ellipse[3];   // indexed by (int)DockSide
        private readonly Point[] centers = new Point[3];
        private readonly Border ball;
        private DockSide? active;
        const double BallSize = 34;

        public DockDragOverlay(Geometry icon, Color iconColor, Color ballBg, Color ballBrd) {
            Rect wa = SystemParameters.WorkArea;
            WindowStyle = WindowStyle.None; AllowsTransparency = true; Background = Brushes.Transparent;
            Topmost = true; ShowInTaskbar = false; ShowActivated = false; ResizeMode = ResizeMode.NoResize;
            IsHitTestVisible = false;
            Left = wa.Left; Top = wa.Top; Width = wa.Width; Height = wa.Height;

            canvas = new Canvas { Width = wa.Width, Height = wa.Height, ClipToBounds = true };
            canvas.Children.Add(new Rectangle { Width = wa.Width, Height = wa.Height, Fill = new SolidColorBrush(Color.FromArgb(70, 0, 0, 0)) });

            // Zone centres sit where each dock's capsule lands; side zones are half-tucked past the edge
            centers[(int)DockSide.Right]  = new Point(wa.Width - 22, wa.Height / 2);
            centers[(int)DockSide.Left]   = new Point(22, wa.Height / 2);
            centers[(int)DockSide.Bottom] = new Point(wa.Width / 2, wa.Height - 18);
            for (int i = 0; i < 3; i++) {
                bool bottom = i == (int)DockSide.Bottom;
                double w = bottom ? 128 : 80, h = bottom ? 92 : 116;
                var z = new Ellipse {
                    Width = w, Height = h,
                    Fill = new SolidColorBrush(Color.FromRgb(225, 225, 225)),
                    Opacity = 0.55,
                    RenderTransformOrigin = new Point(0.5, 0.5),
                    RenderTransform = new ScaleTransform(1, 1)
                };
                Canvas.SetLeft(z, centers[i].X - w / 2); Canvas.SetTop(z, centers[i].Y - h / 2);
                zones[i] = z; canvas.Children.Add(z);
            }

            ball = new Border {
                Width = BallSize, Height = BallSize, CornerRadius = new CornerRadius(BallSize / 2),
                Background = new SolidColorBrush(ballBg), BorderBrush = new SolidColorBrush(ballBrd), BorderThickness = new Thickness(1),
                Child = new System.Windows.Shapes.Path {
                    Data = icon, Stroke = new SolidColorBrush(iconColor), StrokeThickness = 2, Width = 14, Height = 14,
                    Stretch = Stretch.Uniform, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center
                },
                Effect = new System.Windows.Media.Effects.DropShadowEffect { BlurRadius = 12, ShadowDepth = 2, Opacity = 0.35, Direction = 270 }
            };
            Canvas.SetLeft(ball, -100); Canvas.SetTop(ball, -100);
            canvas.Children.Add(ball);
            Content = canvas;

            Opacity = 0;
            Loaded += (s, e) => BeginAnimation(OpacityProperty, new DoubleAnimation(1, TimeSpan.FromMilliseconds(120)));
        }

        public DockSide Nearest(Point screen) {
            Point p = PointFromScreen(screen);
            int best = 0; double bestD = double.MaxValue;
            for (int i = 0; i < 3; i++) {
                double d = (p - centers[i]).LengthSquared;
                if (d < bestD) { bestD = d; best = i; }
            }
            return (DockSide)best;
        }

        public void MoveBall(Point screen) {
            Point p = PointFromScreen(screen);
            Canvas.SetLeft(ball, p.X - BallSize / 2); Canvas.SetTop(ball, p.Y - BallSize / 2);
            Highlight(Nearest(screen));
        }

        private void Highlight(DockSide side) {
            if (active == side) return;
            active = side;
            var dur = TimeSpan.FromMilliseconds(120);
            for (int i = 0; i < 3; i++) {
                bool on = i == (int)side;
                var st = (ScaleTransform)zones[i].RenderTransform;
                zones[i].BeginAnimation(OpacityProperty, new DoubleAnimation(on ? 0.9 : 0.55, dur));
                st.BeginAnimation(ScaleTransform.ScaleXProperty, new DoubleAnimation(on ? 1.08 : 1, dur));
                st.BeginAnimation(ScaleTransform.ScaleYProperty, new DoubleAnimation(on ? 1.08 : 1, dur));
            }
        }

        // Glide the ball into the chosen zone, fade out, then hand control back
        public void SnapTo(DockSide side, Action done) {
            Highlight(side);
            Point c = centers[(int)side];
            var dur = TimeSpan.FromMilliseconds(160);
            var ease = new CubicEase { EasingMode = EasingMode.EaseOut };
            ball.BeginAnimation(Canvas.LeftProperty, new DoubleAnimation(c.X - BallSize / 2, dur) { EasingFunction = ease });
            var top = new DoubleAnimation(c.Y - BallSize / 2, dur) { EasingFunction = ease };
            top.Completed += (s, e) => {
                var fade = new DoubleAnimation(0, TimeSpan.FromMilliseconds(120));
                fade.Completed += (s2, e2) => done();
                BeginAnimation(OpacityProperty, fade);
            };
            ball.BeginAnimation(Canvas.TopProperty, top);
        }
    }

    public static class EntryPoint {
        private static Mutex singleInstanceMutex = null;

        [DllImport("user32.dll")]
        public static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll")]
        public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

        private static void BringExistingWindowToFront() {
            if (!WaitPlayStateManager.IsEnabled()) return;
            try {
                var procs = System.Diagnostics.Process.GetProcessesByName("WaitPlay");
                int currentPid = System.Diagnostics.Process.GetCurrentProcess().Id;
                foreach (var p in procs) {
                    if (p.Id != currentPid && p.MainWindowHandle != IntPtr.Zero) {
                        string title = p.MainWindowTitle;
                        if (!string.IsNullOrEmpty(title) && title.Contains("Widget")) continue;
                        ShowWindowAsync(p.MainWindowHandle, 9);
                        SetForegroundWindow(p.MainWindowHandle);
                        SetWindowPos(p.MainWindowHandle, (IntPtr)(-1), 0, 0, 0, 0, 0x0003);
                        break;
                    }
                }
            } catch {}
        }

        [STAThread]
        public static void Main(string[] args) {
            bool launchWidget = false;
            bool toggleOnly = false;
            bool forceGame = false;
            string targetSession = "";
            string terminal = "";
            long promptTime = 0;
            uint parentPid = 0;
            IntPtr parentHwnd = IntPtr.Zero;

            IntPtr initialForeground = ParentWindowTracker.GetForegroundWindow();
            uint currentPid = (uint)System.Diagnostics.Process.GetCurrentProcess().Id;
            uint fgPid;
            ParentWindowTracker.GetWindowThreadProcessId(initialForeground, out fgPid);
            if (fgPid == currentPid) initialForeground = IntPtr.Zero;

            if (args != null && args.Length > 0) {
                foreach (var a in args) {
                    if (a == "--widget" || a == "--flow") {
                        launchWidget = true;
                    } else if (a == "--toggle") {
                        toggleOnly = true;
                    } else if (a == "--game" || a == "--open") {
                        forceGame = true;
                        if (string.IsNullOrEmpty(terminal)) terminal = "Desktop";
                    } else if (a.StartsWith("--site=")) {
                        string site = a.Substring("--site=".Length).ToLower();
                        if (site == "youtube" || site == "yt") MainWindow.StartUrl = "https://www.youtube.com/";
                        else if (site == "x" || site == "twitter") MainWindow.StartUrl = "https://x.com/home";
                        else MainWindow.StartUrl = "https://www.instagram.com/";
                        forceGame = true;
                        if (string.IsNullOrEmpty(terminal)) terminal = "Desktop";
                    } else if (a.StartsWith("--session=")) {
                        targetSession = a.Substring("--session=".Length);
                    } else if (a.StartsWith("--terminal=")) {
                        terminal = a.Substring("--terminal=".Length).Trim('"', '\'');
                    } else if (a.StartsWith("--promptTime=")) {
                        long.TryParse(a.Substring("--promptTime=".Length), out promptTime);
                    } else if (a.StartsWith("--parentPid=")) {
                        uint.TryParse(a.Substring("--parentPid=".Length), out parentPid);
                    } else if (a.StartsWith("--parentHwnd=")) {
                        long h;
                        if (long.TryParse(a.Substring("--parentHwnd=".Length), out h)) {
                            parentHwnd = (IntPtr)h;
                        }
                    } else if (a.Contains("omp")) {
                        targetSession = "omp-session";
                    } else if (a.Contains("codex") || a.Contains("chatgpt")) {
                        targetSession = "codex-session";
                    } else if (a.Contains("opencode")) {
                        targetSession = "opencode-session";
                    } else if (a.Contains("cline")) {
                        targetSession = "cline-session";
                    } else if (a.StartsWith("--dock=")) {
                        string d = a.Substring("--dock=".Length).ToLower();
                        try {
                            string p = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "waitplay", ".waitplay-widget-pos.json");
                            var dict = new Dictionary<string, object>();
                            if (d == "left") dict["dock"] = "Left";
                            else if (d == "right") dict["dock"] = "Right";
                            else if (d == "bottom") dict["dock"] = "Bottom";
                            else dict["dock"] = "Free";
                            dict["left"] = 250;
                            dict["top"] = 250;
                            var ser = new JavaScriptSerializer();
                            string json = ser.Serialize(dict);
                            System.IO.File.WriteAllText(p, json);
                            try { System.IO.File.WriteAllText(@"C:\Users\ASUS\waitplay\.waitplay-widget-pos.json", json); } catch {}
                        } catch {}
                        return;
                    }
                }
            }

            if (toggleOnly) {
                bool newState = WaitPlayStateManager.Toggle();
                Console.WriteLine("WaitPlay enabled: " + newState);
                return;
            }

            if (forceGame && !WaitPlayStateManager.IsEnabled()) {
                WaitPlayStateManager.SetEnabled(true);
            }

            // If WaitPlay is turned OFF and this is NOT a forced game or widget launch:
            if (!forceGame && !launchWidget && !WaitPlayStateManager.IsEnabled()) {
                return; // Silently skip popup
            }

            if (parentHwnd == IntPtr.Zero && parentPid > 0) {
                parentHwnd = ParentWindowTracker.FindTopWindowForPid(parentPid);
            }
            if (parentHwnd == IntPtr.Zero && initialForeground != IntPtr.Zero) {
                parentHwnd = initialForeground;
            }

            if (string.IsNullOrEmpty(targetSession) && !launchWidget && !forceGame) {
                // By default when run with no arguments, launch the Wispr Flow widget!
                launchWidget = true;
            }

            if (launchWidget) {
                var app = new Application();
                app.Run(new FloatingFlowWidget());
                return;
            }

            if (DismissalTracker.IsPromptDismissed(targetSession)) {
                return;
            }

            const string mutexName = "WaitPlay_Native_SingleInstance_Mutex";
            bool createdNew;

            singleInstanceMutex = new Mutex(true, mutexName, out createdNew);

            if (!createdNew) {
                if (!WaitPlayStateManager.IsEnabled()) {
                    return;
                }
                // Hand the launch to the running companion. One file per session so simultaneous
                // prompts from different terminals can't overwrite each other; written under a name
                // the companion doesn't scan, then renamed, so it never reads a half-written line.
                try {
                    string dir = MainWindow.SignalDir();
                    if (!System.IO.Directory.Exists(dir)) System.IO.Directory.CreateDirectory(dir);
                    string id = MainWindow.SignalFileId(targetSession);
                    string final = System.IO.Path.Combine(dir, ".waitplay-launch-" + id + ".txt");
                    string pending = System.IO.Path.Combine(dir, ".pending-launch-" + id + "-" + currentPid);
                    IntPtr passHwnd = parentHwnd != IntPtr.Zero ? parentHwnd : initialForeground;
                    System.IO.File.WriteAllText(pending, targetSession + "|" + terminal + "|" + DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + "|" + passHwnd.ToInt64());
                    try { System.IO.File.Delete(final); } catch {}
                    System.IO.File.Move(pending, final);
                } catch {}
                BringExistingWindowToFront();
                return;
            }

            try {
                var app = new Application();
                MainWindow.OwnsSignalFiles = true;
                app.Run(new MainWindow(targetSession, promptTime, terminal, parentPid, parentHwnd));
            } finally {
                if (singleInstanceMutex != null) {
                    try { singleInstanceMutex.ReleaseMutex(); } catch {}
                    singleInstanceMutex.Close();
                }
            }
        }
    }
}
