import type {OriginalMemberViewTexture,OriginalMemberViewSprite} from './OriginalCampaignFleetMemberView.mjs';
import type {renderOriginalCampaignContrails} from './OriginalCampaignContrails.mjs';
export type FleetDrawVec=[number,number];export type FleetDrawRGBA=[number,number,number,number];export type FleetDrawMask=[boolean,boolean,boolean,boolean];
export interface OriginalFleetDrawVertex {position:FleetDrawVec;uv:FleetDrawVec;color:FleetDrawRGBA}
export interface OriginalPlanetDrawLight {position:[number,number,number];diffuse:[number,number,number]}
export interface OriginalPlanetSphereCommand {kind:'planet-sphere';pass:string;texture:OriginalMemberViewTexture;radius:number;z:number;rotation:[number,number,number];color:[number,number,number,number];materialAmbient:number;lighting:{primary:OriginalPlanetDrawLight;secondary:OriginalPlanetDrawLight|null}|null;blendSrc:770;blendDest:1|771}
export type OriginalFleetDrawCommand=OriginalPlanetSphereCommand|{kind:'mask';mask:FleetDrawMask}|{kind:'quads';pass:string;texture:OriginalMemberViewTexture|null;blendSrc:number;blendDest:number;vertices:OriginalFleetDrawVertex[]};
export interface OriginalFleetDrawFrame {scope:'native-campaign-fleet-draw';origin:FleetDrawVec;commands:OriginalFleetDrawCommand[]}
export const NATIVE_FLEET_RGB_MASK:Readonly<FleetDrawMask>;
export function createOriginalFleetDrawFrame(origin?:FleetDrawVec):OriginalFleetDrawFrame;
export function originalFleetDrawColor(color:readonly number[],alpha?:number):FleetDrawRGBA;
export function originalFleetDrawRotate(p:FleetDrawVec,degrees:number):FleetDrawVec;
export function originalFleetDrawMask(frame:OriginalFleetDrawFrame,mask:readonly boolean[]):void;
export function originalFleetDrawQuads(frame:OriginalFleetDrawFrame,pass:string,texture:OriginalMemberViewTexture|null,vertices:OriginalFleetDrawVertex[],blendSrc?:number,blendDest?:number):void;
export function originalFleetDrawSprite(frame:OriginalFleetDrawFrame,pass:string,sprite:OriginalMemberViewSprite,position?:FleetDrawVec,outerAngle?:number):void;
export function appendOriginalFleetContrailDraw(frame:OriginalFleetDrawFrame,contrails:ReturnType<typeof renderOriginalCampaignContrails>,readTexture:(path:string)=>OriginalMemberViewTexture):void;
