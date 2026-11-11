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
            IntPtr initialForeground = ParentWindowTracker.GetForegroundWindow();
            uint currentPid = (uint)System.Diagnostics.Process.GetCurrentProcess().Id;
            uint fgPid;
            ParentWindowTracker.GetWindowThreadProcessId(initialForeground, out fgPid);
            if (fgPid == currentPid) initialForeground = IntPtr.Zero;

            string targetSession = "";
            string terminal = "";
            long promptTime = 0;
            uint parentPid = 0;
            IntPtr parentHwnd = IntPtr.Zero;

            if (args != null && args.Length > 0) {
                foreach (var a in args) {
                    if (a.StartsWith("--session=")) {
                        targetSession = a.Substring("--session=".Length);
                    } else if (a.StartsWith("--terminal=")) {
                        terminal = a.Substring("--terminal=".Length).Trim('\"', '\'');
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

            if (parentHwnd == IntPtr.Zero && parentPid > 0) {
                parentHwnd = ParentWindowTracker.FindTopWindowForPid(parentPid);
            }
            if (parentHwnd == IntPtr.Zero && initialForeground != IntPtr.Zero) {
                parentHwnd = initialForeground;
            }

            if (string.IsNullOrEmpty(targetSession)) {
                string detected = MainWindow.DetectActiveAgent();
                targetSession = (detected == "OMP") ? "omp-session"
                    : (detected == "ChatGPT") ? "codex-session"
                    : (detected == "OpenCode") ? "opencode-session"
                    : (detected == "Cline") ? "cline-session"
                    : "agent-session";
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
