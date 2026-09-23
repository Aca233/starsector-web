export interface OriginalBaseIndustryFrameRow {wasDisrupted:boolean;buildProgress:number;buildTime:number;entry:{operating:{building:boolean}}}
export function advanceOriginalBaseIndustryFrame<T>(row:OriginalBaseIndustryFrameRow,days:number,context:{colonyDebug?:boolean},runtime:{isDisrupted():boolean;disruptionFinished():void;finishBuildingOrUpgrading():T}):T|null;
