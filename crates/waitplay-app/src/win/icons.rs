//! The app icon drawn in code (no image assets to ship): the indigo rounded square with the white play triangle that the widget and
//! the settings page also show. Pure RGBA buffers, used for the tray icon and the settings window icon.

type P = (f32, f32);

fn dist_to_segment(p: P, a: P, b: P) -> f32 {
    let (abx, aby) = (b.0 - a.0, b.1 - a.1);
    let len2 = abx * abx + aby * aby;
    let t = if len2 == 0.0 { 0.0 } else { (((p.0 - a.0) * abx + (p.1 - a.1) * aby) / len2).clamp(0.0, 1.0) };
    let (cx, cy) = (a.0 + t * abx, a.1 + t * aby);
    ((p.0 - cx).powi(2) + (p.1 - cy).powi(2)).sqrt()
}

fn inside_triangle(p: P, a: P, b: P, c: P) -> bool {
    let sign = |p1: P, p2: P, p3: P| (p1.0 - p3.0) * (p2.1 - p3.1) - (p2.0 - p3.0) * (p1.1 - p3.1);
    let d1 = sign(p, a, b);
    let d2 = sign(p, b, c);
    let d3 = sign(p, c, a);
    let neg = d1 < 0.0 || d2 < 0.0 || d3 < 0.0;
    let pos = d1 > 0.0 || d2 > 0.0 || d3 > 0.0;
    !(neg && pos)
}

/// Is `p` inside a square of side `n` with corner radius `r`?
fn inside_rounded_square(p: P, n: f32, r: f32) -> bool {
    let (qx, qy) = ((p.0 - n / 2.0).abs() - (n / 2.0 - r), (p.1 - n / 2.0).abs() - (n / 2.0 - r));
    let (ox, oy) = (qx.max(0.0), qy.max(0.0));
    (ox * ox + oy * oy).sqrt() + qx.max(qy).min(0.0) <= r
}

/// `size` px square, premultiplication-free RGBA: a vertical gradient (#8b92ff to #4046e0) square with a white rounded triangle.
pub fn app_icon_rgba(size: u32) -> Vec<u8> {
    let n = size as f32;
    let radius = n * 0.27;
    // the triangle of the widget icon (`M13 9.5v15l12-7.5z` in a 34 unit box), with the rounded joins of its 2.4 unit stroke
    let a = (n * 13.0 / 34.0, n * 9.5 / 34.0);
    let b = (n * 13.0 / 34.0, n * 24.5 / 34.0);
    let c = (n * 25.0 / 34.0, n * 17.0 / 34.0);
    let round = n * 1.2 / 34.0;
    const SS: u32 = 4;
    let mut px = vec![0u8; (size * size * 4) as usize];
    for y in 0..size {
        for x in 0..size {
            let (mut shape, mut glyph) = (0u32, 0u32);
            for sy in 0..SS {
                for sx in 0..SS {
                    let p = (x as f32 + (sx as f32 + 0.5) / SS as f32, y as f32 + (sy as f32 + 0.5) / SS as f32);
                    if inside_rounded_square(p, n, radius) {
                        shape += 1;
                        let near = dist_to_segment(p, a, b).min(dist_to_segment(p, b, c)).min(dist_to_segment(p, c, a)) <= round;
                        if inside_triangle(p, a, b, c) || near {
                            glyph += 1;
                        }
                    }
                }
            }
            let i = ((y * size + x) * 4) as usize;
            let total = SS * SS;
            let t = (y as f32 + 0.5) / n;
            let lerp = |lo: f32, hi: f32| (lo + (hi - lo) * t) as u32;
            let (bg_r, bg_g, bg_b) = (lerp(139.0, 64.0), lerp(146.0, 70.0), lerp(255.0, 224.0));
            let shape_f = shape as f32 / total as f32;
            let glyph_f = if shape == 0 { 0.0 } else { glyph as f32 / shape as f32 };
            let mix = |bg: u32| (bg as f32 * (1.0 - glyph_f) + 255.0 * glyph_f).round() as u8;
            px[i] = mix(bg_r);
            px[i + 1] = mix(bg_g);
            px[i + 2] = mix(bg_b);
            px[i + 3] = (shape_f * 255.0).round() as u8;
        }
    }
    px
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn icon_has_the_right_size_a_transparent_corner_and_a_white_triangle() {
        let px = app_icon_rgba(32);
        assert_eq!(px.len(), 32 * 32 * 4);
        assert_eq!(px[3], 0, "the corner outside the rounded square is transparent");
        // the centre of the triangle is opaque white
        let c = ((16 * 32 + 16) * 4) as usize;
        assert_eq!(&px[c..c + 4], &[255, 255, 255, 255]);
        // a spot inside the square but outside the triangle is the indigo background
        let bg = ((4 * 32 + 16) * 4) as usize;
        assert_eq!(px[bg + 3], 255);
        assert!(px[bg + 2] > 200 && px[bg] < 160, "background pixel {:?}", &px[bg..bg + 4]);
    }
}
