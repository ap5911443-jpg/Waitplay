param (
    [Parameter(Mandatory=$true)]
    [ValidateSet("show", "close")]
    [string]$Action
)

Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public class WinPopupHelper {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    public static IntPtr FindWaitPlayHwnd() {
        IntPtr result = IntPtr.Zero;
        EnumWindows((hWnd, lParam) => {
            if (IsWindowVisible(hWnd)) {
                var sb = new StringBuilder(256);
                GetWindowText(hWnd, sb, 256);
                var t = sb.ToString();
                if (t.StartsWith("WaitPlay") && !t.Contains("WindowsTerminal") && !t.Contains("GAME:")) {
                    result = hWnd;
                    return false;
                }
            }
            return true;
        }, IntPtr.Zero);
        return result;
    }
}
'@

$URL = "http://127.0.0.1:5200/?popup=1"

function Get-BrowserPath {
    $edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
    if (Test-Path $edge) { return $edge }
    $chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
    if (Test-Path $chrome) { return $chrome }
    return $null
}

if ($Action -eq "show") {
    $hwnd = [WinPopupHelper]::FindWaitPlayHwnd()
    if ($hwnd -ne [IntPtr]::Zero) {
        [WinPopupHelper]::ShowWindowAsync($hwnd, 9)
        [WinPopupHelper]::SetForegroundWindow($hwnd)
        [WinPopupHelper]::SetWindowPos($hwnd, [IntPtr](-1), 0, 0, 0, 0, 0x0003)
        exit 0
    }

    $browser = Get-BrowserPath
    if (-not $browser) {
        Start-Process $URL
        exit 0
    }

    # If Edge, ensure no ghost background instances block the standalone window
    if ($browser -like "*msedge*") {
        $visibleEdge = Get-Process msedge -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }
        if (-not $visibleEdge) {
            Stop-Process -Name msedge -Force -ErrorAction SilentlyContinue
            Start-Sleep -Milliseconds 150
        }
    }

    Start-Process $browser -ArgumentList "--app=$URL", "--new-window", "--window-size=920,720"

    # Wait for window and bring to top-most
    $wshell = New-Object -ComObject WScript.Shell
    for ($i = 0; $i -lt 25; $i++) {
        Start-Sleep -Milliseconds 150
        $hwnd = [WinPopupHelper]::FindWaitPlayHwnd()
        if ($hwnd -ne [IntPtr]::Zero) {
            [WinPopupHelper]::ShowWindowAsync($hwnd, 9)
            [WinPopupHelper]::SetForegroundWindow($hwnd)
            [WinPopupHelper]::SetWindowPos($hwnd, [IntPtr](-1), 0, 0, 0, 0, 0x0003)
            $wshell.AppActivate("WaitPlay")
            break
        }
    }
} elseif ($Action -eq "close") {
    $hwnd = [WinPopupHelper]::FindWaitPlayHwnd()
    if ($hwnd -ne [IntPtr]::Zero) {
        [WinPopupHelper]::PostMessage($hwnd, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)
        Start-Sleep -Milliseconds 500
    }
    # Clean up Edge app process if it was used
    $edgeApp = Get-Process msedge -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like "*WaitPlay*" }
    if ($edgeApp) {
        Stop-Process -Id $edgeApp[0].Id -Force -ErrorAction SilentlyContinue
    }
}
