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

            if (this.monitoredWindowHandle == IntPtr.Zero) {
                this.monitoredWindowHandle = ParentWindowTracker.FindWindowForAgent(this.activeAgentName);
            }

            InitializeWindow();
            BuildUI();
            StartGame();
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
            Title = "WaitPlay • AI Agent Companion";
            Width = 620;
            Height = 680;
            MinWidth = 540;
            MinHeight = 600;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            Background = new SolidColorBrush(Color.FromRgb(15, 15, 20)); // #0f0f14
            Foreground = new SolidColorBrush(Color.FromRgb(240, 240, 245));
            Topmost = true;
            WindowStyle = WindowStyle.None;
            ResizeMode = ResizeMode.CanResizeWithGrip;
            AllowsTransparency = true;
            BorderBrush = new SolidColorBrush(Color.FromRgb(45, 45, 60));
            BorderThickness = new Thickness(1.5);
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
            rootGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(46) }); // Header
            rootGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(56) }); // Stats bar
            rootGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) }); // Cards
            rootGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(36) }); // Footer

            // Drag window on header click
            var header = new Border {
                Background = new SolidColorBrush(Color.FromRgb(22, 22, 30)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(38, 38, 50)),
                BorderThickness = new Thickness(0, 0, 0, 1),
                Padding = new Thickness(14, 0, 14, 0)
            };
            header.MouseLeftButtonDown += (s, e) => {
                if (e.ButtonState == MouseButtonState.Pressed) DragMove();
            };

            var headerPanel = new DockPanel();

            // Left branding
            var brandPanel = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
            var gameIcon = new TextBlock {
                Text = "\uD83C\uDFA7", // 🎮
                FontSize = 18,
                Margin = new Thickness(0, 0, 8, 0),
                VerticalAlignment = VerticalAlignment.Center
            };
            var appTitle = new TextBlock {
                Text = "WaitPlay",
                FontWeight = FontWeights.Bold,
                FontSize = 14,
                Foreground = new SolidColorBrush(Color.FromRgb(255, 255, 255)),
                VerticalAlignment = VerticalAlignment.Center
            };
            var appSub = new TextBlock {
                Text = " • Companion Game",
                FontSize = 12,
                Foreground = new SolidColorBrush(Color.FromRgb(140, 140, 160)),
                VerticalAlignment = VerticalAlignment.Center
            };
            brandPanel.Children.Add(gameIcon);
            brandPanel.Children.Add(appTitle);
            brandPanel.Children.Add(appSub);
            DockPanel.SetDock(brandPanel, Dock.Left);
            headerPanel.Children.Add(brandPanel);

            // Right window controls
            var controlsPanel = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
            // Wispr Flow style ON/OFF toggle pill in window header
            var flowPill = new Border {
                Background = new SolidColorBrush(Color.FromRgb(17, 17, 22)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(42, 42, 54)),
                BorderThickness = new Thickness(1.2),
                CornerRadius = new CornerRadius(12),
                Padding = new Thickness(8, 2, 8, 2),
                Margin = new Thickness(0, 0, 10, 0),
                Cursor = Cursors.Hand,
                ToolTip = "WaitPlay Status • Click to turn OFF & close interface"
            };
            var flowPanel = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
            var flowTitle = new TextBlock {
                Text = "WaitPlay",
                FontSize = 11,
                Foreground = new SolidColorBrush(Color.FromRgb(203, 213, 225)),
                Margin = new Thickness(0, 0, 6, 0),
                VerticalAlignment = VerticalAlignment.Center
            };
            var flowBadge = new TextBlock {
                Text = "ON",
                FontSize = 11,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(Color.FromRgb(0, 240, 255)),
                Margin = new Thickness(0, 0, 6, 0),
                VerticalAlignment = VerticalAlignment.Center
            };
            var flowDot = new Ellipse {
                Width = 6,
                Height = 6,
                Fill = new SolidColorBrush(Color.FromRgb(0, 240, 255)),
                VerticalAlignment = VerticalAlignment.Center
            };
            flowPanel.Children.Add(flowTitle);
            flowPanel.Children.Add(flowBadge);
            flowPanel.Children.Add(flowDot);
            flowPill.Child = flowPanel;

            flowPill.MouseLeftButtonDown += (s, e) => {
                WaitPlayStateManager.SetEnabled(false);
                flowBadge.Text = "OFF";
                flowBadge.Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184));
                flowDot.Fill = new SolidColorBrush(Color.FromRgb(100, 116, 139));
                flowPill.ToolTip = "WaitPlay is now OFF. Closing...";
                var t = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(350) };
                t.Tick += (s2, e2) => { t.Stop(); Close(); };
                t.Start();
            };
            controlsPanel.Children.Add(flowPill);


            var btnMin = new Button {
                Content = "\u2014",
                Width = 28,
                Height = 26,
                Background = Brushes.Transparent,
                Foreground = new SolidColorBrush(Color.FromRgb(180, 180, 200)),
                BorderThickness = new Thickness(0),
                FontSize = 11,
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
                Foreground = new SolidColorBrush(Color.FromRgb(220, 100, 100)),
                BorderThickness = new Thickness(0),
                FontSize = 12,
                FontWeight = FontWeights.Bold,
                Cursor = Cursors.Hand
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
                Background = new SolidColorBrush(Color.FromRgb(18, 18, 24)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(32, 32, 42)),
                BorderThickness = new Thickness(0, 0, 0, 1),
                Padding = new Thickness(16, 8, 16, 8)
            };
            var statsPanel = new DockPanel();

            // Container for Status Pill + Terminal Tab Badge
            var statusContainer = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };

            // Status Pill
            statusPill = new Border {
                CornerRadius = new CornerRadius(12),
                Background = new SolidColorBrush(Color.FromArgb(40, 59, 130, 246)),
                BorderBrush = new SolidColorBrush(Color.FromArgb(90, 59, 130, 246)),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(10, 4, 12, 4),
                VerticalAlignment = VerticalAlignment.Center
            };
            var pillContent = new StackPanel { Orientation = Orientation.Horizontal };
            statusDot = new Ellipse {
                Width = 8,
                Height = 8,
                Fill = new SolidColorBrush(Color.FromRgb(59, 130, 246)),
                Margin = new Thickness(0, 0, 6, 0),
                VerticalAlignment = VerticalAlignment.Center
            };
            string initialPill = (activeAgentName == "ChatGPT")
                ? "ChatGPT is Reasoning..."
                : (activeAgentName == "OMP")
                    ? "OMP • Gemini 3.8 Flash"
                    : (activeAgentName == "OpenCode")
                        ? "OpenCode • GLM 5.3 Flash"
                        : (activeAgentName == "Cline")
                            ? "Cline • Claude 3.7 Sonnet"
                            : string.Format("{0} is Working...", activeAgentName);
            statusPillText = new TextBlock {
                Text = initialPill,
                FontSize = 11,
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(Color.FromRgb(147, 197, 253)),
                VerticalAlignment = VerticalAlignment.Center
            };
            pillContent.Children.Add(statusDot);
            pillContent.Children.Add(statusPillText);
            statusPill.Child = pillContent;
            statusContainer.Children.Add(statusPill);

            // Terminal Tab Badge directly to the right of Status Pill
            terminalPill = new Border {
                CornerRadius = new CornerRadius(10),
                Background = new SolidColorBrush(Color.FromArgb(35, 255, 255, 255)),
                BorderBrush = new SolidColorBrush(Color.FromArgb(60, 255, 255, 255)),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(8, 3, 8, 3),
                Margin = new Thickness(8, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Center,
                Visibility = !string.IsNullOrEmpty(terminalLabel) ? Visibility.Visible : Visibility.Collapsed
            };
            terminalText = new TextBlock {
                Text = !string.IsNullOrEmpty(terminalLabel) ? terminalLabel : "Term - 1",
                FontSize = 11,
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(Color.FromRgb(210, 210, 230)),
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
                FontSize = 12,
                Foreground = new SolidColorBrush(Color.FromRgb(200, 200, 215)),
                Margin = new Thickness(0, 0, 16, 0),
                VerticalAlignment = VerticalAlignment.Center
            };
            scoreText = new TextBlock {
                Text = "\u2B50 0 pts",
                FontSize = 12,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(Color.FromRgb(250, 204, 21)),
                Margin = new Thickness(0, 0, 16, 0),
                VerticalAlignment = VerticalAlignment.Center
            };
            matchesText = new TextBlock {
                Text = "\uD83C\uDCCF 0/8",
                FontSize = 12,
                Foreground = new SolidColorBrush(Color.FromRgb(52, 211, 153)),
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

            // Row 2: 4x4 Cards Grid
            var cardsContainer = new Grid { Margin = new Thickness(16, 16, 16, 16) };
            cardGrid = new UniformGrid {
                Rows = 4,
                Columns = 4,
                HorizontalAlignment = HorizontalAlignment.Stretch,
                VerticalAlignment = VerticalAlignment.Stretch
            };
            cardsContainer.Children.Add(cardGrid);

            // Overlay banner for win / completed notification
            bannerBorder = new Border {
                Background = new SolidColorBrush(Color.FromArgb(235, 12, 12, 18)),
                CornerRadius = new CornerRadius(16),
                BorderBrush = new SolidColorBrush(Color.FromRgb(16, 185, 129)),
                BorderThickness = new Thickness(2),
                Padding = new Thickness(24),
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Visibility = Visibility.Collapsed
            };
            var bannerContent = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
            bannerTitle = new TextBlock {
                Text = "\uD83C\uDF89 Agent Work is Done!",
                FontSize = 20,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(Color.FromRgb(52, 211, 153)),
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 0, 0, 8)
            };
            bannerSubtitle = new TextBlock {
                Text = "Want to keep playing or quit?",
                FontSize = 14,
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(Color.FromRgb(240, 240, 245)),
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 0, 0, 6)
            };
            countdownText = new TextBlock {
                Text = "Score: 0 pts \u2022 Press Enter to Quit or click Keep Playing",
                FontSize = 11,
                Foreground = new SolidColorBrush(Color.FromRgb(150, 150, 175)),
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 0, 0, 14)
            };
            var bannerBtnRow = new StackPanel {
                Orientation = Orientation.Horizontal,
                HorizontalAlignment = HorizontalAlignment.Center
            };
            btnExit = new Button {
                Content = "Quit to Terminal",
                FontSize = 13,
                FontWeight = FontWeights.Bold,
                Foreground = Brushes.White,
                Background = new SolidColorBrush(Color.FromRgb(16, 185, 129)),
                BorderThickness = new Thickness(0),
                Padding = new Thickness(18, 9, 18, 9),
                Cursor = Cursors.Hand
            };
            btnExit.Click += (s, e) => Close();
            var btnKeepPlaying = new Button {
                Content = "Keep Playing \uD83C\uDFAE",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(Color.FromRgb(147, 197, 253)),
                Background = new SolidColorBrush(Color.FromRgb(35, 35, 52)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(55, 55, 75)),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(16, 9, 16, 9),
                Margin = new Thickness(12, 0, 0, 0),
                Cursor = Cursors.Hand
            };
            btnKeepPlaying.Click += (s, e) => {
                bannerBorder.Visibility = Visibility.Collapsed;
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

            // Row 3: Footer hints
            var footer = new Border {
                Background = new SolidColorBrush(Color.FromRgb(18, 18, 24)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(32, 32, 42)),
                BorderThickness = new Thickness(0, 1, 0, 0),
                Padding = new Thickness(16, 0, 16, 0)
            };
            var footerPanel = new DockPanel();
            hintText = new TextBlock {
                Text = "Match all pairs before your coding agent finishes \u2022 Automatically closes on turn end",
                FontSize = 10,
                Foreground = new SolidColorBrush(Color.FromRgb(100, 100, 120)),
                VerticalAlignment = VerticalAlignment.Center
            };
            DockPanel.SetDock(hintText, Dock.Left);
            footerPanel.Children.Add(hintText);

            var restartBtn = new Button {
                Content = "\u21BB Restart",
                FontSize = 10,
                Foreground = new SolidColorBrush(Color.FromRgb(140, 140, 160)),
                Background = Brushes.Transparent,
                BorderThickness = new Thickness(0),
                Cursor = Cursors.Hand,
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Right
            };
            restartBtn.Click += (s, e) => StartGame();
            DockPanel.SetDock(restartBtn, Dock.Right);
            footerPanel.Children.Add(restartBtn);

            footer.Child = footerPanel;
            Grid.SetRow(footer, 3);
            rootGrid.Children.Add(footer);

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
                    Background = new SolidColorBrush(Color.FromRgb(30, 30, 40)),
                    BorderBrush = new SolidColorBrush(Color.FromRgb(50, 50, 68)),
                    BorderThickness = new Thickness(1.5),
                    Cursor = Cursors.Hand,
                    Tag = card
                };

                var txt = new TextBlock {
                    Text = "\u2753", // ❓ hidden state
                    FontSize = 26,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                    Foreground = new SolidColorBrush(Color.FromRgb(120, 120, 150))
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
                    firstCard.Element.Background = new SolidColorBrush(Color.FromRgb(16, 80, 50));
                    secondCard.Element.Background = new SolidColorBrush(Color.FromRgb(16, 80, 50));
                    firstCard.Element.BorderBrush = new SolidColorBrush(Color.FromRgb(52, 211, 153));
                    secondCard.Element.BorderBrush = new SolidColorBrush(Color.FromRgb(52, 211, 153));

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
                card.TextElement.FontSize = 32;
                card.Element.Background = new SolidColorBrush(Color.FromRgb(30, 48, 80));
                card.Element.BorderBrush = new SolidColorBrush(Color.FromRgb(96, 165, 250));
            } else {
                card.TextElement.Text = "\u2753";
                card.TextElement.FontSize = 26;
                card.Element.Background = new SolidColorBrush(Color.FromRgb(30, 30, 40));
                card.Element.BorderBrush = new SolidColorBrush(Color.FromRgb(50, 50, 68));
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
            bannerBorder.BorderBrush = new SolidColorBrush(Color.FromRgb(52, 211, 153));
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
            if (myHwnd == IntPtr.Zero) {
                try { myHwnd = new WindowInteropHelper(this).Handle; } catch {}
            }

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
            if (monitoredWindowHandle == IntPtr.Zero) {
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
                        Close();
                        return;
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

                        statusPill.Background = new SolidColorBrush(Color.FromArgb(40, 59, 130, 246));
                        statusPill.BorderBrush = new SolidColorBrush(Color.FromArgb(90, 59, 130, 246));
                        statusDot.Fill = new SolidColorBrush(Color.FromRgb(59, 130, 246));
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
                        statusPill.Background = new SolidColorBrush(Color.FromArgb(40, 245, 158, 11));
                        statusPill.BorderBrush = new SolidColorBrush(Color.FromArgb(90, 245, 158, 11));
                        statusDot.Fill = new SolidColorBrush(Color.FromRgb(245, 158, 11));

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
            DismissalTracker.ClearDismissal(targetSessionId);

            // Never auto-quit on a timer! Stop any background timers
            if (exitTimer != null) {
                exitTimer.Stop();
                exitTimer = null;
            }

            statusPillText.Text = string.Format("\u2713 {0} Work Done", activeAgentName);
            statusPill.Background = new SolidColorBrush(Color.FromArgb(40, 16, 185, 129));
            statusPill.BorderBrush = new SolidColorBrush(Color.FromArgb(90, 16, 185, 129));
            statusDot.Fill = new SolidColorBrush(Color.FromRgb(52, 211, 153));

            bannerTitle.Text = string.Format("\uD83C\uDF89 {0} Work is Done!", activeAgentName);
            bannerSubtitle.Text = "Want to keep playing or quit?";
            countdownText.Text = string.Format("Score: {0} pts \u2022 {1}/8 matches \u2022 Press Enter to Quit or click Keep Playing", score, matchesFound);

            string exitLabel = (activeAgentName == "OMP" || activeAgentName == "Claude Code")
                ? "Quit to Terminal"
                : string.Format("Quit to {0}", activeAgentName);
            if (btnExit != null) btnExit.Content = exitLabel;

            bannerBorder.BorderBrush = new SolidColorBrush(Color.FromRgb(52, 211, 153));
            bannerBorder.Visibility = Visibility.Visible;
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
                string[] paths = new string[] { GetTempPath(), GetRepoPath() };
                foreach (var p in paths) {
                    if (System.IO.File.Exists(p)) {
                        string json = System.IO.File.ReadAllText(p);
                        var ser = new JavaScriptSerializer();
                        var dict = ser.Deserialize<Dictionary<string, object>>(json);
                        if (dict != null && dict.ContainsKey("enabled")) {
                            return Convert.ToBoolean(dict["enabled"]);
                        }
                    }
                }
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
            } catch {}
        }
    }

    public enum DockPosition {
        Left,
        Right,
        Bottom,
        Free
    }

    public enum WidgetLayout {
        Vertical,
        WisprFlow,
        Horizontal
    }

    public class DockOverlayWindow : Window {
        private Border leftTarget;
        private Border rightTarget;
        private Border bottomTarget;

        public DockOverlayWindow() {
            WindowStyle = WindowStyle.None;
            AllowsTransparency = true;
            Background = Brushes.Transparent;
            Topmost = true;
            ShowInTaskbar = false;
            IsHitTestVisible = false;

            Left = SystemParameters.WorkArea.Left;
            Top = SystemParameters.WorkArea.Top;
            Width = SystemParameters.WorkArea.Width;
            Height = SystemParameters.WorkArea.Height;

            var canvas = new Canvas();
            double screenW = Width;
            double screenH = Height;

            leftTarget = CreateTarget(0, (screenH - 110) / 2, 28, 110, new CornerRadius(0, 14, 14, 0));
            rightTarget = CreateTarget(screenW - 28, (screenH - 110) / 2, 28, 110, new CornerRadius(14, 0, 0, 14));
            bottomTarget = CreateTarget((screenW - 130) / 2, screenH - 28, 130, 28, new CornerRadius(14, 14, 0, 0));

            canvas.Children.Add(leftTarget);
            canvas.Children.Add(rightTarget);
            canvas.Children.Add(bottomTarget);

            Content = canvas;
        }

        private Border CreateTarget(double x, double y, double w, double h, CornerRadius r) {
            var b = new Border {
                Width = w,
                Height = h,
                CornerRadius = r,
                Background = new SolidColorBrush(Color.FromArgb(40, 255, 255, 255)),
                BorderBrush = new SolidColorBrush(Color.FromArgb(90, 255, 255, 255)),
                BorderThickness = new Thickness(1.5)
            };
            Canvas.SetLeft(b, x);
            Canvas.SetTop(b, y);
            return b;
        }

        public void Highlight(DockPosition dock) {
            ResetTarget(leftTarget);
            ResetTarget(rightTarget);
            ResetTarget(bottomTarget);

            if (dock == DockPosition.Left) {
                ActiveTarget(leftTarget);
            } else if (dock == DockPosition.Right) {
                ActiveTarget(rightTarget);
            } else if (dock == DockPosition.Bottom) {
                ActiveTarget(bottomTarget);
            }
        }

        private void ResetTarget(Border b) {
            b.Background = new SolidColorBrush(Color.FromArgb(40, 255, 255, 255));
            b.BorderBrush = new SolidColorBrush(Color.FromArgb(90, 255, 255, 255));
        }

        private void ActiveTarget(Border b) {
            b.Background = new SolidColorBrush(Color.FromArgb(140, 0, 240, 255));
            b.BorderBrush = new SolidColorBrush(Color.FromRgb(0, 240, 255));
        }
    }

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
        private const uint MOD_ALT = 0x0001;
        private const uint VK_W = 0x57;

        private DockPosition currentDock = DockPosition.Left;
        private WidgetLayout currentLayout = WidgetLayout.Vertical;
        private bool isCollapsed = true;
        private bool isEnabled = true;

        private Border edgeHandle;
        private Border fullWidget;
        private Border pillBorder;
        private TextBlock pillStatusBadge;
        private Border actionButton;
        private Border toggleButton;
        private System.Windows.Shapes.Path powerIconPath;
        private Ellipse statusDot;
        private Ellipse handleStatusDot;
        private DispatcherTimer collapseTimer;
        private DockOverlayWindow dockOverlay = null;
        private bool isDragging = false;
        private Point dragStartPoint;
        private Point windowStartPoint;
        private MainWindow activeGameWindow = null;
        private IntPtr myHwnd = IntPtr.Zero;

        public FloatingFlowWidget() {
            InitializeComponent();
        }

        private void InitializeComponent() {
            Title = "WaitPlay Flow";
            WindowStyle = WindowStyle.None;
            AllowsTransparency = true;
            Background = Brushes.Transparent;
            Topmost = true;
            ShowInTaskbar = false;
            ResizeMode = ResizeMode.NoResize;

            collapseTimer = new DispatcherTimer();
            collapseTimer.Interval = TimeSpan.FromMilliseconds(800);
            collapseTimer.Tick += (s, e) => {
                if (isDragging || currentDock == DockPosition.Free) return;
                POINT pt;
                GetCursorPos(out pt);
                bool cursorInside = (pt.X >= Left - 12 && pt.X <= Left + Width + 12 && pt.Y >= Top - 12 && pt.Y <= Top + Height + 12);
                if (!cursorInside) {
                    collapseTimer.Stop();
                    SetCollapsed(true);
                }
            };

            SourceInitialized += (s, e) => {
                try {
                    myHwnd = new WindowInteropHelper(this).Handle;
                    RegisterHotKey(myHwnd, HOTKEY_ID, MOD_ALT, VK_W);
                    var source = HwndSource.FromHwnd(myHwnd);
                    if (source != null) {
                        source.AddHook(HwndHook);
                    }
                } catch {}
            };

            Closed += (s, e) => {
                try {
                    if (dockOverlay != null) { dockOverlay.Close(); dockOverlay = null; }
                    if (myHwnd != IntPtr.Zero) {
                        UnregisterHotKey(myHwnd, HOTKEY_ID);
                    }
                } catch {}
            };

            var rootGrid = new Grid();

            // 1. Collapsed Edge Handle
            edgeHandle = new Border {
                Width = 22,
                Height = 68,
                Background = new SolidColorBrush(Color.FromRgb(17, 17, 24)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(46, 46, 62)),
                BorderThickness = new Thickness(1.2),
                Cursor = Cursors.Hand,
                ToolTip = "WaitPlay (Hover to expand • Click to toggle)",
                Visibility = Visibility.Visible
            };

            var handleStack = new StackPanel {
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Center
            };
            handleStatusDot = new Ellipse {
                Width = 7,
                Height = 7,
                Fill = new SolidColorBrush(Color.FromRgb(0, 240, 255)),
                Margin = new Thickness(0, 0, 0, 5)
            };
            var grip = new TextBlock {
                Text = "\u22EE", // ⋮
                FontSize = 13,
                Foreground = new SolidColorBrush(Color.FromRgb(148, 148, 175)),
                HorizontalAlignment = HorizontalAlignment.Center
            };
            handleStack.Children.Add(handleStatusDot);
            handleStack.Children.Add(grip);
            edgeHandle.Child = handleStack;

            edgeHandle.MouseEnter += (s, e) => {
                collapseTimer.Stop();
                SetCollapsed(false);
            };
            edgeHandle.PreviewMouseLeftButtonDown += (s, e) => {
                StartDragging(e);
            };

            // 2. Full Expanded Widget
            fullWidget = new Border {
                Background = Brushes.Transparent,
                Visibility = Visibility.Collapsed
            };

            // Item A: Pill (Status & Alt+W)
            pillBorder = new Border {
                Background = new SolidColorBrush(Color.FromRgb(17, 17, 22)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(42, 42, 54)),
                BorderThickness = new Thickness(1.2),
                CornerRadius = new CornerRadius(20),
                Height = 40,
                Padding = new Thickness(16, 0, 14, 0),
                Cursor = Cursors.Hand,
                ToolTip = "WaitPlay Status • Click to toggle ON/OFF"
            };

            var pillContent = new StackPanel {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center
            };

            var pillTitle = new TextBlock {
                Text = "WaitPlay",
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(Color.FromRgb(248, 250, 252)),
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0)
            };

            pillStatusBadge = new TextBlock {
                Text = "ON",
                FontSize = 13,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(Color.FromRgb(0, 240, 255)),
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0)
            };

            var pillHotkeyHint = new TextBlock {
                Text = "Alt+W",
                FontSize = 10,
                Foreground = new SolidColorBrush(Color.FromRgb(100, 116, 139)),
                VerticalAlignment = VerticalAlignment.Center
            };

            pillContent.Children.Add(pillTitle);
            pillContent.Children.Add(pillStatusBadge);
            pillContent.Children.Add(pillHotkeyHint);
            pillBorder.Child = pillContent;

            pillBorder.MouseEnter += (s, e) => {
                pillBorder.Background = new SolidColorBrush(Color.FromRgb(27, 27, 36));
                pillBorder.BorderBrush = new SolidColorBrush(Color.FromRgb(65, 65, 85));
            };
            pillBorder.MouseLeave += (s, e) => {
                pillBorder.Background = new SolidColorBrush(Color.FromRgb(17, 17, 22));
                pillBorder.BorderBrush = new SolidColorBrush(Color.FromRgb(42, 42, 54));
            };
            pillBorder.MouseLeftButtonDown += (s, e) => {
                Toggle();
                e.Handled = true;
            };

            // Item B: Gamepad Button
            actionButton = new Border {
                Width = 42,
                Height = 42,
                CornerRadius = new CornerRadius(21),
                Background = new SolidColorBrush(Color.FromRgb(24, 24, 34)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(50, 50, 68)),
                BorderThickness = new Thickness(1.2),
                Cursor = Cursors.Hand,
                ToolTip = "Open WaitPlay Companion Game"
            };

            var gamepadPath = new System.Windows.Shapes.Path {
                Data = Geometry.Parse("M4,7 C3,7 2,8 2,10 L2,12 C2,14.5 3.5,17 6,17 C7.5,17 8.5,16 9.5,14.5 L10.5,13 L13.5,13 L14.5,14.5 C15.5,16 16.5,17 18,17 C20.5,17 22,14.5 22,12 L22,10 C22,8 21,7 20,7 Z M6,10 L8,10 L8,11 L6,11 L6,13 L5,13 L5,11 L3,11 L3,10 L5,10 L5,8 L6,8 L6,10 Z M18,9.5 C18.5,9.5 19,10 19,10.5 C19,11 18.5,11.5 18,11.5 C17.5,11.5 17,11 17,10.5 C17,10 17.5,9.5 18,9.5 Z M16,11.5 C16.5,11.5 17,12 17,12.5 C17,13 16.5,13.5 16,13.5 C15.5,13.5 15,13 15,12.5 C15,12 15.5,11.5 16,11.5 Z"),
                Fill = new SolidColorBrush(Color.FromRgb(255, 255, 255)),
                Width = 20,
                Height = 16,
                Stretch = Stretch.Uniform,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
            actionButton.Child = gamepadPath;

            actionButton.MouseEnter += (s, e) => {
                actionButton.Background = new SolidColorBrush(Color.FromRgb(36, 36, 52));
                actionButton.BorderBrush = new SolidColorBrush(Color.FromRgb(80, 80, 110));
            };
            actionButton.MouseLeave += (s, e) => {
                actionButton.Background = new SolidColorBrush(Color.FromRgb(24, 24, 34));
                actionButton.BorderBrush = new SolidColorBrush(Color.FromRgb(50, 50, 68));
            };
            actionButton.MouseLeftButtonDown += (s, e) => {
                OpenGameWindow();
                e.Handled = true;
            };

            // Item C: Power Toggle Button
            toggleButton = new Border {
                Width = 42,
                Height = 42,
                CornerRadius = new CornerRadius(21),
                Background = new SolidColorBrush(Color.FromRgb(20, 20, 28)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(46, 46, 62)),
                BorderThickness = new Thickness(1.2),
                Cursor = Cursors.Hand,
                ToolTip = "Toggle WaitPlay ON / OFF"
            };

            var powerGrid = new Grid();
            powerIconPath = new System.Windows.Shapes.Path {
                Data = Geometry.Parse("M11,3 L13,3 L13,11 L11,11 Z M6.5,6.5 C4.5,8 4,11 5,13.5 C6.5,16.5 10,18 13,17.5 C16,16.5 18,14 18,11 C18,8.5 16.5,6.5 15,5.5 L16,4 C18,5.5 20,8 20,11 C20,15 17,18.5 13,19.5 C8.5,20.5 4,18 2.5,14 C1,10 2.5,6 5,4 Z"),
                Fill = new SolidColorBrush(Color.FromRgb(0, 240, 255)),
                Width = 16,
                Height = 16,
                Stretch = Stretch.Uniform,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
            powerGrid.Children.Add(powerIconPath);

            var outerDot = new Ellipse {
                Width = 10,
                Height = 10,
                Fill = new SolidColorBrush(Color.FromRgb(20, 20, 28)),
                HorizontalAlignment = HorizontalAlignment.Right,
                VerticalAlignment = VerticalAlignment.Top,
                Margin = new Thickness(0, 2, 2, 0)
            };
            statusDot = new Ellipse {
                Width = 6,
                Height = 6,
                Fill = new SolidColorBrush(Color.FromRgb(0, 240, 255)),
                HorizontalAlignment = HorizontalAlignment.Right,
                VerticalAlignment = VerticalAlignment.Top,
                Margin = new Thickness(0, 4, 4, 0)
            };
            powerGrid.Children.Add(outerDot);
            powerGrid.Children.Add(statusDot);
            toggleButton.Child = powerGrid;

            toggleButton.MouseEnter += (s, e) => {
                toggleButton.Background = new SolidColorBrush(Color.FromRgb(32, 32, 44));
                toggleButton.BorderBrush = new SolidColorBrush(Color.FromRgb(70, 70, 94));
            };
            toggleButton.MouseLeave += (s, e) => {
                toggleButton.Background = new SolidColorBrush(Color.FromRgb(20, 20, 28));
                toggleButton.BorderBrush = new SolidColorBrush(Color.FromRgb(46, 46, 62));
            };
            toggleButton.MouseLeftButtonDown += (s, e) => {
                Toggle();
                e.Handled = true;
            };

            rootGrid.Children.Add(edgeHandle);
            rootGrid.Children.Add(fullWidget);
            Content = rootGrid;

            MouseEnter += (s, e) => {
                collapseTimer.Stop();
            };
            MouseLeave += (s, e) => {
                if (currentDock != DockPosition.Free && !isDragging) {
                    collapseTimer.Start();
                }
            };

            fullWidget.PreviewMouseLeftButtonDown += (s, e) => {
                StartDragging(e);
            };

            PreviewMouseMove += (s, e) => {
                if (isDragging) {
                    UpdateDragging();
                }
            };

            PreviewMouseLeftButtonUp += (s, e) => {
                if (isDragging) {
                    StopDragging();
                }
            };

            isEnabled = WaitPlayStateManager.IsEnabled();
            UpdateUI();

            ApplyLayout(currentLayout);
            LoadPosition();
        }

        public void ApplyLayout(WidgetLayout layout) {
            currentLayout = layout;

            var p1 = pillBorder.Parent as Panel; if (p1 != null) p1.Children.Remove(pillBorder);
            var p2 = actionButton.Parent as Panel; if (p2 != null) p2.Children.Remove(actionButton);
            var p3 = toggleButton.Parent as Panel; if (p3 != null) p3.Children.Remove(toggleButton);

            if (currentLayout == WidgetLayout.Vertical) {
                // PURE VERTICAL COLUMN (matching user's request)
                var colPanel = new StackPanel {
                    Orientation = Orientation.Vertical,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center
                };

                pillBorder.Margin = new Thickness(0, 0, 0, 8);
                actionButton.Margin = new Thickness(0, 0, 0, 8);
                actionButton.HorizontalAlignment = HorizontalAlignment.Center;
                toggleButton.Margin = new Thickness(0, 0, 0, 0);
                toggleButton.HorizontalAlignment = HorizontalAlignment.Center;

                colPanel.Children.Add(pillBorder);
                colPanel.Children.Add(actionButton);
                colPanel.Children.Add(toggleButton);
                fullWidget.Child = colPanel;
            } else if (currentLayout == WidgetLayout.WisprFlow) {
                // WISPR FLOW SIDE-BY-SIDE (Pill on left, Buttons stacked on right)
                var grid = new Grid {
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center
                };
                grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
                grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

                pillBorder.VerticalAlignment = VerticalAlignment.Center;
                pillBorder.Margin = new Thickness(0, 0, 8, 0);
                Grid.SetColumn(pillBorder, 0);
                grid.Children.Add(pillBorder);

                var btnStack = new StackPanel {
                    Orientation = Orientation.Vertical,
                    VerticalAlignment = VerticalAlignment.Center
                };
                actionButton.Margin = new Thickness(0, 0, 0, 6);
                actionButton.HorizontalAlignment = HorizontalAlignment.Center;
                toggleButton.Margin = new Thickness(0, 0, 0, 0);
                toggleButton.HorizontalAlignment = HorizontalAlignment.Center;

                btnStack.Children.Add(actionButton);
                btnStack.Children.Add(toggleButton);
                Grid.SetColumn(btnStack, 1);
                grid.Children.Add(btnStack);

                fullWidget.Child = grid;
            } else {
                // HORIZONTAL ROW
                var rowPanel = new StackPanel {
                    Orientation = Orientation.Horizontal,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center
                };
                pillBorder.Margin = new Thickness(0, 0, 6, 0);
                actionButton.Margin = new Thickness(0, 0, 6, 0);
                toggleButton.Margin = new Thickness(0, 0, 0, 0);

                rowPanel.Children.Add(pillBorder);
                rowPanel.Children.Add(actionButton);
                rowPanel.Children.Add(toggleButton);
                fullWidget.Child = rowPanel;
            }

            UpdateContextMenu();
            if (!isCollapsed) {
                SetCollapsed(false);
            }
        }

        private void UpdateContextMenu() {
            var menu = new ContextMenu();
            var toggleItem = new MenuItem { Header = "Toggle WaitPlay (Alt+W)" };
            toggleItem.Click += (s, e) => Toggle();
            var gameItem = new MenuItem { Header = "Open Companion Game" };
            gameItem.Click += (s, e) => OpenGameWindow();

            var layoutMenu = new MenuItem { Header = "Widget Layout" };
            var vertItem = new MenuItem { Header = "Vertical Column" + (currentLayout == WidgetLayout.Vertical ? " ✓" : "") };
            vertItem.Click += (s, e) => { ApplyLayout(WidgetLayout.Vertical); SavePosition(); };
            var flowItem = new MenuItem { Header = "Wispr Flow (Side-by-Side)" + (currentLayout == WidgetLayout.WisprFlow ? " ✓" : "") };
            flowItem.Click += (s, e) => { ApplyLayout(WidgetLayout.WisprFlow); SavePosition(); };
            var horizItem = new MenuItem { Header = "Horizontal Row" + (currentLayout == WidgetLayout.Horizontal ? " ✓" : "") };
            horizItem.Click += (s, e) => { ApplyLayout(WidgetLayout.Horizontal); SavePosition(); };

            layoutMenu.Items.Add(vertItem);
            layoutMenu.Items.Add(flowItem);
            layoutMenu.Items.Add(horizItem);

            var dockMenu = new MenuItem { Header = "Docking Position" };
            var dockLeftItem = new MenuItem { Header = "Dock to Left Screen Edge" };
            dockLeftItem.Click += (s, e) => { SetDock(DockPosition.Left, Top); SavePosition(); };
            var dockRightItem = new MenuItem { Header = "Dock to Right Screen Edge" };
            dockRightItem.Click += (s, e) => { SetDock(DockPosition.Right, Top); SavePosition(); };
            var dockBottomItem = new MenuItem { Header = "Dock to Bottom Screen Edge" };
            dockBottomItem.Click += (s, e) => { SetDock(DockPosition.Bottom); SavePosition(); };
            var dockFreeItem = new MenuItem { Header = "Free Floating" };
            dockFreeItem.Click += (s, e) => {
                currentDock = DockPosition.Free;
                SetCollapsed(false);
                SavePosition();
            };

            dockMenu.Items.Add(dockLeftItem);
            dockMenu.Items.Add(dockRightItem);
            dockMenu.Items.Add(dockBottomItem);
            dockMenu.Items.Add(dockFreeItem);

            var exitItem = new MenuItem { Header = "Exit Desktop Widget" };
            exitItem.Click += (s, e) => Close();

            menu.Items.Add(toggleItem);
            menu.Items.Add(gameItem);
            menu.Items.Add(new Separator());
            menu.Items.Add(layoutMenu);
            menu.Items.Add(dockMenu);
            menu.Items.Add(new Separator());
            menu.Items.Add(exitItem);
            ContextMenu = menu;
        }

        private void StartDragging(MouseButtonEventArgs e) {
            POINT pt;
            GetCursorPos(out pt);
            dragStartPoint = new Point(pt.X, pt.Y);
            windowStartPoint = new Point(Left, Top);
            isDragging = true;
            CaptureMouse();

            if (dockOverlay == null) {
                dockOverlay = new DockOverlayWindow();
            }
            dockOverlay.Show();
        }

        private void UpdateDragging() {
            POINT pt;
            GetCursorPos(out pt);
            double deltaX = pt.X - dragStartPoint.X;
            double deltaY = pt.Y - dragStartPoint.Y;

            Left = windowStartPoint.X + deltaX;
            Top = windowStartPoint.Y + deltaY;

            double screenW = SystemParameters.WorkArea.Width;
            double screenH = SystemParameters.WorkArea.Height;

            if (pt.X < 90) {
                if (dockOverlay != null) dockOverlay.Highlight(DockPosition.Left);
            } else if (pt.X > screenW - 90) {
                if (dockOverlay != null) dockOverlay.Highlight(DockPosition.Right);
            } else if (pt.Y > screenH - 80) {
                if (dockOverlay != null) dockOverlay.Highlight(DockPosition.Bottom);
            } else {
                if (dockOverlay != null) dockOverlay.Highlight(DockPosition.Free);
            }
        }

        private void StopDragging() {
            isDragging = false;
            ReleaseMouseCapture();

            if (dockOverlay != null) {
                dockOverlay.Hide();
            }

            POINT pt;
            GetCursorPos(out pt);
            double screenW = SystemParameters.WorkArea.Width;
            double screenH = SystemParameters.WorkArea.Height;

            if (pt.X < 90) {
                SetDock(DockPosition.Left, Top);
            } else if (pt.X > screenW - 90) {
                SetDock(DockPosition.Right, Top);
            } else if (pt.Y > screenH - 80) {
                SetDock(DockPosition.Bottom);
            } else {
                currentDock = DockPosition.Free;
                SetCollapsed(false);
            }

            SavePosition();
        }

        public void SetDock(DockPosition dock, double topPos = -1) {
            currentDock = dock;
            double screenW = SystemParameters.WorkArea.Width;
            double screenH = SystemParameters.WorkArea.Height;

            if (topPos > 0 && topPos < screenH - 160) {
                Top = topPos;
            } else if (Top <= 0 || Top > screenH - 160) {
                Top = 460;
            }

            switch (dock) {
                case DockPosition.Left:
                    edgeHandle.CornerRadius = new CornerRadius(0, 12, 12, 0);
                    Left = 0;
                    break;
                case DockPosition.Right:
                    edgeHandle.CornerRadius = new CornerRadius(12, 0, 0, 12);
                    Left = screenW - 22;
                    break;
                case DockPosition.Bottom:
                    edgeHandle.CornerRadius = new CornerRadius(12, 12, 0, 0);
                    Left = (screenW - 200) / 2;
                    Top = screenH - 22;
                    break;
                case DockPosition.Free:
                    break;
            }

            SetCollapsed(currentDock != DockPosition.Free);
        }

        private void SetCollapsed(bool collapsed) {
            isCollapsed = collapsed;
            double screenW = SystemParameters.WorkArea.Width;
            double screenH = SystemParameters.WorkArea.Height;

            double expW = (currentLayout == WidgetLayout.Vertical) ? 195 : (currentLayout == WidgetLayout.WisprFlow ? 245 : 295);
            double expH = (currentLayout == WidgetLayout.Vertical) ? 148 : (currentLayout == WidgetLayout.WisprFlow ? 96 : 50);

            if (collapsed && currentDock != DockPosition.Free) {
                fullWidget.Visibility = Visibility.Collapsed;
                edgeHandle.Visibility = Visibility.Visible;
                Width = 22;
                Height = 68;
                if (currentDock == DockPosition.Right) {
                    Left = screenW - 22;
                } else if (currentDock == DockPosition.Left) {
                    Left = 0;
                } else if (currentDock == DockPosition.Bottom) {
                    Left = (screenW - 70) / 2;
                    Top = screenH - 22;
                    Width = 70;
                    Height = 22;
                }
            } else {
                edgeHandle.Visibility = Visibility.Collapsed;
                fullWidget.Visibility = Visibility.Visible;
                Width = expW;
                Height = expH;
                if (currentDock == DockPosition.Right) {
                    Left = screenW - expW - 5;
                } else if (currentDock == DockPosition.Left) {
                    Left = 6;
                } else if (currentDock == DockPosition.Bottom) {
                    Left = (screenW - expW) / 2;
                    Top = screenH - expH - 6;
                }

                if (currentDock != DockPosition.Free) {
                    collapseTimer.Start();
                }
            }
        }

        private void Toggle() {
            isEnabled = !isEnabled;
            WaitPlayStateManager.SetEnabled(isEnabled);
            UpdateUI();
            if (!isEnabled && activeGameWindow != null && activeGameWindow.IsVisible) {
                try { activeGameWindow.Close(); } catch {}
            }
        }

        private void UpdateUI() {
            if (isEnabled) {
                pillStatusBadge.Text = "ON";
                pillStatusBadge.Foreground = new SolidColorBrush(Color.FromRgb(0, 240, 255));
                statusDot.Fill = new SolidColorBrush(Color.FromRgb(0, 240, 255));
                handleStatusDot.Fill = new SolidColorBrush(Color.FromRgb(0, 240, 255));
                if (powerIconPath != null) powerIconPath.Fill = new SolidColorBrush(Color.FromRgb(0, 240, 255));
                pillBorder.ToolTip = "WaitPlay is ON (Active) • Click to turn OFF";
            } else {
                pillStatusBadge.Text = "OFF";
                pillStatusBadge.Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184));
                statusDot.Fill = new SolidColorBrush(Color.FromRgb(100, 116, 139));
                handleStatusDot.Fill = new SolidColorBrush(Color.FromRgb(100, 116, 139));
                if (powerIconPath != null) powerIconPath.Fill = new SolidColorBrush(Color.FromRgb(100, 116, 139));
                pillBorder.ToolTip = "WaitPlay is OFF (Muted) • Click to turn ON";
            }
        }

        private void OpenGameWindow() {
            if (activeGameWindow == null || !activeGameWindow.IsLoaded) {
                activeGameWindow = new MainWindow("", 0, "Desktop", 0, IntPtr.Zero);
                activeGameWindow.Closed += (s, e) => { activeGameWindow = null; };
                activeGameWindow.Show();
            } else {
                if (activeGameWindow.WindowState == WindowState.Minimized) {
                    activeGameWindow.WindowState = WindowState.Normal;
                }
                activeGameWindow.Activate();
            }
        }

        private IntPtr HwndHook(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled) {
            const int WM_HOTKEY = 0x0312;
            if (msg == WM_HOTKEY && wParam.ToInt32() == HOTKEY_ID) {
                Toggle();
                handled = true;
            }
            return IntPtr.Zero;
        }

        private string GetWidgetPosPath() {
            string dir = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "waitplay");
            if (!System.IO.Directory.Exists(dir)) {
                try { System.IO.Directory.CreateDirectory(dir); } catch {}
            }
            return System.IO.Path.Combine(dir, ".waitplay-widget-pos.json");
        }

        private void LoadPosition() {
            try {
                string path = GetWidgetPosPath();
                if (System.IO.File.Exists(path)) {
                    string json = System.IO.File.ReadAllText(path);
                    var ser = new JavaScriptSerializer();
                    var dict = ser.Deserialize<Dictionary<string, object>>(json);
                    if (dict != null) {
                        string dockStr = dict.ContainsKey("dock") ? dict["dock"].ToString() : "Left";
                        string layoutStr = dict.ContainsKey("layout") ? dict["layout"].ToString() : "Vertical";
                        double l = dict.ContainsKey("left") ? Convert.ToDouble(dict["left"]) : 0;
                        double t = dict.ContainsKey("top") ? Convert.ToDouble(dict["top"]) : 460;

                        if (layoutStr == "WisprFlow") currentLayout = WidgetLayout.WisprFlow;
                        else if (layoutStr == "Horizontal") currentLayout = WidgetLayout.Horizontal;
                        else currentLayout = WidgetLayout.Vertical;

                        ApplyLayout(currentLayout);

                        if (dockStr == "Right") {
                            SetDock(DockPosition.Right, t);
                            return;
                        } else if (dockStr == "Bottom") {
                            SetDock(DockPosition.Bottom);
                            return;
                        } else if (dockStr == "Free") {
                            currentDock = DockPosition.Free;
                            Left = l;
                            Top = t;
                            SetCollapsed(false);
                            return;
                        } else {
                            SetDock(DockPosition.Left, t);
                            return;
                        }
                    }
                }
            } catch {}
            ApplyLayout(WidgetLayout.Vertical);
            SetDock(DockPosition.Left, 460);
        }

        private void SavePosition() {
            try {
                var dict = new Dictionary<string, object>();
                dict["dock"] = currentDock.ToString();
                dict["layout"] = currentLayout.ToString();
                dict["left"] = Left;
                dict["top"] = Top;
                var ser = new JavaScriptSerializer();
                System.IO.File.WriteAllText(GetWidgetPosPath(), ser.Serialize(dict));
            } catch {}
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
            try {
                var procs = System.Diagnostics.Process.GetProcessesByName("WaitPlay");
                int currentPid = System.Diagnostics.Process.GetCurrentProcess().Id;
                foreach (var p in procs) {
                    if (p.Id != currentPid && p.MainWindowHandle != IntPtr.Zero) {
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
                    }
                }
            }

            if (toggleOnly) {
                bool newState = WaitPlayStateManager.Toggle();
                Console.WriteLine("WaitPlay enabled: " + newState);
                return;
            }

            // If an agent invoked WaitPlay but the companion is turned OFF:
            if (!string.IsNullOrEmpty(targetSession) && !forceGame && !WaitPlayStateManager.IsEnabled()) {
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
