"""Offline material direction for the ark; geometry/UV/rig/anchors stay unchanged.
Source of style: installed Starsector paragon.png and pegasus/executor.png.
No noise textures, invented greebles, bloom, or runtime procedural FX.
"""
import bpy
from mathutils import Vector

def configure(scene):
    scene.use_nodes=False
    scene.view_settings.view_transform='AgX'
    scene.view_settings.look='AgX - Medium High Contrast'
    scene.view_settings.exposure=.55
    scene.view_settings.gamma=1
    bg=scene.world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value=(.70,.78,.90,1)
    bg.inputs['Strength'].default_value=.16
    lights={
        'Key':((3,-4,5),2.6,(1,.97,.92)),
        'Fill':((-4,0,4),.45,(.72,.83,1)),
        'Lower fill':((1,-2,-5),.08,(.85,.9,1)),
        'Rim':((1,4,3),.25,(.80,.9,1)),
    }
    for name,(xyz,power,color) in lights.items():
        o=bpy.data.objects[name];o.location=Vector(xyz)*8.5
        o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
        o.data.energy=power;o.data.color=color;o.data.angle=.12
    for m in bpy.data.materials:
        if not m.use_nodes:continue
        nodes,links=m.node_tree.nodes,m.node_tree.links
        bs=next((n for n in nodes if n.type=='BSDF_PRINCIPLED'),None)
        if bs is None:continue
        hsv=next((n for n in nodes if n.label=='Armor palette: source-preserving'),None)
        if hsv:
            hsv.inputs['Saturation'].default_value=.56
            hsv.inputs['Value'].default_value=1.8
        # Stronger local contact, not a thick black silhouette around the whole ship.
        ao=next((n for n in nodes if n.type=='AMBIENT_OCCLUSION'),None)
        if ao:
            ao.inputs['Distance'].default_value=.085;ao.samples=16
            for l in list(ao.outputs['AO'].links):
                if l.to_node.type=='MIX_RGB':l.to_node.inputs[0].default_value=.62
        bs.inputs['Roughness'].default_value=.53
        bs.inputs['Specular IOR Level'].default_value=.32
        if bs.inputs['Metallic'].is_linked:
            n=bs.inputs['Metallic'].links[0].from_node
            if n.type=='MATH':n.inputs[1].default_value=.16
        # A mild source-texture relief reads existing panel seams; no fabricated noise.
        tex=next((n for n in nodes if n.type=='TEX_IMAGE' and n.image and 'baseColor' in n.image.name),None)
        bevel=next((n for n in nodes if n.type=='BEVEL'),None)
        if bevel:bevel.inputs['Radius'].default_value=.005;bevel.samples=4
        if tex:
            bump=nodes.new('ShaderNodeBump');bump.label='Existing panel texture relief only'
            bump.inputs['Strength'].default_value=.19;bump.inputs['Distance'].default_value=.005
            links.new(tex.outputs['Color'],bump.inputs['Height'])
            if bevel:links.new(bevel.outputs['Normal'],bump.inputs['Normal'])
            links.new(bump.outputs['Normal'],bs.inputs['Normal'])
        # Keep the source blue emitters small and saturated rather than washing armor.
        bs.inputs['Emission Strength'].default_value*=.8
    scene.render.engine='CYCLES';scene.cycles.samples=192
    scene.cycles.use_denoising=True;scene.cycles.denoising_prefilter='ACCURATE';scene.cycles.denoiser='OPTIX';scene.cycles.seed=37;scene.cycles.use_animated_seed=False
    scene.cycles.pixel_filter_type='BLACKMAN_HARRIS';scene.cycles.filter_width=.85
    prefs=bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type='OPTIX';prefs.get_devices()
    for d in prefs.devices:d.use=d.type=='OPTIX'
    scene.cycles.device='GPU' if any(d.use for d in prefs.devices) else 'CPU'
    scene.render.resolution_x=1024;scene.render.resolution_y=2048
    scene.render.resolution_percentage=100;scene.render.film_transparent=True
    scene.render.use_border=False;scene.render.use_crop_to_border=False
    scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
    scene.render.image_settings.color_depth='8'
