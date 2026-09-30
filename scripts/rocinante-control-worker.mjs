self.__LAN_BUILD_ID__ = 'rocinante-control-check';
self.onmessage = async ({data}) => {
  try {
    if (data === 'complete') {const {runRocinanteCompleteScenarios}=await import('./rocinante-complete-scenarios.mjs');self.postMessage({result:await runRocinanteCompleteScenarios()});return;}
    if (data === 'armory') {
      const {runRocinanteArmoryScenarios} = await import('./rocinante-armory-scenarios.mjs');
      self.postMessage({result: await runRocinanteArmoryScenarios()});return;
    }
    const {runRocinanteControlScenarios} = await import('./rocinante-control-scenarios.mjs');
    self.postMessage({result: await runRocinanteControlScenarios()});
  } catch (error) { self.postMessage({error: error.stack ?? String(error)}); }
};
