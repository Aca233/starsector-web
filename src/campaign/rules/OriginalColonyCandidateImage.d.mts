export type OriginalColonyCandidateImageField = 'size' | 'planetType' | 'gasGiant' | 'specialItemId';
/** Bind actual live values/getters. Missing required fields throw; unused fields are not read. */
export interface OriginalColonyCandidateImageInputs {
    /** Required for farming, mining, population, lightindustry and commerce; actual Java int market size. */
    readonly size?: number;
    /**
     * Required for mining/lightindustry/militarybase/heavybatteries.
     * Null means NO market planet entity; a nonempty actual type ID means a planet exists.
     * The type name itself is not used to infer gas-giant status.
     */
    readonly planetType?: string | null;
    /** Required only when one of those branches has planetType!==null. Actual planet.isGasGiant(). */
    readonly gasGiant?: boolean;
    /** Required for fuelprod. Explicit null means no item; ANY actual non-null item selects advanced image. */
    readonly specialItemId?: string | null;
}
/** Possible field reads in original order; gasGiant is skipped for a null planetType. */
export function originalColonyCandidateImageNeeded(industryId: string): readonly OriginalColonyCandidateImageField[];
/**
 * Original resource path, not a Web URL. Static Base image comes from the extracted native directory.
 * Supports the native getCurrentImage branches only; does not admit items or change industry effects.
 * Aquaculture and other Base-only images take {}. Unknown industry IDs and missing needed values reject.
 */
export function originalColonyCandidateImage(industryId: string, inputs: OriginalColonyCandidateImageInputs): string | null;
