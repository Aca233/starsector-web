/** Authoring gate only: refuses moving-ring mounts and stale/forged surface claims.
 * Does not register a ship or pretend geometry probes prove weapon-art clearance.
 */
export function validateAdunInstallationPlan(plan, evidence, regions) {
  const require = (condition, message) => { if (!condition) throw new Error(message); };
  require(plan?.schemaVersion === 1 && evidence?.schemaVersion === 1 && regions?.schemaVersion === 1, '安装档案版本不支持');
  require(plan.stage === 'AUTHORING_LAYOUT_NOT_RUNTIME' && evidence.runtimeRegistered === false, '此安装档案仅供制作，不能冒充运行舰体');
  require(plan.ownershipPolicy?.ROTATING_CORE === 'NO_WEAPON_MOUNTS', '旋转环必须禁设武器挂点');
  require(plan.ownershipPolicy?.FIXED_HULL === 'OPEN_SAME_SIZE', '固定结构必须保留同档换装');
  require(plan.ownershipPolicy?.FORE_MECHANISM === 'DEDICATED_BUILT_IN', '前部原生机构必须独立绑定');
  require(plan.runtimePivot === null && plan.runtimeWeaponBindings === null, '尚未核实的运行枢轴/专武绑定不得填写占位');
  require(Array.isArray(plan.sites) && plan.sites.length > 0 && Array.isArray(evidence.sites), '缺少安装候选位或几何证据');
  require(evidence.corePhaseCount >= 72 && evidence.foreStates?.includes('closed') && evidence.foreStates?.includes('open'), '缺少完整环周期与前部开合的采样检查');
  const source = new Map(regions.objects.map(row => [row.object, row]));
  const checked = new Map(evidence.sites.map(row => [row.id, row]));
  require(checked.size === evidence.sites.length && checked.size === plan.sites.length, '候选位与检查结果不一一对应');
  const ids = new Set(), counts = { SMALL: 0, MEDIUM: 0, LARGE: 0, EXTRA_LARGE: 0 };
  for (const site of plan.sites) {
    require(typeof site.id === 'string' && site.id.length > 0 && !ids.has(site.id), '候选位ID无效或重复'); ids.add(site.id);
    require(site.owner === 'FIXED_HULL', `${site.id}: 通用炮座不能属于旋转环或开合机构`);
    require(site.binding === 'OPEN_SAME_SIZE' && Object.hasOwn(counts, site.size), `${site.id}: 换装类型/档位无效`);
    const anchor = site.imageAnchorPx;
    require(Array.isArray(anchor) && anchor.length === 2 && anchor.every((v, i) => Number.isFinite(v) && v >= 0 && v < plan.sourceImageSize[i]), `${site.id}: 图像坐标无效`);
    require(Number.isFinite(site.bearingRadiusPx) && site.bearingRadiusPx > 0, `${site.id}: 安装占地无效`);
    const result = checked.get(site.id);
    require(result && result.size === site.size && result.bearingRadiusPx === site.bearingRadiusPx && JSON.stringify(result.imageAnchorPx) === JSON.stringify(anchor), `${site.id}: 挂点已变化，几何检查过期`);
    const surface = result.sourceSurface && source.get(result.sourceSurface.object);
    require(surface?.category === 'FIXED_HULL', `${site.id}: 支撑面不是固定舰体`);
    const chains = Object.values(surface.parentChains ?? {});
    require(chains.length > 0 && chains.every(chain => !chain.some(name => regions.movingRoots.includes(name) || name === 'Ctrl_Gun_Master_15')), `${site.id}: 骨骼祖先属于活动机构`);
    require(result.sampledSupportPassed === true && result.minimumFixedCoverage === 1 && result.maxAnchorDriftModelUnits < 1e-5 && result.firstFailure === null, `${site.id}: 固定支撑/遮挡检查未通过`);
    require(result.testedPoses === evidence.corePhaseCount * evidence.foreStates.length && result.footprintProbeCount >= 33, `${site.id}: 采样证据不完整`);
    require(Array.isArray(result.restWorldAnchor) && result.restWorldAnchor.length === 3 && result.restWorldAnchor.every(Number.isFinite), `${site.id}: 缺少真实模型坐标`);
    counts[site.size]++;
  }
  require(Array.isArray(plan.dedicatedMechanisms) && plan.dedicatedMechanisms.length === 1, '原生机构数量须单独核实');
  const fore = plan.dedicatedMechanisms[0];
  require(fore.owner === 'FORE_MECHANISM' && fore.binding === 'BUILT_IN_UNIQUE_WEAPON' && fore.control === 'Ctrl_Gun_Master_15' && fore.mountCount === 1, '前部整体为一套专用机构，不是12个通用炮位');
  require(fore.sourceControlSegmentCount === 12 && fore.weaponId === null && fore.muzzleEstablished === false, '未完成的专武不得绑定占位ID或虚构炮口');
  return { counts, totalOpenCandidates: plan.sites.length, dedicatedMechanisms: 1, rotatingRingMounts: 0, runtimeReady: false };
}
