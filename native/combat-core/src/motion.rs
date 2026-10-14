//! Port of simulation/systems/MotionKernel.ts, with resident rows instead of
//! per-step JS uploads. Stats are explicit commands until their producers migrate.

pub const WIDTH: usize = 22;
pub const X: usize = 0;
pub const Y: usize = 1;
pub const VX: usize = 2;
pub const VY: usize = 3;
pub const FACING: usize = 4;
pub const ANGULAR: usize = 5;
pub const DT: usize = 6;
pub const TURN: usize = 7;
pub const BRAKE: usize = 8;
pub const THROTTLE: usize = 9;
pub const STRAFE: usize = 10;
pub const FLAGS: usize = 11;
pub const ACCELERATION: usize = 12;
pub const DECELERATION: usize = 13;
pub const MAX_SPEED: usize = 14;
pub const TURN_ACCELERATION: usize = 15;
pub const MAX_TURN: usize = 16;
pub const DRIFT: usize = 17;
pub const STRAFE_MULTIPLIER: usize = 18;
pub const ACCELERATING: usize = 19;
pub const SPREADING: usize = 20;

const FLAMED_OUT: u32 = 1;
const FORCE_FORWARD: u32 = 2;
const LOCKED_TURNING: u32 = 4;
const FORCED_RIGHT_TURN: u32 = 8;
const FORCE_BRAKING: u32 = 16;
const BLOCK_ACCELERATION: u32 = 32;
const BLOCK_STRAFING: u32 = 64;
const FIGHTER: u32 = 128;

fn length(x: f64, y: f64) -> f64 {
    // Keep Vector2.coordinateLength's scaled arithmetic and subnormal handling.
    let a = x.abs();
    let b = y.abs();
    if a == f64::INFINITY || b == f64::INFINITY { return f64::INFINITY; }
    let max = if a > b { a } else { b };
    if max == 0.0 && a == 0.0 { return 0.0; }
    let ratio = (if a > b { b } else { a }) / max;
    (1.0 + ratio * ratio).sqrt() * max
}

fn sign(value: f64) -> f64 {
    if value == 0.0 { value } else if value < 0.0 { -1.0 } else { 1.0 }
}

fn overspeed_scale(vx: f64, vy: f64, limit: f64, amount: f64) -> f64 {
    let speed = length(vx, vy);
    if speed > limit { (speed - amount.min(speed - limit)) / speed } else { 1.0 }
}

pub fn advance_angular(velocity: f64, input: f64, dt: f64, acceleration: f64, limit: f64) -> f64 {
    if input.abs() <= 0.01 {
        return velocity - sign(velocity) * velocity.abs().min(acceleration * 0.5 * dt);
    }
    let step = dt * input.abs().min(1.0) * acceleration;
    if velocity.abs() > limit {
        return velocity - sign(velocity) * velocity.abs().min(step * 2.0);
    }
    let next = velocity + sign(input) * step;
    if next.abs() > limit { sign(input) * limit } else { next }
}

pub fn advance(row: &mut [f64; WIDTH], dt: f64) {
    row[DT] = dt;
    row[ACCELERATING] = 0.0;
    row[SPREADING] = 0.0;
    if dt <= 0.0 { return; }
    let mut vx = row[VX];
    let mut vy = row[VY];
    let facing = row[FACING];
    let flags = row[FLAGS] as u32;
    let mut spin = row[ANGULAR];
    if flags & FLAMED_OUT == 0 {
        let acceleration = row[ACCELERATION];
        let deceleration = row[DECELERATION];
        let max_speed = row[MAX_SPEED];
        let turn_acceleration = row[TURN_ACCELERATION];
        let max_turn = row[MAX_TURN];
        let burn = flags & FORCE_FORWARD != 0;
        let turn = if flags & LOCKED_TURNING != 0 { 0.0 }
            else if flags & FORCED_RIGHT_TURN != 0 { 1.0 } else { row[TURN] };
        let turning = turn.abs() > 0.01;
        if turning { spin = advance_angular(spin, turn, dt, turn_acceleration, max_turn); }
        spin += row[DRIFT] * dt;
        if !turning { spin = advance_angular(spin, 0.0, dt, turn_acceleration, max_turn); }
        let brake = flags & FORCE_BRAKING != 0
            || (!burn && flags & BLOCK_ACCELERATION == 0 && row[BRAKE] != 0.0);
        let throttle = if brake || flags & BLOCK_ACCELERATION != 0 { 0.0 }
            else if burn { 1.0 } else { row[THROTTLE].clamp(-1.0, 1.0) };
        let strafe = if brake || burn || flags & BLOCK_STRAFING != 0 { 0.0 }
            else { row[STRAFE].clamp(-1.0, 1.0) };
        let mut accelerating = false;
        let mut spreading = false;
        let mut commanded = false;
        if brake {
            let speed = length(vx, vy);
            if speed > 0.0 {
                let amount = deceleration * dt;
                let scale = (speed - amount).max(0.0) / speed;
                vx *= scale; vy *= scale;
                let remaining = length(vx, vy);
                let scale = overspeed_scale(vx, vy, max_speed, acceleration * 2.0 * dt);
                vx *= scale; vy *= scale;
                if remaining <= 1.0 || remaining < amount { vx = 0.0; vy = 0.0; }
            }
            spreading = true; commanded = true;
        } else {
            if strafe.abs() > 0.01 {
                let amount = dt * strafe.abs();
                let angle = facing + sign(strafe) * std::f64::consts::PI / 2.0;
                let thrust = amount * acceleration * row[STRAFE_MULTIPLIER];
                vx += crate::canonical_math::cos(angle) * thrust; vy += angle.sin() * thrust;
                let scale = overspeed_scale(vx, vy, max_speed, acceleration * 2.0 * amount);
                vx *= scale; vy *= scale;
                spreading = true; commanded = true;
            }
            if throttle.abs() > 0.01 {
                let amount = dt * throttle.abs();
                let thrust = amount * if throttle < 0.0 { -deceleration } else { acceleration };
                vx += facing.cos() * thrust; vy += facing.sin() * thrust;
                let scale = overspeed_scale(vx, vy, max_speed, acceleration.max(deceleration) * 2.0 * amount);
                vx *= scale; vy *= scale;
                accelerating = throttle > 0.0;
                spreading |= throttle < 0.0; commanded = true;
            }
        }
        if !commanded && flags & FIGHTER == 0 && length(vx, vy) > max_speed {
            let scale = overspeed_scale(vx, vy, max_speed, acceleration * 2.0 * dt);
            vx *= scale; vy *= scale; spreading = true;
        }
        row[ACCELERATING] = u8::from(accelerating) as f64;
        row[SPREADING] = u8::from(spreading) as f64;
    }
    row[VX] = vx; row[VY] = vy;
    row[X] += vx * dt; row[Y] += vy * dt;
    row[ANGULAR] = spin;
    row[FACING] = facing + spin * dt;
}

pub fn valid(row: &[f64; WIDTH]) -> bool {
    row.iter().all(|n| n.is_finite())
        && row[FLAGS] >= 0.0 && row[FLAGS] <= 255.0 && row[FLAGS].fract() == 0.0
        && [ACCELERATION, DECELERATION, MAX_SPEED, TURN_ACCELERATION, MAX_TURN, STRAFE_MULTIPLIER]
            .iter().all(|&field| row[field] >= 0.0)
        && (row[BRAKE] == 0.0 || row[BRAKE] == 1.0)
}
