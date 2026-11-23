//! Dock side, its persistence and the geometry that follows from it. Pure logic: no windows, no globals (the tests below
//! run it on scratch folders).

use crate::platform::Rect;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

/// The three places the widget can sit. Declaration order is the tie-break order of [`nearest`] (the C# enum order).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DockSide {
    Right,
    Left,
    Bottom,
}

impl DockSide {
    pub const ALL: [DockSide; 3] = [DockSide::Right, DockSide::Left, DockSide::Bottom];

    /// The spelling the C# build wrote (`DockSide.ToString()`).
    pub fn name(self) -> &'static str {
        match self {
            DockSide::Right => "Right",
            DockSide::Left => "Left",
            DockSide::Bottom => "Bottom",
        }
    }

    pub fn css(self) -> &'static str {
        match self {
            DockSide::Right => "right",
            DockSide::Left => "left",
            DockSide::Bottom => "bottom",
        }
    }

    pub fn parse(s: &str) -> Option<DockSide> {
        let s = s.trim_matches(|c: char| c.is_whitespace() || c == '\u{feff}');
        DockSide::ALL.into_iter().find(|d| d.name().eq_ignore_ascii_case(s))
    }
}

// ---------------------------------------------------------------------------------------------------------------------
// Persistence
//
// Two files in `<temp>/waitplay`, both written by the C# build:
//   .waitplay-dock.txt          "Left"                                  the widget's own memory of the last choice
//   .waitplay-widget-pos.json   {"dock":"Left","left":250,"top":250}    written by `--dock=<side>`
// The C# widget only ever read the first, so `--dock=` did nothing to it. Here the newer file wins, which makes both work.
// `--dock=free` has no meaning for a widget that only knows three docks: it is not a preference and is ignored on load.
// ---------------------------------------------------------------------------------------------------------------------

const DOCK_FILE: &str = ".waitplay-dock.txt";
const POS_FILE: &str = ".waitplay-widget-pos.json";

fn read_dock_file(dir: &Path) -> Option<(DockSide, SystemTime)> {
    let p = dir.join(DOCK_FILE);
    let side = DockSide::parse(&fs::read_to_string(&p).ok()?)?;
    Some((side, fs::metadata(&p).ok()?.modified().ok()?))
}

fn read_pos_file(dir: &Path) -> Option<(DockSide, SystemTime)> {
    let p = dir.join(POS_FILE);
    let text = fs::read_to_string(&p).ok()?;
    let v: Value = serde_json::from_str(text.trim_start_matches('\u{feff}')).ok()?;
    let side = DockSide::parse(v.get("dock")?.as_str()?)?;
    Some((side, fs::metadata(&p).ok()?.modified().ok()?))
}

/// The saved dock, `None` when nothing usable was saved. On a tie the position file (an explicit `--dock=`) wins.
pub fn load(dir: &Path) -> Option<DockSide> {
    match (read_dock_file(dir), read_pos_file(dir)) {
        (Some(a), Some(b)) => Some(if a.1 > b.1 { a.0 } else { b.0 }),
        (Some(a), None) => Some(a.0),
        (None, Some(b)) => Some(b.0),
        (None, None) => None,
    }
}

/// The widget's own save (same file and spelling as the C# `SaveDock`).
pub fn save(dir: &Path, side: DockSide) {
    let _ = waitplay_core::paths::write_atomic(&dir.join(DOCK_FILE), side.name().as_bytes());
}

/// `--dock=<side>`: the same JSON the C# entry point wrote, to the temp folder and to the repo root.
/// `side` is the argument already lower-cased; anything but left/right/bottom is stored as "Free".
pub fn save_cli(dir: &Path, repo_root: Option<&Path>, side: &str) {
    let name = DockSide::parse(side).map_or("Free", DockSide::name);
    let body = json!({ "dock": name, "left": 250, "top": 250 }).to_string();
    let _ = waitplay_core::paths::write_atomic(&dir.join(POS_FILE), body.as_bytes());
    if let Some(root) = repo_root {
        let _ = waitplay_core::paths::write_atomic(&root.join(POS_FILE), body.as_bytes());
    }
}

pub fn dock_dir() -> PathBuf {
    waitplay_core::paths::ensure_signal_dir()
}

// ---------------------------------------------------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------------------------------------------------

/// What the page measured, in CSS px: the visible UI's box and where the capsule (or the idle handle) is centred inside it
/// (`cy` for the side docks, `cx` for the bottom dock). `dpr` converts CSS px to physical px.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Content {
    pub w: f64,
    pub h: f64,
    pub cx: f64,
    pub cy: f64,
    pub dpr: f64,
}

/// Design height the UI scale is measured against (1080p at 100% leaves a ~1040 DIP work area).
const REFERENCE_HEIGHT: f64 = 1040.0;
/// Capsule centre sits this far (CSS px at zoom 1) above the work area's vertical centre: the capsule + circle group is
/// centred, and the capsule is its upper part.
const GROUP_CENTRE_TO_CAPSULE: f64 = 17.5;

/// UI zoom: scales with the usable height in DIPs, so small laptops shrink and tall displays grow.
pub fn zoom_for(work_height_px: i32, scale_factor: f64) -> f64 {
    let dips = work_height_px as f64 / scale_factor.max(0.1);
    (dips / REFERENCE_HEIGHT).clamp(0.85, 1.35)
}

fn px(v: f64) -> i32 {
    // a hair under an integer must not cost a whole pixel of clipping
    (v - 1e-6).ceil() as i32
}

/// Where the window goes so that the UI hugs `dock`'s edge of the work area `wa` and the capsule stays on its anchor line
/// (vertical centre for the side docks, horizontal centre for the bottom dock) whatever else is showing.
pub fn window_rect(dock: DockSide, wa: Rect, c: &Content) -> Rect {
    let w = px(c.w * c.dpr).clamp(1, wa.width().max(1));
    let h = px(c.h * c.dpr).clamp(1, wa.height().max(1));
    let (left, top) = match dock {
        DockSide::Right | DockSide::Left => {
            let anchor_y = wa.top as f64 + wa.height() as f64 / 2.0 - GROUP_CENTRE_TO_CAPSULE * c.dpr;
            let left = if dock == DockSide::Right { wa.right - w } else { wa.left };
            (left, (anchor_y - c.cy * c.dpr).round() as i32)
        }
        DockSide::Bottom => {
            let anchor_x = wa.left as f64 + wa.width() as f64 / 2.0;
            ((anchor_x - c.cx * c.dpr).round() as i32, wa.bottom - h)
        }
    };
    // never hang over the work area (a tall popup near a small screen)
    let left = left.clamp(wa.left, (wa.right - w).max(wa.left));
    let top = top.clamp(wa.top, (wa.bottom - h).max(wa.top));
    Rect { left, top, right: left + w, bottom: top + h }
}

/// Where each dock's capsule lands, in CSS px of a full-work-area page: the drag overlay's drop zones.
pub fn zone_centres(w: f64, h: f64) -> [(DockSide, (f64, f64)); 3] {
    [(DockSide::Right, (w - 22.0, h / 2.0)), (DockSide::Left, (22.0, h / 2.0)), (DockSide::Bottom, (w / 2.0, h - 18.0))]
}

/// The dock whose zone centre is closest to `p` (same CSS px frame as [`zone_centres`]).
pub fn nearest(p: (f64, f64), w: f64, h: f64) -> DockSide {
    let mut best = (DockSide::Right, f64::MAX);
    for (side, (x, y)) in zone_centres(w, h) {
        let d = (p.0 - x).powi(2) + (p.1 - y).powi(2);
        if d < best.1 {
            best = (side, d);
        }
    }
    best.0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(tag: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("wp-dock-{}-{}", tag, std::process::id()));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p
    }

    fn set_mtime(p: &Path, secs_ago: u64) {
        let f = fs::OpenOptions::new().write(true).open(p).unwrap();
        f.set_modified(SystemTime::now() - std::time::Duration::from_secs(secs_ago)).unwrap();
    }

    #[test]
    fn parse_names() {
        assert_eq!(DockSide::parse("Left"), Some(DockSide::Left));
        assert_eq!(DockSide::parse(" bottom\r\n"), Some(DockSide::Bottom));
        assert_eq!(DockSide::parse("\u{feff}RIGHT"), Some(DockSide::Right));
        assert_eq!(DockSide::parse("Free"), None);
        assert_eq!(DockSide::parse(""), None);
    }

    #[test]
    fn widget_save_round_trips() {
        let d = scratch("rt");
        assert_eq!(load(&d), None);
        for side in DockSide::ALL {
            save(&d, side);
            assert_eq!(load(&d), Some(side));
        }
        // the C# widget wrote exactly the enum name, no newline
        assert_eq!(fs::read_to_string(d.join(DOCK_FILE)).unwrap(), "Bottom");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn reads_files_written_by_the_csharp_app() {
        let d = scratch("cs");
        fs::write(d.join(DOCK_FILE), "Left").unwrap();
        assert_eq!(load(&d), Some(DockSide::Left));
        fs::remove_file(d.join(DOCK_FILE)).unwrap();
        // JavaScriptSerializer output of the `--dock=` entry point
        fs::write(d.join(POS_FILE), r#"{"dock":"Bottom","left":250,"top":250}"#).unwrap();
        assert_eq!(load(&d), Some(DockSide::Bottom));
        fs::write(d.join(POS_FILE), r#"{"dock":"Free","left":250,"top":250}"#).unwrap();
        assert_eq!(load(&d), None);
        fs::write(d.join(POS_FILE), "not json").unwrap();
        assert_eq!(load(&d), None);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn newest_file_wins_and_free_is_not_a_preference() {
        let d = scratch("new");
        save(&d, DockSide::Left);
        save_cli(&d, None, "bottom");
        set_mtime(&d.join(DOCK_FILE), 60);
        assert_eq!(load(&d), Some(DockSide::Bottom)); // `--dock=bottom` after the menu choice
        set_mtime(&d.join(POS_FILE), 120);
        assert_eq!(load(&d), Some(DockSide::Left)); // menu choice after `--dock=bottom`
        save_cli(&d, None, "free");
        assert_eq!(fs::read_to_string(d.join(POS_FILE)).unwrap(), r#"{"dock":"Free","left":250,"top":250}"#);
        assert_eq!(load(&d), Some(DockSide::Left));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn cli_writes_temp_and_repo_root() {
        let (d, root) = (scratch("cli-d"), scratch("cli-r"));
        save_cli(&d, Some(&root), "right");
        let want = r#"{"dock":"Right","left":250,"top":250}"#;
        assert_eq!(fs::read_to_string(d.join(POS_FILE)).unwrap(), want);
        assert_eq!(fs::read_to_string(root.join(POS_FILE)).unwrap(), want);
        let _ = fs::remove_dir_all(&d);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn zoom_follows_work_height() {
        assert!((zoom_for(1040, 1.0) - 1.0).abs() < 1e-9);
        assert!((zoom_for(1032, 1.0) - 0.99230769).abs() < 1e-6);
        assert_eq!(zoom_for(600, 1.0), 0.85);
        assert_eq!(zoom_for(2000, 1.0), 1.35);
        // 150% scaling: a 1620 px work area is 1080 DIP
        assert!((zoom_for(1560, 1.5) - 1.0).abs() < 1e-9);
    }

    const WA: Rect = Rect { left: 0, top: 0, right: 1920, bottom: 1032 };

    #[test]
    fn side_docks_hug_the_edge_and_keep_the_capsule_on_the_anchor() {
        // idle handle: 14 x 44 css, centred on the capsule line
        let handle = Content { w: 14.0, h: 44.0, cx: 7.0, cy: 22.0, dpr: 1.0 };
        let r = window_rect(DockSide::Right, WA, &handle);
        assert_eq!((r.right, r.width(), r.height()), (1920, 14, 44));
        assert_eq!(r.top, 477); // 516 - 17.5 - 22, rounded
        let l = window_rect(DockSide::Left, WA, &handle);
        assert_eq!((l.left, l.top), (0, r.top));

        // expanded with the pill out: the capsule centre (cy 30) stays where the handle's centre was
        let open = Content { w: 170.0, h: 98.0, cx: 150.0, cy: 30.0, dpr: 1.0 };
        let o = window_rect(DockSide::Right, WA, &open);
        assert_eq!((o.right, o.width(), o.height()), (1920, 170, 98));
        assert_eq!(o.top + 30, r.top + 22);
    }

    #[test]
    fn bottom_dock_centres_the_capsule_column_on_the_screen() {
        let handle = Content { w: 44.0, h: 14.0, cx: 22.0, cy: 7.0, dpr: 1.0 };
        let r = window_rect(DockSide::Bottom, WA, &handle);
        assert_eq!((r.bottom, r.left + 22), (1032, 960));
        let open = Content { w: 200.0, h: 100.0, cx: 150.0, cy: 30.0, dpr: 1.0 };
        let o = window_rect(DockSide::Bottom, WA, &open);
        assert_eq!((o.bottom, o.left + 150, o.width()), (1032, 960, 200));
    }

    #[test]
    fn physical_sizes_use_the_dpr_and_never_leave_the_work_area() {
        let wa = Rect { left: 0, top: 0, right: 2880, bottom: 1548 }; // 1920x1032 DIP at 150%
        let c = Content { w: 32.0, h: 52.0, cx: 16.0, cy: 26.0, dpr: 1.5 };
        let r = window_rect(DockSide::Right, wa, &c);
        assert_eq!((r.width(), r.height(), r.right), (48, 78, 2880));
        // a popup taller than the screen is clamped, not allowed to hang off
        let tall = Content { w: 100.0, h: 5000.0, cx: 0.0, cy: 0.0, dpr: 1.0 };
        let t = window_rect(DockSide::Left, WA, &tall);
        assert_eq!((t.top, t.bottom), (0, 1032));
        // fractional CSS sizes round up so no pixel of the UI is cut
        let f = Content { w: 31.2, h: 10.0, cx: 0.0, cy: 0.0, dpr: 1.25 };
        assert_eq!(window_rect(DockSide::Right, WA, &f).width(), 39);
    }

    #[test]
    fn nearest_zone() {
        let (w, h) = (1920.0, 1032.0);
        assert_eq!(nearest((1900.0, 500.0), w, h), DockSide::Right);
        assert_eq!(nearest((5.0, 100.0), w, h), DockSide::Left);
        assert_eq!(nearest((960.0, 1000.0), w, h), DockSide::Bottom);
        assert_eq!(nearest((960.0, 300.0), w, h), DockSide::Bottom); // dead centre-top leans to the bottom zone only by distance
        assert_eq!(nearest((200.0, 900.0), w, h), DockSide::Left);
        assert_eq!(nearest((1500.0, 900.0), w, h), DockSide::Bottom);
        assert_eq!(nearest((1700.0, 600.0), w, h), DockSide::Right);
        // exact tie between left and right goes to the first in enum order
        assert_eq!(nearest((200.0, 1000.0), 400.0, 2000.0), DockSide::Right);
    }
}
