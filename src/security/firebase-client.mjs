import {createPasskeyClient,passkeysSupported} from './client.mjs';
export function firebasePasskeyClient({endpoint,currentUser,reauthenticate,completeLogin}){
  const client=createPasskeyClient({endpoint,headers:async()=>{const user=currentUser();return user?{Authorization:'Bearer '+await user.getIdToken(true)}:{};}});
  return {...client,
    async register({password,label}={}){await reauthenticate(password);return client.register({label});},
    async remove(id,password){await reauthenticate(password);return client.remove(id);},
    async authenticate(options){const result=await client.authenticate(options);if(!result.customToken)throw Error('Não foi possível concluir o acesso.');await completeLogin(result.customToken);},
  };
}
export function mountPasskeys(element,client,{signedIn=false}={}){
  let disposed=false,busy=false;const controller=new AbortController();
  element.replaceChildren();element.hidden=true;
  const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const heading=document.createElement('h3');heading.textContent='Chaves de acesso';element.append(heading,status);
  const password=document.createElement('input');password.type='password';password.autocomplete='current-password';password.maxLength=4096;
  const name=document.createElement('input');name.maxLength=80;name.value='Meu dispositivo';
  const list=document.createElement('ul');
  const button=(text,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.addEventListener('click',()=>task(fn),{signal:controller.signal});return b;};
  async function task(fn){if(busy)return;busy=true;element.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();}catch(e){if(!disposed)status.textContent=e.name==='NotAllowedError'?'Operação cancelada. Tente novamente quando quiser.':e.message;}finally{password.value='';busy=false;if(!disposed)element.querySelectorAll('button').forEach(b=>b.disabled=false);}}
  async function refresh(){const data=await client.list();if(disposed)return;list.replaceChildren();for(const c of data.credentials){const li=document.createElement('li');li.textContent=c.label;li.append(button('Remover',async()=>{await client.remove(c.id,password.value);await refresh();status.textContent='Chave removida.';}));list.append(li);}}
  if(signedIn){
    const label=document.createElement('label');label.textContent='Confirme sua senha (para contas com senha)';label.append(password);
    const keyLabel=document.createElement('label');keyLabel.textContent='Nome da chave';keyLabel.append(name);
    element.append(list,keyLabel,label,button('Cadastrar chave de acesso',async()=>{await client.register({password:password.value,label:name.value});await refresh();status.textContent='Chave cadastrada neste dispositivo.';}));
  }else element.append(button('Entrar com chave de acesso',async()=>{await client.authenticate();status.textContent='Acesso confirmado.';}));
  (async()=>{if(!passkeysSupported()||!await client.available()||disposed)return;element.hidden=false;status.textContent=signedIn?'Cadastre uma chave em um dispositivo de sua confiança. Sua forma atual de recuperação continua disponível.':'Use a biometria ou o PIN do dispositivo.';if(signedIn)try{await refresh();}catch(e){status.textContent=e.message;}})();
  return ()=>{disposed=true;controller.abort();password.value='';element.replaceChildren();};
}
