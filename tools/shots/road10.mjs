export default async function (page, shot) {
  await page.evaluate(() => window.deadzone.scene.api.newRoad('survivor'));
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const s = window.deadzone.scene.state; s.ui = null; window.deadzone.sim.road.begin(s); s.player.sp = 4; window.deadzone.sim.game.setUi(s, 'tech'); });
  await page.waitForTimeout(800);
  await page.click('text=Survival');
  await page.waitForTimeout(600);
  await shot('96-tech-survival-trimmed');
}
