// Plays the first mission "for real": WASD toward the objective, mouse aim + fire at the nearest zombie.
export default async function (page, shot) {
  await page.evaluate(() => window.deadzone.scene.api.newRoad('responder'));
  await page.waitForTimeout(1500);
  await page.evaluate(() => { window.deadzone.scene.state.ui = null; });
  await page.waitForTimeout(300);
  const held = new Set();
  const setKeys = async (want) => {
    for (const k of held) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); }
    for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
  };
  const t0 = Date.now();
  let shots = 0, lastShot = 0, lastObj = -1;
  while (Date.now() - t0 < 170000) {
    const info = await page.evaluate(() => {
      const sc = window.deadzone.scene, s = sc.state; if (!s || !s.road) return null;
      const r = s.road, run = r.objectives[r.step], p = s.player;
      const cam = sc.cameras.main;
      const toScreen = (x, y) => ({ x: (x - cam.worldView.x) * cam.zoom, y: (y - cam.worldView.y) * cam.zoom });
      let nz = null, nd = 1e9;
      for (const z of s.zombies) { if (z.dead) continue; const d = Math.hypot(z.x - p.x, z.y - p.y); if (d < nd) { nd = d; nz = z; } }
      // steer with the game's own flow field (the player is further than ~900px from the goal only on long legs)
      let hx = run ? run.point.x - p.x : 0, hy = run ? run.point.y - p.y : 0;
      if (run) { const f = window.deadzone.sim.pathing.field(s, 'bot', run.point.x, run.point.y); const st = f && window.deadzone.sim.pathing.step(f, p.x, p.y); if (st) { hx = st.x * 100; hy = st.y * 100; } }
      return { px: p.x, py: p.y, hx, hy, hp: p.hp, dead: p.dead, screen: s.screen, phase: r.phase, step: r.step, tx: run?.point.x, ty: run?.point.y, kind: run ? window.deadzone.sim.roadData.MISSIONS[r.mission].objectives[r.step].kind : null, xp: p.xp, level: p.level,
        zombie: nz ? { ...toScreen(nz.x, nz.y), d: nd } : null, zombies: s.zombies.filter(z => !z.dead).length, ammo: p.inv.equip[p.active]?.mag, weapon: p.active, ui: s.ui, target: run ? toScreen(run.point.x, run.point.y) : null };
    });
    if (!info) break;
    if (info.phase === 'complete') { await setKeys(new Set()); console.log('MISSION COMPLETE at', Math.round((Date.now() - t0) / 1000), 's, shots', shots); await page.waitForTimeout(500); await shot('play-complete'); break; }
    if (info.screen === 'dead') { await setKeys(new Set()); console.log('DIED at step', info.step); await shot('play-dead'); await page.evaluate(() => window.deadzone.sim.road.restart(window.deadzone.scene.state)); await page.waitForTimeout(500); continue; }
    if (info.step !== lastObj) { lastObj = info.step; console.log('objective', info.step, info.kind, 'at', Math.round((Date.now() - t0) / 1000), 's; zombies', info.zombies, 'xp', info.xp, 'lvl', info.level, 'hp', Math.round(info.hp)); await shot('play-obj' + info.step); }
    // movement: toward the objective unless a zombie is within 90px (then back off a little while shooting)
    const want = new Set();
    const dx = info.tx - info.px, dy = info.ty - info.py, dist = Math.hypot(dx, dy);
    const flee = info.zombie && info.zombie.d < 70;
    const mx = flee ? -(info.zombie.x - 800) : info.hx, my = flee ? -(info.zombie.y - 450) : info.hy;
    const stopDist = info.kind === 'holdout' ? 40 : info.kind === 'clear' ? 150 : 10;
    if (dist > stopDist || flee) {
      if (Math.abs(mx) > 8) want.add(mx > 0 ? 'KeyD' : 'KeyA');
      if (Math.abs(my) > 8) want.add(my > 0 ? 'KeyS' : 'KeyW');
    }
    if (info.kind === 'interact' && dist < 60) want.add('KeyE');
    await setKeys(want);
    // aim + fire
    if (info.zombie && info.zombie.d < 420) {
      await page.mouse.move(info.zombie.x, info.zombie.y);
      if (Date.now() - lastShot > 160) { await page.mouse.down(); await page.waitForTimeout(40); await page.mouse.up(); lastShot = Date.now(); shots++; }
      if (info.ammo === 0) await page.keyboard.press('KeyR');
    } else if (info.target) await page.mouse.move(Math.max(10, Math.min(1590, info.target.x)), Math.max(10, Math.min(890, info.target.y)));
    await page.waitForTimeout(90);
  }
  await setKeys(new Set());
  const end = await page.evaluate(() => { const s = window.deadzone.scene.state; return s && { step: s.road.step, phase: s.road.phase, hp: s.player.hp, kills: s.road.missionKills, zombies: s.zombies.length }; });
  console.log('end state', JSON.stringify(end));
}
