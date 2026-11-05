for lv in 0 1 2; do
  T=$([ $lv = 2 ] && echo 2 || echo $lv)
  J="(() => { const s = window.__rcSim(); const g = s.trGeom(); setTimeout(() => Render.lookAt(s, g.hinge.x + (g.Lb + 3000 / s.mmpx) / 2 + 1500/s.mmpx, g.rampY - 2200 / s.mmpx, 0.55 * s.mmpx / (g.Lb * s.mmpx / 1000 + 6)), 10); })()"
  NOALL=1 node test/shot.js truck$lv $T "{\"up\":{\"loader\":$lv}}" 1.4 "$J"
done
