import {runZhefengScenarios} from './zhefeng-scenarios.mjs';
self.onmessage=async()=>{try{self.postMessage({result:await runZhefengScenarios()});}catch(e){self.postMessage({error:e.stack??String(e)});}};
