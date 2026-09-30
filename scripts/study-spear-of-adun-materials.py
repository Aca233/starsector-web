"""A non-destructive Blender material study, not final art or runtime integration."""
import json
from pathlib import Path
import bpy
from mathutils import Vector

root = Path.cwd()
source = root / 'output/spear-of-adun-model/orthographic-v01/spear-of-adun-model-study.blend'
reference = json.loads((root / 'output/spear-of-adun-sprite/v01/sprite-metadata.json').read_text())
out = root / 'output/spear-of-adun-art/material-study-v02'
out.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(source), load_ui=False, use_scripts=False)
scene = bpy.context.scene
scene.frame_set(0)
scene.camera = bpy.data.objects['axis-plus-z']
scene.camera.data.ortho_scale = reference['cameraOrthoScale']
scene.render.resolution_x = 512
scene.render.resolution_y = 1024
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.engine = 'CYCLES'
scene.cycles.samples = 192
scene.cycles.use_denoising = True
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'OPTIX'
prefs.get_devices()
for d in prefs.devices:
    d.use = d.type == 'OPTIX'
scene.cycles.device = 'GPU' if any(d.use for d in prefs.devices) else 'CPU'
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.view_settings.exposure = .5
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.8, .85, .9, 1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .25
light_specs = {
    'Key': ((3, -4, 6), 2.8, (1, .97, .92)),
    'Fill': ((-4, 0, 4), .35, (.75, .85, 1)),
    'Lower fill': ((1, -2, -5), .15, (1, .96, .88)),
    'Rim': ((1, 4, 3), .25, (.8, .91, 1)),
}
for name, (position, strength, color) in light_specs.items():
    light = bpy.data.objects[name]
    light.location = Vector(position) * 8.5
    light.rotation_euler = (-light.location).to_track_quat('-Z', 'Y').to_euler()
    light.data.energy = strength
    light.data.color = color
    light.data.angle = .18

changes = []
for mat in bpy.data.materials:
    if not mat.use_nodes:
        continue
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None or not bsdf.inputs['Base Color'].is_linked:
        continue
    base = bsdf.inputs['Base Color'].links[0].from_socket
    split = nodes.new('ShaderNodeSeparateColor'); split.mode = 'RGB'
    links.new(base, split.inputs['Color'])
    def math_node(op, a, b):
        n = nodes.new('ShaderNodeMath'); n.operation = op
        for i, value in enumerate([a,b]):
            if isinstance(value, (float,int)): n.inputs[i].default_value = value
            else: links.new(value,n.inputs[i])
        return n
    # Gold-region selection from source albedo, not invented texture noise or painted details.
    avg = math_node('MULTIPLY',math_node('ADD',split.outputs['Red'],split.outputs['Green']).outputs[0],.5)
    mask = math_node('MULTIPLY',math_node('SUBTRACT',avg.outputs[0],split.outputs['Blue']).outputs[0],6)
    mask.use_clamp = True
    hsv = nodes.new('ShaderNodeHueSaturation'); hsv.label = 'Armor palette: source-preserving'
    hsv.inputs['Saturation'].default_value = .86
    hsv.inputs['Value'].default_value = 1.03
    links.new(base,hsv.inputs['Color'])
    mix = nodes.new('ShaderNodeMixRGB'); mix.blend_type = 'MIX'
    links.new(mask.outputs[0],mix.inputs[0]); links.new(base,mix.inputs[1]); links.new(hsv.outputs[0],mix.inputs[2])
    ao = nodes.new('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = .12; ao.samples = 16
    contact = nodes.new('ShaderNodeMixRGB'); contact.blend_type = 'MULTIPLY'; contact.inputs[0].default_value = .28
    links.new(mix.outputs[0],contact.inputs[1]); links.new(ao.outputs['AO'],contact.inputs[2])
    links.new(contact.outputs[0],bsdf.inputs['Base Color'])
    metallic = math_node('MULTIPLY',mask.outputs[0],.35)
    links.new(metallic.outputs[0],bsdf.inputs['Metallic'])
    bsdf.inputs['Roughness'].default_value = .60
    emission = bsdf.inputs.get('Emission Color')
    old_strength = float(bsdf.inputs['Emission Strength'].default_value)
    if emission and emission.is_linked:
        emitter = emission.links[0].from_socket
        hue = nodes.new('ShaderNodeHueSaturation'); hue.label = 'Energy palette: source-preserving'
        hue.inputs['Hue'].default_value = .475
        hue.inputs['Saturation'].default_value = .88
        links.new(emitter,hue.inputs['Color']); links.new(hue.outputs[0],emission)
        bsdf.inputs['Emission Strength'].default_value = old_strength * .70
    changes.append({'material':mat.name,'goldSaturation':.86,'goldValue':1.03,'goldMetallicMax':.35,
                    'roughness':.60,'contactAO':.28,'originalEmissionStrength':old_strength,
                    'emissionStrength':float(bsdf.inputs['Emission Strength'].default_value)})

layer = bpy.context.view_layer
for name in ['use_pass_emit','use_pass_normal','use_pass_diffuse_color','use_pass_z','use_pass_ambient_occlusion']:
    if hasattr(layer,name): setattr(layer,name,True)
# One multilayer EXR retains linear passes; PNG below is the same combined result with display transform.
scene.render.image_settings.file_format = 'OPEN_EXR_MULTILAYER'
scene.render.image_settings.color_depth = '16'
scene.render.image_settings.exr_codec = 'ZIP'
scene.render.filepath = str(out/'material-layers.exr')
bpy.ops.render.render(write_still=True)
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.color_depth = '8'
scene.render.image_settings.compression = 100
scene.render.filepath = str(out/'hull-material-study.png')
bpy.data.images['Render Result'].save_render(scene.render.filepath, scene=scene)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'material-study.blend'))
report = {'status':'P5/P6 material study; not art-approved or game-integrated',
          'sourceBlend':str(source),'geometryModified':False,'cameraMatchesStructureSprite':True,
          'resolution':[512,1024],'aiUsed':False,'gameAssetsChanged':False,
          'sourceTexturesModified':False,'materialChanges':changes,'lightDirection':'screen upper-left',
          'enabledPasses':[name for name in ['use_pass_emit','use_pass_normal','use_pass_diffuse_color','use_pass_z','use_pass_ambient_occlusion'] if hasattr(layer,name) and getattr(layer,name)],
          'notDone':['hand-authored texture detail refinement','weapon/seat/occluder separation','runtime size approval','game integration']}
(out/'study-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print('MATERIAL_STUDY_COMPLETE',out)
