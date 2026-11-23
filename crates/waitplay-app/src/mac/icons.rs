//! Icons drawn in code (no image assets to ship): the menu bar glyph and its status badge. Pure RGBA buffers.

/// Menu bar icon: a rounded play triangle inside a ring, black on transparent so macOS can render it as a template image
/// (it adapts to light/dark menu bars). `size` px square (use 36 for a 18pt @2x status item).
pub fn menu_bar_rgba(size: u32) -> Vec<u8> {
    let n = size as f32;
    let (cx, cy) = (n / 2.0, n / 2.0);
    let radius = n * 0.44;
    let ring = n * 0.075;
    let mut px = vec![0u8; (size * size * 4) as usize];
    // 4x4 supersampling for smooth edges
    const SS: u32 = 4;
    for y in 0..size {
        for x in 0..size {
            let mut hit = 0u32;
            for sy in 0..SS {
                for sx in 0..SS {
                    let fx = x as f32 + (sx as f32 + 0.5) / SS as f32;
                    let fy = y as f32 + (sy as f32 + 0.5) / SS as f32;
                    let d = ((fx - cx).powi(2) + (fy - cy).powi(2)).sqrt();
                    let in_ring = (d - radius).abs() <= ring / 2.0;
                    // triangle pointing right, optically centred a little to the right of the middle
                    let (ax, ay) = (cx - n * 0.12, cy - n * 0.2);
                    let (bx, by) = (cx - n * 0.12, cy + n * 0.2);
                    let (tx, ty) = (cx + n * 0.2, cy);
                    let in_tri = inside_triangle((fx, fy), (ax, ay), (bx, by), (tx, ty));
                    if in_ring || in_tri {
                        hit += 1;
                    }
                }
            }
            let a = (hit * 255 / (SS * SS)) as u8;
            let i = ((y * size + x) * 4) as usize;
            px[i + 3] = a; // black (0,0,0) with coverage alpha
        }
    }
    px
}

fn inside_triangle(p: (f32, f32), a: (f32, f32), b: (f32, f32), c: (f32, f32)) -> bool {
    let sign = |p1: (f32, f32), p2: (f32, f32), p3: (f32, f32)| (p1.0 - p3.0) * (p2.1 - p3.1) - (p2.0 - p3.0) * (p1.1 - p3.1);
    let d1 = sign(p, a, b);
    let d2 = sign(p, b, c);
    let d3 = sign(p, c, a);
    let neg = d1 < 0.0 || d2 < 0.0 || d3 < 0.0;
    let pos = d1 > 0.0 || d2 > 0.0 || d3 > 0.0;
    !(neg && pos)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn menu_bar_icon_has_the_right_size_and_visible_ink() {
        let px = menu_bar_rgba(36);
        assert_eq!(px.len(), 36 * 36 * 4);
        let ink: usize = px.chunks(4).filter(|p| p[3] > 128).count();
        assert!(ink > 150 && ink < 700, "ink pixels: {}", ink);
        // corners stay transparent
        assert_eq!(px[3], 0);
        assert_eq!(px[px.len() - 1], 0);
        // the centre of the play triangle is filled
        let c = ((18 * 36 + 20) * 4 + 3) as usize;
        assert_eq!(px[c], 255);
    }
}
