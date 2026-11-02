# Crew lane: three extra Ghostbusters on Jurek's skeleton

`crew_1` Dez (1.91 m, lanky, glasses), `crew_2` Walt (1.70 m, stocky, full beard, bald crown), `crew_3` Mo (1.65 m, short coily hair).
Everything is hand-scripted: Jurek's own body and head (the frozen v1 head and the full-v1 body) are re-shaped by code. No MPFB, scans or downloaded people.

## Rebuild

```
blender/crew/build_crew.sh            # full: dump Jurek sources, bodies, heads, hair, skin, GLBs, crew.json, renders
blender/crew/build_crew.sh skipextract           # reuse cache/ dumps
blender/crew/build_crew.sh skipextract norender  # GLBs and crew.json only
```
Blender steps go through `Niepotrzebne/locks/blender.lock`. Re-run after the avatar lane changes `jurek_gb.glb`, its clips or its uniform: the garments, the clips and the skeleton check are read from their files every build.

## Shared skeleton (how the clips fit)

- Rig: the v1 `Jurek.Rig` from `blender/avatar/src/rt_anim.blend`, 92 joints. Joint names, hierarchy, order and rest rotations are identical to `jurek_gb.glb` (checked by `glbpatch.py` on every build).
- Size: one uniform factor per character (`rigScale` 1.100 / 0.975 / 0.945) is applied to the armature (`transform_apply`) and to every vertex before export. Joint offsets are exactly Jurek's times rigScale and the root node has scale 1, so a clip keyed for Jurek (rotations + Hips translation) reproduces the same pose on a bigger or smaller body.
- Build order: all shaping happens in Jurek-normalised space (his skeleton, x1.0), then the whole character is scaled once. Proportion differences (stocky torso, bust, belly, neck, hands, heads) are mesh-only.
- Clips: `glbpatch.embed_clips` copies the 7 clips from `jurek_gb.glb` into each crew GLB with the Hips and carrier translations multiplied by rigScale; constant bone translations and all scale tracks are dropped. The carriers `PackCarrier`, `WandCarrier`, `TrapCarrier` are added next to `Jurek.Rig`.
- Morph targets: the crew `Head` has the same 19 targets in the same order as Jurek's; the beard (crew_2) and brows carry them too.

## Pipeline

| Step | Script | What |
|---|---|---|
| source dump | `extract.py` (Blender) | Jurek rig, full body, head + 19 morphs, lashes, eyes; uniform game LOD meshes from `blender/avatar/work/jurek_gb_work.blend` |
| bodies + uniform | `bodyfit.py` | per-bone radial girth maps (torso width/front/back by height, limbs along the bone), bust/belly/glute bulges, neck shortening; garments follow with their cloth ease kept, smoothed, pushed 4 mm clear; tag and patch moved rigidly |
| heads | `headfit.py`, `faces.py` | 180 face landmarks moved to real-world targets (face height, nose, mouth, jaw, eyes, brows, skull, ears), thin-plate warp of head, teeth, lashes and all morphs; eyes re-seated; neck blended into the body map |
| hair | `hairgen.py`, `hairline.py` | polar caps ray-cast on each head: opaque hair volume plus alpha shells (vertex-alpha thresholds), beard with the head morphs, brow strips |
| glasses | `glasses.py` | acetate rims, bridge, hinges, temples resting over the ears, thin lenses |
| skin | `skintex.py` | procedural albedo / normal / ORM in Jurek's UV layout (tone, redness, mottling, pores, wrinkles, stubble, lips from the mouth rings, scalp under hair), hands and neck from the same colour function, irises |
| assembly | `assemble.py`, `materials.py` | body cut to neck and hands, head LOD by zones with morphs rebuilt, export with the avatar lane's settings, `glbpatch.py` checks and clips |
| meta | `meta.py` | `assets/avatar/crew.json` |
| carriers | `carrierfix.py` | re-aims the don_pack `PackCarrier` so it ends on each character's `packWorn` (0 mm pop at the end of the suit-up) |
| renders | `render.py`, `sheets.py`, `Niepotrzebne/work/crew/portrait.html` | lobby portraits 512x640 in three.js through the game's own `Avatar.load` (`PORT=1984` dev server), Eevee turntables and line-up |

Validation page: `Niepotrzebne/work/crew/check.html` (plays the clips on Jurek and the crew side by side; `?mode=shared` plays Jurek's own clip objects through the documented track filter).
In-game check: `Niepotrzebne/work/crew/ingame.html` loads all four through `src/game/avatar.js` (UAL locomotion, name tags, real pack via `wear()`), e.g. `?act=worn&pw=crew&view=side&axis=z`, `?act=don_pack`, `?act=walk`; `pw=avatar` shows what the game does today. `window.__carrierEnd()` and `window.__pen()` print the pack numbers.

## Pack on the back

The game takes `packWorn` from `avatar.json` for everyone. Crew backs sit at a different depth (scaled rig, stockier torsos), so `crew.json` has a per-character `packWorn` and `Niepotrzebne/work/crew/avatar_packworn.patch` (two lines in `src/game/avatar.js`, lead lane) makes the game use it. Without the patch the pack sinks 5-30 mm into the crew backs and pops by the same amount at the end of `don_pack`.
