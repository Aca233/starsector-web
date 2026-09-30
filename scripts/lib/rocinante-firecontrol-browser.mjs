import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
export async function checkRocinanteFireControlUI(page,out){
  const matrix='web_expanse_rocinante_interception_matrix',comp='web_expanse_rocinante_recoil_compensator',mag='web_expanse_rocinante_pdc_magazine';
  const row=()=>page.locator(`.refit-mod-row.builtin[data-inspect-mod="${matrix}"]`);
  assert.equal(await row().count(),1);assert(await row().isVisible());assert.equal(await row().locator('button').count(),0);
  assert.equal(await row().locator('b').innerText(),'内置');
  await row().hover();const tooltip=page.locator('[data-equipment-tooltip]').filter({hasText:'六门专属PDC射程550→700'});
  await tooltip.waitFor({state:'visible'});assert((await tooltip.innerText()).includes('210→315'));
  await page.locator('#refit-hull-search').hover();await tooltip.waitFor({state:'hidden'});
  await page.getByRole('button',{name:/安装舰船插件/}).click();
  const choice=id=>page.locator(`button.source-mod-select[data-inspect-mod="${id}"]`);
  await choice(comp).waitFor({state:'visible'});
  const foreign=choice('web_sc2_hyperion_yamato_focus');
  assert.equal(await foreign.getAttribute('aria-disabled'),'true');
  assert.equal(await foreign.locator('xpath=ancestor::*[@role="row"]').locator('.source-mod-cost').innerText(),'—');
  for(const id of [comp,mag]){assert.equal(await choice(id).count(),1);assert.equal(await choice(id).getAttribute('aria-disabled'),'false');}
  assert.equal(await choice(matrix).count(),0);
  await choice(comp).click();assert.equal(await choice(comp).getAttribute('aria-pressed'),'true');assert.equal(await choice(mag).getAttribute('aria-disabled'),'true');
  await choice(comp).click();await choice(mag).click();assert.equal(await choice(mag).getAttribute('aria-pressed'),'true');assert.equal(await choice(comp).getAttribute('aria-disabled'),'true');
  await page.keyboard.press('Escape');await page.locator('.source-mod-picker').waitFor({state:'hidden'});
  assert.equal(await row().count(),1);
  assert.equal(await page.locator(`.refit-mod-row:not(.builtin)[data-inspect-mod="${mag}"]`).count(),1);
  // StudioApp caches edits after a 450ms debounce; reload only once the
  // production storage path contains the selected plugin, not just its UI row.
  const storageKey=await page.evaluate(async()=>(await import('/src/studio/DesignModel.ts')).storageKey);
  await page.waitForFunction(({key,id})=>JSON.parse(localStorage.getItem(key)??'null')?.draft?.hullMods?.includes(id),{key:storageKey,id:mag});
  await page.reload();await row().waitFor();
  assert.equal(await page.locator(`.refit-mod-row:not(.builtin)[data-inspect-mod="${mag}"]`).count(),1);
  const report=await page.evaluate(async()=>{
    const {readLibrary,evaluate}=await import('/src/studio/DesignModel.ts');
    const {shipSystemDefinitions}=await import('/src/engine/extensions/ship-systems/Registry.ts');
    const r=readLibrary(),fit=evaluate(r.library.draft),system=shipSystemDefinitions.get('WEB_ROCINANTE_FIRE_CONTROL');
    return {protected:r.protected,mods:fit.spec.builtInHullMods,selected:r.library.draft.hullMods,op:fit.op,description:system.description,errors:fit.errors};
  });
  assert.equal(report.protected,false);assert.deepEqual(report.errors,[]);assert.equal(report.op.modOP,10);
  assert(report.description.includes('4.5→3秒')&&report.description.includes('耗散减半'));
  await writeFile(out+'/fire-control-ui.json',JSON.stringify(report,null,2));
  console.log('PASS default innate plugin visible, both exclusive options installable, reload preserved, 10OP charged and pressure description updated');
}
