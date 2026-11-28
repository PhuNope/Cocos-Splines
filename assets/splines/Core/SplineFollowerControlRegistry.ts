/** Runtime-only control leases shared by itinerary and group controllers.
 * No engine dependencies; keys are weak, never serialized. */
interface Lease {owner:object;rate:number}
const leases=new WeakMap<object,Lease>();
export const validFollowerRate=(rate:number):boolean=>Number.isFinite(rate)&&rate>=.01&&rate<=10;
export function followerControllerOwner(follower:object):object|undefined{return leases.get(follower)?.owner;}
export function claimFollowerController(follower:object,owner:object):boolean{
    const prior=leases.get(follower);
    if(prior)return prior.owner===owner;
    leases.set(follower,{owner,rate:1});return true;
}
export function releaseFollowerController(follower:object,owner:object):void{
    if(leases.get(follower)?.owner===owner)leases.delete(follower);
}
export function setFollowerControllerRate(follower:object,owner:object,rate:number):void{
    const lease=leases.get(follower);
    if(!lease||lease.owner!==owner||!validFollowerRate(rate))throw Error('Invalid follower controller lease or rate.');
    lease.rate=rate;
}
export function followerControllerRate(follower:object):number{return leases.get(follower)?.rate??1;}
