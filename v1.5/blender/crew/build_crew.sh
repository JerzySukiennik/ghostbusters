#!/bin/bash
# Full crew rebuild: Jurek source dump, bodies + uniform refit, heads, hair, glasses, skin (numpy), assembly + GLB export, crew.json, renders. Blender runs go through the team lock.
set -e
cd "$(dirname "$0")"
ROOT=$(cd ../.. && pwd)
BL="lockf -t 3600 $ROOT/Niepotrzebne/locks/blender.lock nice -n 10 /Applications/Blender.app/Contents/MacOS/Blender -b -t 2"
PY="nice -n 10 python3"
OUT=$ROOT/Niepotrzebne/work/crew
step() { echo "== $1"; }
if [ "$1" != "skipextract" ]; then
  step extract; $BL $ROOT/blender/avatar/src/rt_anim.blend -P extract.py -- rt | grep -E 'EXTRACT|Error'; $BL $ROOT/blender/avatar/work/jurek_gb_work.blend -P extract.py -- gb | grep -E 'EXTRACT|Error'
fi
step bodies; $PY bodyfit.py
step heads; $PY headfit.py
step hair; $PY hairgen.py; $PY glasses.py
step skin; $PY skintex.py
for c in crew_1 crew_2 crew_3; do
  step "assemble $c"; $BL --factory-startup -P assemble.py -- $c $ROOT/assets/avatar/$c.glb $ROOT/blender/crew/work/$c.blend | grep -E 'ASSEMBLED|PATCH|Error'
done
step meta; $PY meta.py
step carriers; $PY carrierfix.py
if [ "$2" != "norender" ]; then
  step "eevee portraits"; $BL --factory-startup -P render.py -- portrait $OUT/eevee_portraits jurek,crew_1,crew_2,crew_3 | grep -E 'RENDER|Error'
  step "lobby portraits (three.js, game loader)"; PORT=${PORT:-1984}
  for c in jurek crew_1 crew_2 crew_3; do lockf -t 3600 $ROOT/Niepotrzebne/locks/chrome.lock nice -n 10 node $ROOT/Niepotrzebne/tools/shot.mjs --url="http://127.0.0.1:$PORT/Niepotrzebne/work/crew/portrait.html?c=$c" --out=$ROOT/assets/avatar/portrait_$c.jpg --w=512 --h=640 --ready='window.__ready===true' --wait=300 | grep -E 'pageerror|shot error'; done
  for c in crew_1 crew_2 crew_3; do step "turntable $c"; $BL --factory-startup -P render.py -- turntable $OUT/tt $c | grep -E 'RENDER|Error'; done
  step lineup; $BL --factory-startup -P render.py -- lineup $OUT jurek,crew_1,crew_2,crew_3 | grep -E 'RENDER|Error'
  $PY sheets.py
fi
echo ALL DONE
