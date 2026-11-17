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
        private DispatcherTimer exitTimer;
        private int countdownRemaining = 8;

        private DispatcherTimer gameTimer;
        private DispatcherTimer statusPollTimer;
        private DispatcherTimer pulseTimer;
        private bool dotState = false;
        private bool hasFinished = false;
        private bool hasBeenActive = false;
        private string activeAgentName = "AI Agent";
        private Button btnExit;
        private TextBlock hintText;
        private string targetSessionId = "";
        private string terminalLabel = "";
        private long currentPromptTimestamp = 0;
        private int debounceCompletedTicks = 0;
        private int idleTicks = 0;
        private Border terminalPill;
        private TextBlock terminalText;
        private IntPtr monitoredWindowHandle = IntPtr.Zero;
        private uint parentProcessId = 0;
        private bool wasMinimizedByParent = false;
        private IntPtr myHwnd = IntPtr.Zero;
        private int missingParentTicks = 0;
        private Microsoft.Web.WebView2.Wpf.WebView2 webView;
        private DispatcherTimer webReadyTimer;
        private const int WEB_PORT = 5200;
        private const string HOME_URL = "https://www.instagram.com/";
        private const string YT_URL = "https://www.youtube.com/";
        private const string X_URL = "https://x.com/home";
        internal static string StartUrl = null;
        private TextBox addressBar;
        private Button btnBack;
        private Button btnForward;
        private bool isFullscreen = false;
        private Rect savedBounds;

        public MainWindow(string sessionId = "", long promptTime = 0, string terminal = "", uint parentPid = 0, IntPtr parentHwnd = default(IntPtr)) {
            this.targetSessionId = sessionId;
            this.currentPromptTimestamp = promptTime;
            this.terminalLabel = terminal;
            this.parentProcessId = parentPid;
            this.monitoredWindowHandle = parentHwnd;

            if (this.monitoredWindowHandle == IntPtr.Zero && this.parentProcessId > 0) {
                this.monitoredWindowHandle = ParentWindowTracker.FindTopWindowForPid(this.parentProcessId);
            }

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

            if (this.monitoredWindowHandle == IntPtr.Zero && this.terminalLabel != "Desktop") {
                this.monitoredWindowHandle = ParentWindowTracker.FindWindowForAgent(this.activeAgentName);
            }

            InitializeWindow();
            BuildUI();
            // Game disabled: the companion opens the Instagram browser directly.
            StartMonitoring();
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

            // Responsive sizing: use 35% of screen width, 50% of screen height
            double screenW = SystemParameters.WorkArea.Width;
            double screenH = SystemParameters.WorkArea.Height;
            Width = Math.Max(420, Math.Min(700, screenW * 0.35));
            Height = Math.Max(400, Math.Min(800, screenH * 0.55));
            MinWidth = 360;
            MinHeight = 320;

            // Position in bottom-right corner with padding
            WindowStartupLocation = WindowStartupLocation.Manual;
            Left = screenW - Width - 16;
            Top = screenH - Height - 16;

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
            StateChanged += (s, e) => {
                if (this.WindowState != WindowState.Minimized) {
                    wasMinimizedByParent = false;
                }
            };
            Closing += (s, e) => {
                if (hasBeenActive && !hasFinished) {
                    RecordUserDismiss();
                }
            };
            KeyDown += (s, e) => {
                if (hasFinished && bannerBorder != null && bannerBorder.Visibility == Visibility.Visible) {
                    if (e.Key == Key.Enter || e.Key == Key.Escape) {
                        Close();
                    } else if (e.Key == Key.Space) {
                        bannerBorder.Visibility = Visibility.Collapsed;
                    }
                } else if (e.Key == Key.Escape) {
                    if (hasBeenActive && !hasFinished) {
                        RecordUserDismiss();
                    }
                    Close();
                }
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
            btnMin.Click += (s, e) => {
                wasMinimizedByParent = false;
                WindowState = WindowState.Minimized;
            };

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
            btnClose.Click += (s, e) => {
                if (hasBeenActive && !hasFinished) {
                    RecordUserDismiss();
                }
                Close();
            };

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
                if (exitTimer != null) {
                    exitTimer.Stop();
                    exitTimer = null;
                }
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
                if (!hasFinished) {
                    StartGame();
                }
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

            // Bridge-independent close signal: any watcher can request close by
            // writing { sessionId, ts } so completion works without the bridge.
            try {
                string closeFile = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "waitplay", ".waitplay-close.json");
                if (System.IO.File.Exists(closeFile)) {
                    string cj = System.IO.File.ReadAllText(closeFile);
                    var cser = new JavaScriptSerializer();
                    var cdict = cser.Deserialize<Dictionary<string, object>>(cj);
                    if (cdict != null) {
                        string csid = cdict.ContainsKey("sessionId") ? Convert.ToString(cdict["sessionId"]) : "";
                        long cts = cdict.ContainsKey("ts") && cdict["ts"] != null ? Convert.ToInt64(cdict["ts"]) : 0;
                        long cnow = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                        if (cts > 0 && (cnow - cts) < 6000 &&
                            (csid == "*" || string.Equals(csid, targetSessionId, StringComparison.OrdinalIgnoreCase))) {
                            try { System.IO.File.Delete(closeFile); } catch {}
                            OnTurnCompleted();
                            return;
                        }
                    }
                }
            } catch {}
            // 1. Check IPC file for session switch requested by another process
            try {
                string ipcFile = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "waitplay", ".waitplay-active-session.txt");
                if (System.IO.File.Exists(ipcFile)) {
                    string content = System.IO.File.ReadAllText(ipcFile).Trim();
                    string[] parts = content.Split('|');
                    if (parts.Length >= 2) {
                        string reqSession = parts[0];
                        string reqTerm = parts.Length >= 3 ? parts[1] : "";
                        long reqTime = 0;
                        if (parts.Length >= 3) long.TryParse(parts[2], out reqTime);
                        long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                        if ((now - reqTime) < 10000 && !string.IsNullOrEmpty(reqSession)) {
                            if (reqSession != targetSessionId) {
                                targetSessionId = reqSession;
                                activeAgentName = GetAgentDisplayName(reqSession);
                                statusPillText.Text = string.Format("{0} is Working...", activeAgentName);
                                if (!string.IsNullOrEmpty(reqTerm)) {
                                    terminalLabel = reqTerm;
                                    terminalText.Text = reqTerm;
                                    terminalPill.Visibility = Visibility.Visible;
                                }
                            }
                            if (parts.Length >= 4) {
                                long h;
                                if (long.TryParse(parts[3], out h) && h != 0) {
                                    monitoredWindowHandle = (IntPtr)h;
                                }
                            }
                            if (parts.Length >= 5) {
                                uint p;
                                if (uint.TryParse(parts[4], out p) && p != 0) {
                                    parentProcessId = p;
                                    if (monitoredWindowHandle == IntPtr.Zero) {
                                        monitoredWindowHandle = ParentWindowTracker.FindTopWindowForPid(p);
                                    }
                                }
                            }
                        }
                    }
                }
            } catch {}

            // Fallback resolution of parent window if still unknown
            if (monitoredWindowHandle == IntPtr.Zero && terminalLabel != "Desktop") {
                if (parentProcessId > 0) {
                    monitoredWindowHandle = ParentWindowTracker.FindTopWindowForPid(parentProcessId);
                }
                if (monitoredWindowHandle == IntPtr.Zero) {
                    monitoredWindowHandle = ParentWindowTracker.FindWindowForAgent(activeAgentName);
                }
            }

            // Sync with parent window state (minimize / restore / close)
            if (monitoredWindowHandle != IntPtr.Zero) {
                if (!ParentWindowTracker.IsWindow(monitoredWindowHandle)) {
                    missingParentTicks++;
                    if (missingParentTicks >= 5) {
                        // Parent gone: detach tracking instead of closing
                        monitoredWindowHandle = IntPtr.Zero;
                        missingParentTicks = 0;
                    }
                } else {
                    missingParentTicks = 0;
                    bool isParentMin = ParentWindowTracker.IsIconic(monitoredWindowHandle);
                    if (isParentMin) {
                        if (this.WindowState != WindowState.Minimized && !wasMinimizedByParent) {
                            wasMinimizedByParent = true;
                            this.WindowState = WindowState.Minimized;
                            if (myHwnd != IntPtr.Zero) {
                                ParentWindowTracker.ShowWindowAsync(myHwnd, 6); // SW_MINIMIZE
                            }
                        }
                    } else {
                        if (wasMinimizedByParent && this.WindowState == WindowState.Minimized) {
                            if (!WaitPlayStateManager.IsEnabled()) {
                                // Don't close, just skip restore
                                return;
                            }
                            wasMinimizedByParent = false;
                            if (myHwnd != IntPtr.Zero) {
                                ParentWindowTracker.ShowWindowAsync(myHwnd, 9); // SW_RESTORE
                            }
                            this.WindowState = WindowState.Normal;
                            Topmost = true;
                        }
                    }
                }
            }
            try {
                string url = string.Format("http://127.0.0.1:{0}/sessions", BRIDGE_PORT);
                var request = (HttpWebRequest)WebRequest.Create(url);
                request.Timeout = 400;
                request.Method = "GET";

                using (var response = (HttpWebResponse)request.GetResponse()) {
                    if (response.StatusCode == HttpStatusCode.OK) {
                        using (var reader = new StreamReader(response.GetResponseStream())) {
                            string json = reader.ReadToEnd();
                            ParseSessionsJson(json);
                        }
                    }
                }
            } catch {
                // Bridge might be idle
            }
            CheckOmpNativeSession();
        }

        private void CheckOmpNativeSession() {
            try {
                string userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                string ompDir = System.IO.Path.Combine(userProfile, ".omp", "agent", "sessions", "-tmp");
                if (!System.IO.Directory.Exists(ompDir)) return;

                string latestFile = null;
                DateTime latestTime = DateTime.MinValue;
                var files = System.IO.Directory.GetFiles(ompDir, "*.jsonl");
                foreach (var f in files) {
                    var fi = new System.IO.FileInfo(f);
                    if (fi.LastWriteTime > latestTime) {
                        latestTime = fi.LastWriteTime;
                        latestFile = f;
                    }
                }
                if (latestFile == null || (DateTime.Now - latestTime).TotalSeconds > 10) return;
                // Read last 12KB of file
                using (var fs = new System.IO.FileStream(latestFile, System.IO.FileMode.Open, System.IO.FileAccess.Read, System.IO.FileShare.ReadWrite)) {
                    long len = fs.Length;
                    if (len == 0) return;
                    long seekPos = Math.Max(0, len - 12288);
                    fs.Seek(seekPos, System.IO.SeekOrigin.Begin);
                    using (var reader = new System.IO.StreamReader(fs)) {
                        string tail = reader.ReadToEnd();
                        string[] lines = tail.Split(new char[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                        if (lines.Length == 0) return;

                        for (int i = lines.Length - 1; i >= 0; i--) {
                            string line = lines[i].Trim();
                            if (string.IsNullOrEmpty(line) || !line.StartsWith("{")) continue;

                            var ser = new JavaScriptSerializer();
                            var entry = ser.Deserialize<Dictionary<string, object>>(line);
                            if (entry == null) continue;

                            string type = entry.ContainsKey("type") ? Convert.ToString(entry["type"]) : "";

                            if (type == "custom") {
                                string customType = entry.ContainsKey("customType") ? Convert.ToString(entry["customType"]) : "";
                                if (customType == "tool_execution_start") {
                                    hasBeenActive = true;
                                    idleTicks = 0;
                                    CancelPendingClose();
                                    break;
                                }
                            } else if (type == "message") {
                                var msg = entry.ContainsKey("message") ? entry["message"] as Dictionary<string, object> : null;
                                if (msg == null) continue;
                                string role = msg.ContainsKey("role") ? Convert.ToString(msg["role"]) : "";

                                if (role == "user" || role == "toolResult") {
                                    hasBeenActive = true;
                                    idleTicks = 0;
                                    CancelPendingClose();
                                    break;
                                } else if (role == "assistant") {
                                    string stopReason = msg.ContainsKey("stopReason") ? Convert.ToString(msg["stopReason"]) : "";
                                    var content = msg.ContainsKey("content") ? msg["content"] as ArrayList : null;
                                    bool hasToolCall = false;
                                    if (content != null) {
                                        foreach (object c in content) {
                                            var cd = c as Dictionary<string, object>;
                                            if (cd != null && cd.ContainsKey("type") && Convert.ToString(cd["type"]) == "toolCall") {
                                                hasToolCall = true;
                                                break;
                                            }
                                        }
                                    }

                                    if (hasToolCall || stopReason == "toolUse") {
                                        hasBeenActive = true;
                                        idleTicks = 0;
                                        CancelPendingClose();
                                        break;
                                    } else if (stopReason == "stop" || stopReason == "end_turn") {
                                        // Final assistant message is the newest log line: the
                                        // output is written. Arm the grace close (cancelled if
                                        // the agent resumes before it elapses).
                                        if (hasBeenActive) OnTurnCompleted();
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            } catch {}
        }


        private void RecordUserDismiss() {
            string sid = !string.IsNullOrEmpty(targetSessionId) ? targetSessionId : activeAgentName;
            DismissalTracker.RecordDismissal(sid);
        }

        private static bool IsWorking(Dictionary<string, object> s) {
            if (s == null || !s.ContainsKey("status")) return false;
            string st = Convert.ToString(s["status"]);
            return st == "WORKING" || st == "GAME_ACTIVE";
        }

        private void ParseSessionsJson(string json) {
            try {
                var serializer = new JavaScriptSerializer();
                var root = serializer.Deserialize<Dictionary<string, object>>(json);
                if (root == null || !root.ContainsKey("sessions")) return;

                var sessionsList = root["sessions"] as ArrayList;
                if (sessionsList == null) return;

                // Collect all currently working or input-waiting sessions within the last 20 seconds
                var workingSessions = new List<Dictionary<string, object>>();
                long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

                foreach (object item in sessionsList) {
                    var s = item as Dictionary<string, object>;
                    if (s == null) continue;
                    if (IsWorking(s) || Convert.ToString(s["status"]) == "WAITING_FOR_INPUT") {
                        long evTime = s.ContainsKey("lastEventAt") && s["lastEventAt"] != null ? Convert.ToInt64(s["lastEventAt"]) : 0;
                        if ((now - evTime) < 20000) {
                            workingSessions.Add(s);
                        }
                    }
                }

                Dictionary<string, object> activeSession = null;

                // 1. Try to find the targeted session among working sessions first
                if (!string.IsNullOrEmpty(targetSessionId)) {
                    foreach (var s in workingSessions) {
                        string sid = s.ContainsKey("sessionId") ? Convert.ToString(s["sessionId"]) : "";
                        string ag = s.ContainsKey("agent") ? Convert.ToString(s["agent"]) : "";
                        if (string.Equals(sid, targetSessionId, StringComparison.OrdinalIgnoreCase) ||
                            string.Equals(ag, targetSessionId, StringComparison.OrdinalIgnoreCase)) {
                            activeSession = s;
                            break;
                        }
                    }
                }

                // 2. If target session is not currently working, dynamically pick the working session with the most recent event!
                if (activeSession == null && workingSessions.Count > 0) {
                    workingSessions.Sort((a, b) => {
                        long tA = a.ContainsKey("lastEventAt") && a["lastEventAt"] != null ? Convert.ToInt64(a["lastEventAt"]) : 0;
                        long tB = b.ContainsKey("lastEventAt") && b["lastEventAt"] != null ? Convert.ToInt64(b["lastEventAt"]) : 0;
                        return tB.CompareTo(tA); // Newest event first!
                    });
                    activeSession = workingSessions[0];
                    targetSessionId = activeSession.ContainsKey("sessionId") ? Convert.ToString(activeSession["sessionId"]) : "";
                }

                // 3. Fallback to completed session if all working sessions settled
                if (activeSession == null && hasBeenActive) {
                    foreach (object item in sessionsList) {
                        var s = item as Dictionary<string, object>;
                        if (s == null) continue;
                        string sid = s.ContainsKey("sessionId") ? Convert.ToString(s["sessionId"]) : "";
                        if (string.Equals(sid, targetSessionId, StringComparison.OrdinalIgnoreCase)) {
                            activeSession = s;
                            break;
                        }
                    }
                }

                if (activeSession != null) {
                    string status = activeSession.ContainsKey("status") ? Convert.ToString(activeSession["status"]) : "";
                    if (activeSession.ContainsKey("currentTaskStartedAt") && activeSession["currentTaskStartedAt"] != null) {
                        try {
                            currentPromptTimestamp = Convert.ToInt64(activeSession["currentTaskStartedAt"]);
                        } catch {}
                    }

                    string rawAgent = activeSession.ContainsKey("agent") ? Convert.ToString(activeSession["agent"]) : "";
                    string rawSessionId = activeSession.ContainsKey("sessionId") ? Convert.ToString(activeSession["sessionId"]) : "";
                    string model = activeSession.ContainsKey("model") ? Convert.ToString(activeSession["model"]) : "";
                    string tool = activeSession.ContainsKey("tool") ? Convert.ToString(activeSession["tool"]) : "";

                    if (activeSession.ContainsKey("terminal") && activeSession["terminal"] != null) {
                        string t = Convert.ToString(activeSession["terminal"]);
                        if (!string.IsNullOrEmpty(t)) {
                            terminalLabel = t;
                            terminalText.Text = t;
                            terminalPill.Visibility = Visibility.Visible;
                        }
                    }

                    string agentName = GetAgentDisplayName(!string.IsNullOrEmpty(rawAgent) ? rawAgent : rawSessionId);
                    activeAgentName = agentName;
                    // Check dismissal for this specific session
                    string checkSid = !string.IsNullOrEmpty(targetSessionId) ? targetSessionId : rawSessionId;
                    if (DismissalTracker.IsPromptDismissed(checkSid)) {
                        Close();
                        return;
                    }

                    if (status == "WORKING" || status == "GAME_ACTIVE") {
                        hasBeenActive = true;
                        debounceCompletedTicks = 0;
                        idleTicks = 0;

                        if (hasFinished) {
                            hasFinished = false;
                            if (exitTimer != null) exitTimer.Stop();
                            bannerBorder.Visibility = Visibility.Collapsed;
                        }

                        if (workingSessions.Count > 1) {
                            statusPillText.Text = string.Format("{0} \u2022 {1} (+{2} active)", agentName, !string.IsNullOrEmpty(model) ? model : "Working", workingSessions.Count - 1);
                        } else if (!string.IsNullOrEmpty(model)) {
                            statusPillText.Text = string.Format("{0} \u2022 {1}", agentName, model);
                        } else {
                            statusPillText.Text = string.Format("{0} is Working...", agentName);
                        }

                        if (!string.IsNullOrEmpty(tool) && hintText != null) {
                            hintText.Text = string.Format("Active Tool: {0} \u2022 Working on your task...", tool);
                        }

                        statusPill.Background = new SolidColorBrush(Color.FromArgb(28, 3, 79, 70));
                        statusPill.BorderBrush = new SolidColorBrush(Color.FromArgb(80, 3, 79, 70));
                        statusDot.Fill = new SolidColorBrush(ForestColor);
                        statusPillText.Foreground = new SolidColorBrush(ForestColor);
                    }
                    else if (status == "WAITING_FOR_INPUT") {
                        hasBeenActive = true;
                        debounceCompletedTicks = 0;
                        idleTicks = 0;

                        if (hasFinished) {
                            hasFinished = false;
                            if (exitTimer != null) exitTimer.Stop();
                            bannerBorder.Visibility = Visibility.Collapsed;
                        }

                        statusPillText.Text = string.Format("\u23F8 {0} waiting for input", agentName);
                        statusPill.Background = new SolidColorBrush(Color.FromArgb(30, 255, 169, 70));
                        statusPill.BorderBrush = new SolidColorBrush(Color.FromArgb(120, 255, 169, 70));
                        statusDot.Fill = new SolidColorBrush(OrangeColor);
                        statusPillText.Foreground = new SolidColorBrush(Color.FromRgb(180, 83, 9));

                        string prompt = activeSession.ContainsKey("waitingForInputPrompt") ? Convert.ToString(activeSession["waitingForInputPrompt"]) : "";
                        if (!string.IsNullOrEmpty(prompt) && hintText != null) {
                            hintText.Text = string.Format("Input required: {0}", prompt);
                        }
                    }
                    else if (status == "COMPLETED") {
                        if (hasBeenActive && !hasFinished && workingSessions.Count == 0) {
                            debounceCompletedTicks++;
                            if (debounceCompletedTicks >= 2) {
                                OnTurnCompleted();
                            }
                        }
                    }
                    else {
                        if (hasBeenActive && !hasFinished && workingSessions.Count == 0) {
                            idleTicks++;
                            if (idleTicks >= 8) {
                                OnTurnCompleted();
                            }
                        }
                    }
                } else if (hasBeenActive && !hasFinished && workingSessions.Count == 0) {
                    idleTicks++;
                    if (idleTicks >= 8) {
                        OnTurnCompleted();
                    }
                }
            } catch {}
        }

        private void OnTurnCompleted() {
            if (hasFinished) return;
            hasFinished = true;
            if (webReadyTimer != null) { try { webReadyTimer.Stop(); } catch {} }
            DismissalTracker.ClearDismissal(targetSessionId);
            // Don't auto-close: the user controls when to close the widget.
            // Just update status to show agent is done.
            try {
                statusPillText.Text = activeAgentName + " \u2022 Done";
                statusDot.Fill = new SolidColorBrush(Color.FromRgb(100, 200, 120));
            } catch {}
        }

        private void CancelPendingClose() {
            if (hasFinished) {
                hasFinished = false;
                if (exitTimer != null) { try { exitTimer.Stop(); } catch {} }
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
        private Ellipse pillDot;
        private Border secButton;
        private Ellipse secDot;
        private Border appPicker;
        private DispatcherTimer collapseTimer;
        private DispatcherTimer statusTimer;

        // Design.md palette
        static readonly Color Forest      = Color.FromRgb(3, 79, 70);       // #034F46
        static readonly Color ForestSoft  = Color.FromRgb(99, 144, 133);    // #639085
        static readonly Color Lavender    = Color.FromRgb(240, 215, 255);   // #F0D7FF
        static readonly Color Orange      = Color.FromRgb(255, 169, 70);    // #FFA946
        static readonly Color Ink         = Color.FromRgb(26, 26, 26);      // #1A1A1A
        static readonly Color InkSoft     = Color.FromRgb(102, 102, 102);   // #666666
        static readonly Color CanvasClr      = Color.FromRgb(255, 255, 235);   // #FFFFEB
        static readonly Color CardWhite   = Color.FromRgb(255, 255, 255);   // #FFFFFF
        // Widget-specific dark tokens
        static readonly Color Bg          = Color.FromArgb(235, 20, 24, 28);
        static readonly Color BgHover     = Color.FromArgb(245, 30, 34, 40);
        static readonly Color Brd         = Color.FromArgb(45, 160, 170, 160);
        static readonly Color Txt         = Color.FromRgb(240, 240, 235);
        static readonly Color GreenDot    = Color.FromRgb(74, 222, 128);
        static readonly Color AmberDot    = Color.FromRgb(251, 191, 36);
        static readonly Color Slate       = Color.FromRgb(100, 110, 120);

        public FloatingFlowWidget() {
            Title = "WaitPlay";
            WindowStyle = WindowStyle.None;
            AllowsTransparency = true;
            Background = Brushes.Transparent;
            Topmost = true;
            ShowInTaskbar = false;
            ResizeMode = ResizeMode.NoResize;
            Width = 260; Height = 180;

            SourceInitialized += (s, e) => {
                try {
                    myHwnd = new WindowInteropHelper(this).Handle;
                    RegisterHotKey(myHwnd, HOTKEY_ID, 0x0001, 0x57);
                    var src = HwndSource.FromHwnd(myHwnd);
                    if (src != null) src.AddHook(HwndHook);
                } catch {}
            };
            Closed += (s, e) => { try { if (myHwnd != IntPtr.Zero) UnregisterHotKey(myHwnd, HOTKEY_ID); } catch {} };

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
            rootCanvas = new Canvas { Width = 260, Height = 180 };

            // ── Edge handle (idle) ────────────────────────────────
            edgeHandle = new Border {
                Width = 10, Height = 40,
                CornerRadius = new CornerRadius(5),
                Background = new SolidColorBrush(Color.FromArgb(110, 99, 144, 133)),
                BorderBrush = new SolidColorBrush(Color.FromArgb(50, 3, 79, 70)),
                BorderThickness = new Thickness(1),
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

            // Text pill (overlaps behind capsule via negative margin)
            textPill = new Border {
                Background = new SolidColorBrush(Bg),
                BorderBrush = new SolidColorBrush(Brd),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(16),
                Padding = new Thickness(10, 5, 10, 5),
                VerticalAlignment = VerticalAlignment.Center,
                Opacity = 0
            };
            var pillRow = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
            pillDot = new Ellipse { Width = 7, Height = 7, Fill = new SolidColorBrush(GreenDot), Margin = new Thickness(0,0,7,0), VerticalAlignment = VerticalAlignment.Center };
            pillLabel = new TextBlock {
                Text = "WaitPlay",
                FontFamily = new FontFamily("Segoe UI"),
                FontSize = 12, FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(Txt),
                VerticalAlignment = VerticalAlignment.Center
            };
            pillRow.Children.Add(pillDot);
            pillRow.Children.Add(pillLabel);
            textPill.Child = pillRow;

            // Main capsule (34×50 — slightly bigger)
            mainCapsule = new Border {
                Width = 34, Height = 50,
                CornerRadius = new CornerRadius(17),
                Background = new SolidColorBrush(Bg),
                BorderBrush = new SolidColorBrush(Brd),
                BorderThickness = new Thickness(1),
                Cursor = Cursors.Hand,
                VerticalAlignment = VerticalAlignment.Center
            };
            Panel.SetZIndex(mainCapsule, 5);
            mainIcon = new System.Windows.Shapes.Path {
                Data = Geometry.Parse("M12,3 L12,11 M6.3,6.3 A7,7 0 1,0 17.7,6.3"),
                Stroke = new SolidColorBrush(Forest),
                StrokeThickness = 2.0,
                Fill = Brushes.Transparent,
                Width = 15, Height = 15,
                Stretch = Stretch.Uniform,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
            mainCapsule.Child = mainIcon;
            mainCapsule.MouseEnter += (s, e) => { mainCapsule.Background = new SolidColorBrush(BgHover); CancelCollapse(); ShowPill(); };
            mainCapsule.MouseLeave += (s, e) => { mainCapsule.Background = new SolidColorBrush(Bg); ScheduleCollapse(); };
            mainCapsule.MouseLeftButtonUp += (s, e) => { ToggleEnabled(); e.Handled = true; };

            // Layout depends on dock side — will be set in ApplyDock
            Grid.SetColumn(textPill, 0);
            Grid.SetColumn(mainCapsule, 1);
            row1.Children.Add(textPill);
            row1.Children.Add(mainCapsule);

            // Row 2: secondary button (28×28 — slightly bigger)
            var row2wrap = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 4, 3, 0) };
            secButton = new Border {
                Width = 28, Height = 28,
                CornerRadius = new CornerRadius(14),
                Background = new SolidColorBrush(Color.FromArgb(180, 40, 44, 50)),
                BorderBrush = new SolidColorBrush(Brd),
                BorderThickness = new Thickness(1),
                Cursor = Cursors.Hand
            };
            var secGrid = new Grid();
            var ring = new Ellipse { Width = 12, Height = 12, Stroke = new SolidColorBrush(Txt), StrokeThickness = 1.3, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
            var cdot = new Ellipse { Width = 4, Height = 4, Fill = new SolidColorBrush(Txt), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
            var secDotBg = new Ellipse { Width = 9, Height = 9, Fill = new SolidColorBrush(Color.FromRgb(20,24,28)), HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Bottom, Margin = new Thickness(0,0,-1,-1) };
            secDot = new Ellipse { Width = 7, Height = 7, Fill = new SolidColorBrush(GreenDot), HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Bottom, Margin = new Thickness(0,0,0,0) };
            secGrid.Children.Add(ring); secGrid.Children.Add(cdot); secGrid.Children.Add(secDotBg); secGrid.Children.Add(secDot);
            secButton.Child = secGrid;
            secButton.MouseEnter += (s, e) => { secButton.Background = new SolidColorBrush(BgHover); CancelCollapse(); };
            secButton.MouseLeave += (s, e) => { secButton.Background = new SolidColorBrush(Color.FromArgb(180,40,44,50)); ScheduleCollapse(); };
            secButton.MouseLeftButtonUp += (s, e) => { ToggleAppPicker(); e.Handled = true; };
            row2wrap.Children.Add(secButton);

            vstack.Children.Add(row1);
            vstack.Children.Add(row2wrap);
            hoverGroup.Children.Add(vstack);

            // ── App picker ────────────────────────────────────────
            appPicker = new Border {
                Background = new SolidColorBrush(Color.FromArgb(240, 18, 22, 26)),
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
            b.MouseEnter += (s,e) => { b.Background = new SolidColorBrush(Color.FromArgb(30,255,255,255)); };
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
            textPill.Opacity = 0;
        }
        private void Expand() {
            CancelCollapse();
            edgeHandle.Visibility = Visibility.Collapsed;
            hoverGroup.Visibility = Visibility.Visible;
        }
        private void ShowPill() {
            textPill.BeginAnimation(OpacityProperty, new DoubleAnimation { To = 1, Duration = TimeSpan.FromMilliseconds(120) });
        }
        private void ScheduleCollapse() { collapseTimer.Stop(); collapseTimer.Start(); }
        private void CancelCollapse() { collapseTimer.Stop(); }
        private void ToggleAppPicker() {
            if (isMenuOpen) CloseAppPicker();
            else { isMenuOpen = true; appPicker.Visibility = Visibility.Visible; }
        }
        private void CloseAppPicker() { isMenuOpen = false; appPicker.Visibility = Visibility.Collapsed; }

        // ════════════════════════════════════════════════════════════
        //  3 fixed positions — pill direction flips per dock side
        // ════════════════════════════════════════════════════════════
        private void ApplyDock() {
            double sw = SystemParameters.WorkArea.Width;
            double sh = SystemParameters.WorkArea.Height;

            // Get the row1 grid that contains pill + capsule
            var vstack = hoverGroup.Children[0] as StackPanel;
            var row1 = vstack.Children[0] as Grid;
            var row2wrap = vstack.Children[1] as StackPanel;

            switch (dock) {
                case DockSide.Right:
                    Left = sw - Width; Top = (sh - Height) / 2;
                    // Pill on LEFT, capsule on RIGHT
                    textPill.Margin = new Thickness(0, 0, -14, 0);
                    Grid.SetColumn(textPill, 0); Grid.SetColumn(mainCapsule, 1);
                    row1.HorizontalAlignment = HorizontalAlignment.Right;
                    row2wrap.HorizontalAlignment = HorizontalAlignment.Right;
                    Canvas.SetRight(edgeHandle, 0); Canvas.SetLeft(edgeHandle, double.NaN);
                    Canvas.SetTop(edgeHandle, 70);
                    Canvas.SetRight(hoverGroup, 4); Canvas.SetLeft(hoverGroup, double.NaN);
                    Canvas.SetTop(hoverGroup, 45);
                    Canvas.SetRight(appPicker, 4); Canvas.SetLeft(appPicker, double.NaN);
                    Canvas.SetTop(appPicker, 120);
                    break;

                case DockSide.Left:
                    Left = 0; Top = (sh - Height) / 2;
                    // Capsule on LEFT, pill on RIGHT
                    textPill.Margin = new Thickness(-14, 0, 0, 0);
                    Grid.SetColumn(mainCapsule, 0); Grid.SetColumn(textPill, 1);
                    row1.HorizontalAlignment = HorizontalAlignment.Left;
                    row2wrap.HorizontalAlignment = HorizontalAlignment.Left;
                    row2wrap.Margin = new Thickness(3, 4, 0, 0);
                    Canvas.SetLeft(edgeHandle, 0); Canvas.SetRight(edgeHandle, double.NaN);
                    Canvas.SetTop(edgeHandle, 70);
                    Canvas.SetLeft(hoverGroup, 4); Canvas.SetRight(hoverGroup, double.NaN);
                    Canvas.SetTop(hoverGroup, 45);
                    Canvas.SetLeft(appPicker, 4); Canvas.SetRight(appPicker, double.NaN);
                    Canvas.SetTop(appPicker, 120);
                    break;

                case DockSide.Bottom:
                    Left = (sw - Width) / 2; Top = sh - Height;
                    textPill.Margin = new Thickness(0, 0, -14, 0);
                    Grid.SetColumn(textPill, 0); Grid.SetColumn(mainCapsule, 1);
                    row1.HorizontalAlignment = HorizontalAlignment.Center;
                    row2wrap.HorizontalAlignment = HorizontalAlignment.Center;
                    Canvas.SetLeft(edgeHandle, (Width - 10) / 2); Canvas.SetRight(edgeHandle, double.NaN);
                    Canvas.SetTop(edgeHandle, Height - 12);
                    Canvas.SetLeft(hoverGroup, (Width - 80) / 2); Canvas.SetRight(hoverGroup, double.NaN);
                    Canvas.SetTop(hoverGroup, 80);
                    Canvas.SetLeft(appPicker, (Width - 120) / 2); Canvas.SetRight(appPicker, double.NaN);
                    Canvas.SetTop(appPicker, 10);
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
            if (isEnabled) {
                pillLabel.Text = "WaitPlay";
                mainIcon.Stroke = new SolidColorBrush(Forest);
                pillDot.Fill = new SolidColorBrush(GreenDot);
                secDot.Fill = new SolidColorBrush(GreenDot);
            } else {
                pillLabel.Text = "Paused";
                mainIcon.Stroke = new SolidColorBrush(Slate);
                pillDot.Fill = new SolidColorBrush(Slate);
                secDot.Fill = new SolidColorBrush(Slate);
            }
        }
        private void SetStatus(string text, Color c) {
            pillLabel.Text = text; pillDot.Fill = new SolidColorBrush(c); secDot.Fill = new SolidColorBrush(c);
        }

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
                    Dispatcher.BeginInvoke(new Action(() => { if (isEnabled) SetStatus("WaitPlay", GreenDot); }));
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
                if (working) SetStatus("Working\u2026", Forest);
                else if (waiting) SetStatus("Input", AmberDot);
                else SetStatus("WaitPlay", GreenDot);
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
                try {
                    string dir = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "waitplay");
                    if (!System.IO.Directory.Exists(dir)) System.IO.Directory.CreateDirectory(dir);
                    string ipcFile = System.IO.Path.Combine(dir, ".waitplay-active-session.txt");
                    IntPtr passHwnd = parentHwnd != IntPtr.Zero ? parentHwnd : initialForeground;
                    System.IO.File.WriteAllText(ipcFile, targetSession + "|" + terminal + "|" + DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + "|" + passHwnd.ToInt64() + "|" + parentPid);
                } catch {}
                BringExistingWindowToFront();
                return;
            }

            try {
                var app = new Application();
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
