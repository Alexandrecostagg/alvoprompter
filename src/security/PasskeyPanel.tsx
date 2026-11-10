'use client';
import {useEffect,useRef} from 'react';
import {mountPasskeys} from './firebase-client.mjs';
export function PasskeyPanel({client,userId}:{client:any;userId?:string|null}){
  const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(root.current)return mountPasskeys(root.current,client,{signedIn:Boolean(userId)});},[client,userId]);
  return <div ref={root} hidden />;
}
