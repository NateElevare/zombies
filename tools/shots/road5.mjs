export default async function (page, shot) {
  await page.evaluate(() => window.deadzone.scene.api.newRoad('survivor'));
  await page.waitForTimeout(1200);
  const before = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('deadzone')));
  console.log('keys before', before);
  await page.keyboard.press('F9');
  await page.waitForTimeout(400);
  await shot('60-devtools');
  await page.click('text=Reset progress');
  await page.waitForTimeout(200);
  await shot('61-devtools-armed');
  await page.click('text=CONFIRM: delete all saves');
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => ({ keys: Object.keys(localStorage).filter(k => k.startsWith('deadzone')), onTitle: !window.deadzone.scene.state, continueBtn: !!document.querySelector('.titlescreen') && [...document.querySelectorAll('button')].some(b => b.textContent === 'CONTINUE') }));
  console.log('after', JSON.stringify(after));
  await shot('62-after-reset');
}
