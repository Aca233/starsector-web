import { Owner } from './Owner';
import type { OwnerRequest, OwnerReply } from './Types';
let owner: Owner | undefined;
self.onmessage = ({ data }: MessageEvent<OwnerRequest>) => {
    let reply: OwnerReply;
    try {
        if (data.type === 'init') {
            if (owner)
                throw new Error('Owner already initialized');
            owner = new Owner(data.models, data.indices);
            reply = { id: data.id, ready: true };
        }
        else {
            if (!owner)
                throw new Error('Owner not initialized');
            reply = { id: data.id, result: owner.plan(data.frame) };
        }
    }
    catch (error) {
        reply = { id: data.id, error: error instanceof Error ? error.message : String(error) };
    }
    self.postMessage(reply);
};
