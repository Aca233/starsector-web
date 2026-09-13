#[no_mangle]
pub extern "C" fn segment_circle_hit(
    x0: f64, y0: f64, x1: f64, y1: f64, cx: f64, cy: f64, radius: f64,
) -> i32 {
    let dx = x1 - x0;
    let dy = y1 - y0;
    let l2 = dx * dx + dy * dy;
    let mut t = if l2 > 0.0 { ((cx - x0) * dx + (cy - y0) * dy) / l2 } else { 0.0 };
    t = t.clamp(0.0, 1.0);
    let px = x0 + t * dx - cx;
    let py = y0 + t * dy - cy;
    if px * px + py * py <= radius * radius { 1 } else { 0 }
}
