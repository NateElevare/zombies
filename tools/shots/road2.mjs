// Later missions: jump to each and look at the key locations.
export default async function (page, shot) {
  await page.evaluate(() => window.deadzone.scene.api.newRoad('scout'));
  await page.waitForTimeout(1500);
  const look = async (m, step, name, dx = 0, dy = 80, wait = 2200) => {
    await page.evaluate(([m, step, dx, dy]) => {
      const road = window.deadzone.sim.road, s = window.deadzone.scene.state;
      if (s.screen === 'dead') road.restart(s);
      if (s.road.mission !== m || s.road.phase !== 'play') { road.startMission(s, m); s.ui = null; road.begin(s); }
      s.dev = { timeScale: 1, freeze: false, god: true };
      while (s.road.step < step) road.devSkip(s);
      const pt = s.road.objectives[step].point;
      s.player.x = s.player.prevX = pt.x + dx; s.player.y = s.player.prevY = pt.y + dy;
      s.player.flashlight = true;
    }, [m, step, dx, dy]);
    // the headless GPU is slow: wait until the camera has caught up with the player and the ground is built
    await page.waitForFunction(() => { const sc = window.deadzone.scene, s = sc.state, c = sc.cameras.main; if (!s) return false; const cx = c.worldView.x + c.worldView.width / 2, cy = c.worldView.y + c.worldView.height / 2; return Math.hypot(cx - s.player.x, cy - s.player.y) < 60; }, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(wait);
    await shot(name);
  };
  await look(1, 0, '20-pharmacy');
  await look(2, 1, '21-overpass', 0, 300);
  await look(2, 2, '22-howler', 0, 200, 4000);
  await look(3, 0, '23-precinct');
  await look(4, 1, '24-hospital-wards', 0, 0);
  await look(5, 2, '25-butcher', 0, 150, 4000);
  await look(6, 0, '26-dark-mile', 0, 200);
  await look(7, 3, '27-broodmother', 0, 250, 4000);
  await look(8, 1, '28-fort', 0, 0);
  await look(9, 1, '29-relay-holdout', 0, 60, 7000);
  // the quarantine gate close-up and the camp between S1 and S2
  await page.evaluate(() => {
    const road = window.deadzone.sim.road, s = window.deadzone.scene.state;
    road.startMission(s, 1); s.ui = null; road.begin(s);
    const c = road.campOf(s, 0); s.player.x = s.player.prevX = c.x + 100; s.player.y = s.player.prevY = c.y + 120;
    s.player.flashlight = false;
  });
  await page.waitForTimeout(2200);
  await shot('30-open-gate-camp');
}
