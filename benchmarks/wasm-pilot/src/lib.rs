use std::alloc::{alloc, dealloc, Layout};
use std::slice;

const SHIP_STRIDE: usize = 13;
const PROJECTILE_STRIDE: usize = 4;
const OUTPUT_STRIDE: usize = 5;
const COLLISION_NONE: f64 = 0.0;
const COLLISION_HULL: f64 = 1.0;
const COLLISION_SHIELD: f64 = 2.0;

#[inline]
fn point_in_polygon(x: f64, y: f64, outline: &[f64], start_vertex: usize, vertex_count: usize) -> bool {
    if vertex_count < 3 {
        return false;
    }
    let mut inside = false;
    let mut j = vertex_count - 1;
    for i in 0..vertex_count {
        let ii = (start_vertex + i) * 2;
        let jj = (start_vertex + j) * 2;
        let xi = outline[ii];
        let yi = outline[ii + 1];
        let xj = outline[jj];
        let yj = outline[jj + 1];
        if (yi > y) != (yj > y) {
            let edge_y = yj - yi;
            if edge_y.abs() > 1.0e-12 && x < ((xj - xi) * (y - yi)) / edge_y + xi {
                inside = !inside;
            }
        }
        j = i;
    }
    inside
}

#[inline]
fn segment_polygon_hit_t(
    x0: f64,
    y0: f64,
    x1: f64,
    y1: f64,
    outline: &[f64],
    start_vertex: usize,
    vertex_count: usize,
) -> Option<f64> {
    if vertex_count < 3 {
        return None;
    }
    if point_in_polygon(x0, y0, outline, start_vertex, vertex_count) {
        return Some(0.0);
    }

    let dx1 = x1 - x0;
    let dy1 = y1 - y0;
    let mut best_t = f64::INFINITY;
    let mut j = vertex_count - 1;

    for i in 0..vertex_count {
        let ii = (start_vertex + i) * 2;
        let jj = (start_vertex + j) * 2;
        let x3 = outline[jj];
        let y3 = outline[jj + 1];
        let x4 = outline[ii];
        let y4 = outline[ii + 1];
        let dx2 = x4 - x3;
        let dy2 = y4 - y3;
        let denom = dx1 * dy2 - dy1 * dx2;
        if denom.abs() >= 1.0e-8 {
            let dx3 = x0 - x3;
            let dy3 = y0 - y3;
            let t = (dx2 * dy3 - dy2 * dx3) / denom;
            let u = (dx1 * dy3 - dy1 * dx3) / denom;
            if (0.0..=1.0).contains(&t) && (0.0..=1.0).contains(&u) && t < best_t {
                best_t = t;
            }
        }
        j = i;
    }

    if best_t.is_finite() {
        Some(best_t)
    } else if point_in_polygon(x1, y1, outline, start_vertex, vertex_count) {
        Some(1.0)
    } else {
        None
    }
}

#[inline]
fn circle_roots(
    x0: f64,
    y0: f64,
    x1: f64,
    y1: f64,
    cx: f64,
    cy: f64,
    radius_sq: f64,
) -> (Option<f64>, Option<f64>) {
    let dx = x1 - x0;
    let dy = y1 - y0;
    let fx = x0 - cx;
    let fy = y0 - cy;
    let a = dx * dx + dy * dy;
    let c = fx * fx + fy * fy - radius_sq;

    if c <= 0.0 {
        return (Some(0.0), None);
    }
    if a <= 1.0e-18 {
        return (None, None);
    }

    let b = 2.0 * (fx * dx + fy * dy);
    let discriminant = b * b - 4.0 * a * c;
    if discriminant < 0.0 {
        return (None, None);
    }

    let root = discriminant.sqrt();
    let inv_2a = 0.5 / a;
    let t0 = (-b - root) * inv_2a;
    let t1 = (-b + root) * inv_2a;
    let first = if (0.0..=1.0).contains(&t0) { Some(t0) } else { None };
    let second = if (0.0..=1.0).contains(&t1) { Some(t1) } else { None };
    (first, second)
}

#[inline]
fn shield_hit_t(
    x0: f64,
    y0: f64,
    x1: f64,
    y1: f64,
    cx: f64,
    cy: f64,
    facing_x: f64,
    facing_y: f64,
    radius_sq: f64,
    half_arc_cos: f64,
) -> Option<f64> {
    if radius_sq <= 0.0 {
        return None;
    }
    let (first, second) = circle_roots(x0, y0, x1, y1, cx, cy, radius_sq);
    for t in [first, second].into_iter().flatten() {
        let hx = x0 + (x1 - x0) * t - cx;
        let hy = y0 + (y1 - y0) * t - cy;
        let length = (hx * hx + hy * hy).sqrt();
        if length <= 1.0e-12 || half_arc_cos <= -0.999_999 {
            return Some(t);
        }
        let dot = (hx * facing_x + hy * facing_y) / length;
        if dot >= half_arc_cos {
            return Some(t);
        }
    }
    None
}

#[no_mangle]
pub extern "C" fn alloc_bytes(len: usize) -> *mut u8 {
    if len == 0 {
        return std::ptr::null_mut();
    }
    let Ok(layout) = Layout::from_size_align(len, 8) else {
        return std::ptr::null_mut();
    };
    unsafe { alloc(layout) }
}

#[no_mangle]
pub extern "C" fn dealloc_bytes(ptr: *mut u8, len: usize) {
    if ptr.is_null() || len == 0 {
        return;
    }
    if let Ok(layout) = Layout::from_size_align(len, 8) {
        unsafe { dealloc(ptr, layout) };
    }
}

/// Static input:
/// outlines     = [localX, localY] * vertex_count
/// outline_meta = [startVertex, vertexCount] * outline_count
///
/// Dynamic ship input (13 f64 values per ship):
/// [x, y, facingCos, facingSin, hullBroadphaseRadiusSq, outlineId,
///  shieldRadiusSq, shieldHalfArcCos, shieldActive, shieldCenterLocalX,
///  shieldCenterLocalY, shieldFacingCos, shieldFacingSin]
///
/// Projectile input: [x0, y0, x1, y1] per projectile.
/// Output: [targetIndex, t, hitX, hitY, collisionType] per projectile,
/// where collisionType is 0 none, 1 hull, 2 shield.
#[no_mangle]
pub extern "C" fn batch_nearest_hits(
    outlines_ptr: *const f64,
    outline_meta_ptr: *const f64,
    outline_count: usize,
    ships_ptr: *const f64,
    ship_count: usize,
    projectiles_ptr: *const f64,
    projectile_count: usize,
    output_ptr: *mut f64,
) -> usize {
    if projectile_count == 0 {
        return 0;
    }
    if outlines_ptr.is_null()
        || outline_meta_ptr.is_null()
        || ships_ptr.is_null()
        || projectiles_ptr.is_null()
        || output_ptr.is_null()
    {
        return 0;
    }

    let outline_meta = unsafe { slice::from_raw_parts(outline_meta_ptr, outline_count * 2) };
    let max_vertex = (0..outline_count)
        .map(|index| {
            let m = index * 2;
            outline_meta[m] as usize + outline_meta[m + 1] as usize
        })
        .max()
        .unwrap_or(0);
    let outlines = unsafe { slice::from_raw_parts(outlines_ptr, max_vertex * 2) };
    let ships = unsafe { slice::from_raw_parts(ships_ptr, ship_count * SHIP_STRIDE) };
    let projectiles = unsafe {
        slice::from_raw_parts(projectiles_ptr, projectile_count * PROJECTILE_STRIDE)
    };
    let output = unsafe {
        slice::from_raw_parts_mut(output_ptr, projectile_count * OUTPUT_STRIDE)
    };

    let mut hit_count = 0usize;

    for projectile_index in 0..projectile_count {
        let p = projectile_index * PROJECTILE_STRIDE;
        let x0 = projectiles[p];
        let y0 = projectiles[p + 1];
        let x1 = projectiles[p + 2];
        let y1 = projectiles[p + 3];
        let mut best_target = -1.0f64;
        let mut best_t = f64::INFINITY;
        let mut best_type = COLLISION_NONE;

        for ship_index in 0..ship_count {
            let s = ship_index * SHIP_STRIDE;
            let cx = ships[s];
            let cy = ships[s + 1];
            let facing_cos = ships[s + 2];
            let facing_sin = ships[s + 3];
            let broadphase_radius_sq = ships[s + 4];
            let outline_id = ships[s + 5] as usize;

            let broadphase_roots = circle_roots(x0, y0, x1, y1, cx, cy, broadphase_radius_sq);
            if broadphase_roots.0.is_none() && broadphase_roots.1.is_none() {
                continue;
            }

            let shield_active = ships[s + 8] >= 0.5;
            if shield_active {
                let shield_local_x = ships[s + 9];
                let shield_local_y = ships[s + 10];
                let shield_cx = cx + shield_local_x * facing_cos - shield_local_y * facing_sin;
                let shield_cy = cy + shield_local_x * facing_sin + shield_local_y * facing_cos;
                if let Some(t) = shield_hit_t(
                    x0,
                    y0,
                    x1,
                    y1,
                    shield_cx,
                    shield_cy,
                    ships[s + 11],
                    ships[s + 12],
                    ships[s + 6],
                    ships[s + 7],
                ) {
                    if t < best_t {
                        best_t = t;
                        best_target = ship_index as f64;
                        best_type = COLLISION_SHIELD;
                    }
                }
            }

            if outline_id >= outline_count {
                continue;
            }
            let meta = outline_id * 2;
            let start_vertex = outline_meta[meta] as usize;
            let vertex_count = outline_meta[meta + 1] as usize;
            let rel_x0 = x0 - cx;
            let rel_y0 = y0 - cy;
            let rel_x1 = x1 - cx;
            let rel_y1 = y1 - cy;
            let local_x0 = rel_x0 * facing_cos + rel_y0 * facing_sin;
            let local_y0 = -rel_x0 * facing_sin + rel_y0 * facing_cos;
            let local_x1 = rel_x1 * facing_cos + rel_y1 * facing_sin;
            let local_y1 = -rel_x1 * facing_sin + rel_y1 * facing_cos;
            if let Some(t) = segment_polygon_hit_t(
                local_x0,
                local_y0,
                local_x1,
                local_y1,
                outlines,
                start_vertex,
                vertex_count,
            ) {
                if t < best_t {
                    best_t = t;
                    best_target = ship_index as f64;
                    best_type = COLLISION_HULL;
                }
            }
        }

        let o = projectile_index * OUTPUT_STRIDE;
        if best_target >= 0.0 {
            output[o] = best_target;
            output[o + 1] = best_t;
            output[o + 2] = x0 + (x1 - x0) * best_t;
            output[o + 3] = y0 + (y1 - y0) * best_t;
            output[o + 4] = best_type;
            hit_count += 1;
        } else {
            output[o] = -1.0;
            output[o + 1] = 1.0;
            output[o + 2] = x1;
            output[o + 3] = y1;
            output[o + 4] = COLLISION_NONE;
        }
    }

    hit_count
}

/// Runtime-oriented variant of `batch_nearest_hits`.
///
/// `candidate_offsets` has `projectile_count + 1` entries and indexes the
/// flattened `candidate_indices` array. Each projectile therefore tests only
/// the broadphase candidates supplied by TypeScript's spatial grid while all
/// exact hull/shield geometry remains identical to the full-scan pilot.
#[no_mangle]
pub extern "C" fn batch_nearest_hits_indexed(
    outlines_ptr: *const f64,
    outline_meta_ptr: *const f64,
    outline_count: usize,
    ships_ptr: *const f64,
    ship_count: usize,
    projectiles_ptr: *const f64,
    projectile_count: usize,
    candidate_offsets_ptr: *const f64,
    candidate_indices_ptr: *const f64,
    candidate_count: usize,
    output_ptr: *mut f64,
) -> usize {
    if projectile_count == 0 {
        return 0;
    }
    if outlines_ptr.is_null()
        || outline_meta_ptr.is_null()
        || ships_ptr.is_null()
        || projectiles_ptr.is_null()
        || candidate_offsets_ptr.is_null()
        || output_ptr.is_null()
        || (candidate_count > 0 && candidate_indices_ptr.is_null())
    {
        return 0;
    }

    let outline_meta = unsafe { slice::from_raw_parts(outline_meta_ptr, outline_count * 2) };
    let max_vertex = (0..outline_count)
        .map(|index| {
            let m = index * 2;
            outline_meta[m] as usize + outline_meta[m + 1] as usize
        })
        .max()
        .unwrap_or(0);
    let outlines = unsafe { slice::from_raw_parts(outlines_ptr, max_vertex * 2) };
    let ships = unsafe { slice::from_raw_parts(ships_ptr, ship_count * SHIP_STRIDE) };
    let projectiles = unsafe {
        slice::from_raw_parts(projectiles_ptr, projectile_count * PROJECTILE_STRIDE)
    };
    let candidate_offsets = unsafe {
        slice::from_raw_parts(candidate_offsets_ptr, projectile_count + 1)
    };
    let candidate_indices: &[f64] = if candidate_count == 0 {
        &[]
    } else {
        unsafe { slice::from_raw_parts(candidate_indices_ptr, candidate_count) }
    };
    let output = unsafe {
        slice::from_raw_parts_mut(output_ptr, projectile_count * OUTPUT_STRIDE)
    };

    let mut hit_count = 0usize;

    for projectile_index in 0..projectile_count {
        let p = projectile_index * PROJECTILE_STRIDE;
        let x0 = projectiles[p];
        let y0 = projectiles[p + 1];
        let x1 = projectiles[p + 2];
        let y1 = projectiles[p + 3];
        let mut best_target = -1.0f64;
        let mut best_t = f64::INFINITY;
        let mut best_type = COLLISION_NONE;

        let raw_start = candidate_offsets[projectile_index];
        let raw_end = candidate_offsets[projectile_index + 1];
        let start = if raw_start.is_finite() && raw_start >= 0.0 {
            (raw_start as usize).min(candidate_count)
        } else {
            candidate_count
        };
        let end = if raw_end.is_finite() && raw_end >= 0.0 {
            (raw_end as usize).min(candidate_count)
        } else {
            start
        };

        if start <= end {
            for candidate_slot in start..end {
                let raw_ship_index = candidate_indices[candidate_slot];
                if !raw_ship_index.is_finite() || raw_ship_index < 0.0 {
                    continue;
                }
                let ship_index = raw_ship_index as usize;
                if ship_index >= ship_count {
                    continue;
                }

                let s = ship_index * SHIP_STRIDE;
                let cx = ships[s];
                let cy = ships[s + 1];
                let facing_cos = ships[s + 2];
                let facing_sin = ships[s + 3];
                let broadphase_radius_sq = ships[s + 4];
                let outline_id = ships[s + 5] as usize;

                let broadphase_roots = circle_roots(x0, y0, x1, y1, cx, cy, broadphase_radius_sq);
                if broadphase_roots.0.is_none() && broadphase_roots.1.is_none() {
                    continue;
                }

                if ships[s + 8] >= 0.5 {
                    let shield_local_x = ships[s + 9];
                    let shield_local_y = ships[s + 10];
                    let shield_cx = cx + shield_local_x * facing_cos - shield_local_y * facing_sin;
                    let shield_cy = cy + shield_local_x * facing_sin + shield_local_y * facing_cos;
                    if let Some(t) = shield_hit_t(
                        x0,
                        y0,
                        x1,
                        y1,
                        shield_cx,
                        shield_cy,
                        ships[s + 11],
                        ships[s + 12],
                        ships[s + 6],
                        ships[s + 7],
                    ) {
                        if t < best_t {
                            best_t = t;
                            best_target = ship_index as f64;
                            best_type = COLLISION_SHIELD;
                        }
                    }
                }

                if outline_id >= outline_count {
                    continue;
                }
                let meta = outline_id * 2;
                let start_vertex = outline_meta[meta] as usize;
                let vertex_count = outline_meta[meta + 1] as usize;
                let rel_x0 = x0 - cx;
                let rel_y0 = y0 - cy;
                let rel_x1 = x1 - cx;
                let rel_y1 = y1 - cy;
                let local_x0 = rel_x0 * facing_cos + rel_y0 * facing_sin;
                let local_y0 = -rel_x0 * facing_sin + rel_y0 * facing_cos;
                let local_x1 = rel_x1 * facing_cos + rel_y1 * facing_sin;
                let local_y1 = -rel_x1 * facing_sin + rel_y1 * facing_cos;
                if let Some(t) = segment_polygon_hit_t(
                    local_x0,
                    local_y0,
                    local_x1,
                    local_y1,
                    outlines,
                    start_vertex,
                    vertex_count,
                ) {
                    if t < best_t {
                        best_t = t;
                        best_target = ship_index as f64;
                        best_type = COLLISION_HULL;
                    }
                }
            }
        }

        let o = projectile_index * OUTPUT_STRIDE;
        if best_target >= 0.0 {
            output[o] = best_target;
            output[o + 1] = best_t;
            output[o + 2] = x0 + (x1 - x0) * best_t;
            output[o + 3] = y0 + (y1 - y0) * best_t;
            output[o + 4] = best_type;
            hit_count += 1;
        } else {
            output[o] = -1.0;
            output[o + 1] = 1.0;
            output[o + 2] = x1;
            output[o + 3] = y1;
            output[o + 4] = COLLISION_NONE;
        }
    }

    hit_count
}
