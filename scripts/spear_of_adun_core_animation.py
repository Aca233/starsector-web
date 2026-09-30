"""Keep the downloaded model's longitudinal core rotation separate from gun motion.

Only the half-second loop closure is authored here; source keyframe values and
source timing are retained. This is Blender-only offline asset preparation.
"""
import bpy

CORE_BONES = ('Ctrl_Core_Outter_1', 'Ctrl_Core_Inner_2')
SOURCE_FPS = 24
SOURCE_DURATION = 49.5
LOOP_DURATION = 50.0


def channelbags(action):
    return [bag for layer in action.layers for strip in layer.strips
            for bag in strip.channelbags]


def is_core_curve(curve):
    return any(curve.data_path == f'pose.bones["{name}"].rotation_quaternion'
               for name in CORE_BONES)


def freeze_core_for_isolated_export(rig):
    """Freeze only core channels, never the entire rig or the master file."""
    scene = bpy.context.scene
    scene.frame_set(0)
    bases = {name: rig.pose.bones[name].matrix_basis.copy() for name in CORE_BONES}
    for bag in channelbags(rig.animation_data.action):
        for curve in list(bag.fcurves):
            if is_core_curve(curve):
                bag.fcurves.remove(curve)
    for name, basis in bases.items():
        rig.pose.bones[name].matrix_basis = basis
    bpy.context.view_layer.update()


def restore_core_animation(rig, source_blend):
    scene = bpy.context.scene
    target = rig.animation_data.action
    assert target is not None, 'Keep existing fore animation; require its action'
    with bpy.data.libraries.load(str(source_blend), link=False) as (available, loaded):
        assert '[Action Stash]' in available.actions
        loaded.actions = ['[Action Stash]']
    source = loaded.actions[0]
    source_curves = [c for bag in channelbags(source) for c in bag.fcurves if is_core_curve(c)]
    assert len(source_curves) == 8
    bags = channelbags(target)
    assert len(bags) == 1, 'Do not guess multi-slot rig ownership'
    bag = bags[0]
    for curve in list(bag.fcurves):
        if is_core_curve(curve):
            bag.fcurves.remove(curve)
    fps = scene.render.fps / scene.render.fps_base
    scale = fps / SOURCE_FPS
    records = []
    for old in source_curves:
        curve = bag.fcurves.new(old.data_path, index=old.array_index)
        points = old.keyframe_points
        assert abs(points[-1].co.x / SOURCE_FPS - SOURCE_DURATION) < 1e-4
        # Quaternion signs are physically equivalent. Continue the last sign
        # rather than interpolating through a zero quaternion at the seam.
        is_outer = CORE_BONES[0] in old.data_path
        end_value = points[0].co.y * (-1 if is_outer else 1)
        curve.keyframe_points.add(len(points) + 1)
        for key, original in zip(curve.keyframe_points, points):
            key.co = (original.co.x * scale, original.co.y)
            key.interpolation = 'LINEAR'
        curve.keyframe_points[-1].co = (LOOP_DURATION * fps, end_value)
        curve.keyframe_points[-1].interpolation = 'LINEAR'
        curve.update()
        curve.modifiers.new('CYCLES')
        records.append({'path': old.data_path, 'component': old.array_index,
                        'sourceKeys': len(points), 'copiedKeys': len(points),
                        'loopClosureKeysAdded': 1})
    for name in CORE_BONES:
        rig.pose.bones[name].rotation_mode = 'QUATERNION'
    bpy.data.actions.remove(source)
    rig['core_animation_provenance'] = 'Downloaded model source channels; 0.5s loop closure added'
    scene.frame_set(0)
    bpy.context.view_layer.update()
    return {'sourceFPS': SOURCE_FPS, 'targetFPS': fps,
            'sourceDurationSeconds': SOURCE_DURATION, 'loopDurationSeconds': LOOP_DURATION,
            'loopClosureSeconds': LOOP_DURATION - SOURCE_DURATION,
            'copiedSourceKeyValuesUnchanged': True, 'curves': records}
