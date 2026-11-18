import {Localized} from '../lib/language';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowLeft,ArrowRight,Check,Copy,Eye,EyeOff,KeyRound,LogOut,ShieldCheck,UserRound,X} from 'lucide-react';

type User={id:string;name:string;email:string;provider?:string};
type Mode='login'|'register'|'recover';

export default function Account(){
 const [user,setUser]=useState<User|null>(null);
 const [googleEnabled,setGoogleEnabled]=useState(false);
 const [emailEnabled,setEmailEnabled]=useState(false);
 const [mode,setMode]=useState<Mode>('login');
 const [open,setOpen]=useState(false);
 const [status,setStatus]=useState('');
 const [success,setSuccess]=useState(false);
 const [busy,setBusy]=useState(false);
 const [showPassword,setShowPassword]=useState(false);
 const [recoveryCode,setRecoveryCode]=useState<string|null>(null);
 const dialog=useRef<HTMLDialogElement>(null);

 useEffect(()=>{
  const controller=new AbortController();
  fetch('/api/session',{signal:controller.signal}).then(async response=>{
   if(!response.ok)throw Error();
   const data=await response.json();
   setUser(data.user);setGoogleEnabled(data.googleEnabled);setEmailEnabled(data.emailEnabled);
  }).catch(error=>{if(error.name!=='AbortError')setStatus('Не вдалося з’єднатися. Онови сторінку й спробуй ще раз.');});
  const address=new URL(location.href),auth=address.searchParams.get('auth');
  if(auth){
   setOpen(true);setSuccess(auth==='success');
   setStatus(auth==='success'?'Ти увійшов':auth==='setup'?'Google-вхід готується':'Не вдалося завершити вхід. Спробуй ще раз.');
   address.searchParams.delete('auth');history.replaceState(null,'',address.pathname+address.search);
  }
  return()=>controller.abort();
 },[]);

 useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close();},[open]);

 function changeMode(next:Mode){setMode(next);setStatus('');setShowPassword(false);}
 function show(next:Mode){changeMode(next);setOpen(true);}
 function report(error:unknown){setSuccess(false);setStatus(error instanceof Error?error.message:'Сервіс тимчасово недоступний');}

 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  const form=event.currentTarget,fields=new FormData(form);
  if(mode!=='login'&&fields.get('password')!==fields.get('confirmation')){
   setSuccess(false);setStatus('Паролі не збігаються');return;
  }
  setBusy(true);setStatus('');
  try{
   const path=mode==='register'?'/api/register':mode==='recover'?'/api/recover':'/api/login';
   const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    name:fields.get('name'),email:fields.get('email'),password:fields.get('password'),recoveryCode:fields.get('recoveryCode'),
   })});
   const data=await response.json();
   if(!response.ok)throw Error(data.error||'Сервіс тимчасово недоступний');
   setSuccess(true);setShowPassword(false);form.reset();
   if(mode==='recover'){
    setMode('login');setStatus('Пароль змінено. Увійди з новим паролем.');
   }else{
    setUser(data.user);setRecoveryCode(data.recoveryCode||null);setStatus(mode==='register'?'Профіль створено':'Ти увійшов');
   }
  }catch(error){report(error);}finally{setBusy(false);}
 }

 async function generateRecoveryCode(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  const form=event.currentTarget;
  setBusy(true);setStatus('');
  try{
   const response=await fetch('/api/account/recovery-code',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:new FormData(form).get('password')})});
   const data=await response.json();
   if(!response.ok)throw Error(data.error||'Сервіс тимчасово недоступний');
   setRecoveryCode(data.recoveryCode);setSuccess(true);form.reset();
  }catch(error){report(error);}finally{setBusy(false);}
 }

 async function copyCode(){
  if(!recoveryCode)return;
  try{await navigator.clipboard.writeText(recoveryCode);setSuccess(true);setStatus('Код скопійовано');}
  catch{setSuccess(false);setStatus('Виділи код і скопіюй його вручну.');}
 }

 async function logout(){
  setBusy(true);
  try{
   const response=await fetch('/api/logout',{method:'POST'});
   if(!response.ok)throw Error('Не вдалося вийти. Спробуй ще раз.');
   setUser(null);setRecoveryCode(null);setStatus('');setOpen(false);
  }catch(error){report(error);}finally{setBusy(false);}
 }

 const title=user?'Твій профіль':mode==='register'?'Почни навчатися сьогодні':mode==='recover'?'Відновлення пароля':'Раді бачити тебе знову';
 const submitLabel=mode==='register'?'Створити акаунт':mode==='recover'?'Змінити пароль':'Увійти';

 return <Localized><>
  <div className="account-actions">
   {!user&&<button className="register-trigger" onClick={()=>show('register')}>Реєстрація</button>}
   <button className="account-trigger" onClick={()=>show('login')}><UserRound size={18}/><span>{user?user.name.split(' ')[0]:'Увійти'}</span></button>
  </div>
  <dialog ref={dialog} className="account-dialog readable-account" aria-labelledby="account-heading" onCancel={()=>setOpen(false)} onClick={event=>{if(event.target===dialog.current)setOpen(false);}}>
   <div className="account-dialog-body">
    <button aria-label="Закрити обліковий запис" className="dialog-close" onClick={()=>setOpen(false)}><X size={21}/></button>
    <div className="auth-brand"><img width="42" height="42" src="/lemvori-ecg.svg" alt=""/><span>LEMVORI <b>ECG ACADEMY</b></span></div>
    <h2 id="account-heading">{title}</h2>
    {!user&&<p className="auth-intro">{mode==='register'?'Збережи доступ до свого профілю. Уроки та практика доступні одразу.':mode==='recover'?'Введи email, збережений резервний код і новий пароль.':'Введи email і пароль, які використав під час реєстрації.'}</p>}
    {status&&<p className={'auth-message '+(success?'success':'error')} role={success?'status':'alert'}>{status}</p>}
    {user?<>
     <div className="profile-identity"><UserRound size={23}/><div><strong>{user.name}</strong><span>{user.email}</span></div><ShieldCheck size={19}/></div>
     {recoveryCode?<section className="recovery-code-card">
      <h3><KeyRound size={19}/> Збережи резервний код</h3>
      <p>Він потрібен, якщо забудеш пароль. Код одноразовий. Після оновлення сторінки ми не зможемо показати його повторно.</p>
      <input aria-label="Твій резервний код" readOnly value={recoveryCode} translate="no" onFocus={event=>event.currentTarget.select()}/>
      <div className="actions"><button className="secondary" onClick={copyCode}><Copy size={16}/> Скопіювати</button><button className="primary" onClick={()=>{setRecoveryCode(null);setStatus('');}}><Check size={16}/> Я зберіг код</button></div>
     </section>:user.provider==='google'?<p className="account-note">Ти входиш через Google. Відновлення доступу доступне у твоєму Google-акаунті.</p>:<details className="profile-recovery"><summary><KeyRound size={17}/> Створити новий резервний код</summary><p>Підтвердь поточний пароль. Новий код замінить попередній.</p><form className="auth-form" onSubmit={generateRecoveryCode}><label>Поточний пароль<input name="password" type="password" autoComplete="current-password" minLength={12} maxLength={128} required/></label><button className="secondary" disabled={busy}>{busy?'Зберігаємо…':'Створити резервний код'}</button></form></details>}
     <p className="account-note">Прогрес навчання зберігається на цьому пристрої.</p>
     <button className="secondary profile-logout" disabled={busy} onClick={logout}><LogOut size={16}/> Вийти з профілю</button>
    </>:<>
     {mode!=='recover'&&<div className="auth-tabs"><button type="button" className={mode==='login'?'active':''} onClick={()=>changeMode('login')}>Увійти</button><button type="button" className={mode==='register'?'active':''} onClick={()=>changeMode('register')}>Реєстрація</button></div>}
     <form className="auth-form" onSubmit={submit} key={mode}>
      {mode==='register'&&<label>Як до тебе звертатися<input name="name" placeholder="Твоє ім’я" autoComplete="given-name" maxLength={120} required/></label>}
      <label>Електронна адреса<input name="email" type="email" autoComplete="email" placeholder="name@example.com" maxLength={254} required/></label>
      {mode==='recover'&&<label>Резервний код<input name="recoveryCode" placeholder="XXXXX-XXXXX-…" autoComplete="off" maxLength={80} spellCheck={false} required/><small>Код, який ти зберіг після реєстрації або створив у своєму профілі.</small></label>}
      <div className="auth-password-field"><label htmlFor="account-password">{mode==='recover'?'Новий пароль':'Пароль'}</label><div className="password-input"><input id="account-password" name="password" type={showPassword?'text':'password'} minLength={12} maxLength={128} autoComplete={mode==='login'?'current-password':'new-password'} placeholder="Мінімум 12 символів" required/><button type="button" aria-label={showPassword?'Приховати пароль':'Показати пароль'} onClick={()=>setShowPassword(!showPassword)}>{showPassword?<EyeOff size={19}/>:<Eye size={19}/>}</button></div></div>
      {mode!=='login'&&<label>Повтори пароль<input name="confirmation" type="password" minLength={12} maxLength={128} autoComplete="new-password" required/></label>}
      {mode==='login'&&<button type="button" className="forgot-password" onClick={()=>changeMode('recover')}>Забули пароль?</button>}
      <button className="primary" type="submit" disabled={busy||!emailEnabled}>{busy?'Зберігаємо…':submitLabel}<ArrowRight size={17}/></button>
     </form>
     {mode==='register'&&<p className="account-note"><ShieldCheck size={15}/> Після реєстрації отримаєш одноразовий код для відновлення доступу. Збережи його в безпечному місці.</p>}
     {mode==='recover'?<button className="text-button auth-back" onClick={()=>changeMode('login')}><ArrowLeft size={15}/> Повернутися до входу</button>:googleEnabled&&<a className="google-button" href="/auth/google" target="_top"><span className="google-letter">G</span> Продовжити з Google</a>}
    </>}
   </div>
  </dialog>
 </></Localized>;
}
