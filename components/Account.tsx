import {Localized} from '../lib/language';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowRight,CheckCircle2,LogOut,UserRound,X} from 'lucide-react';
type User={id:string;name:string;email:string};
export default function Account(){
 const [user,setUser]=useState<User|null>(null);
 const [googleEnabled,setGoogleEnabled]=useState(false);
 const [emailEnabled,setEmailEnabled]=useState(false);
 const [mode,setMode]=useState<'login'|'register'>('login');
 const [open,setOpen]=useState(false),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{
  const controller=new AbortController();
  fetch('/api/session',{signal:controller.signal}).then(async response=>{
   if(!response.ok)throw Error();const data=await response.json();setUser(data.user);setGoogleEnabled(data.googleEnabled);setEmailEnabled(data.emailEnabled);
  }).catch(error=>{if(error.name!=='AbortError')setStatus('Сервіс тимчасово недоступний')});
  const url=new URL(location.href),auth=url.searchParams.get('auth');
  if(auth){setOpen(true);setStatus(auth==='success'?'Ти увійшов':auth==='setup'?'Google-вхід готується':'Не вдалося завершити вхід. Спробуй ще раз.');url.searchParams.delete('auth');history.replaceState(null,'',url.pathname+url.search)}
  return()=>controller.abort();
 },[]);
 useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close()},[open]);
 function show(next:'login'|'register'){setMode(next);setStatus('');setOpen(true)}
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();const form=event.currentTarget;const fields=new FormData(form);
  if(mode==='register'&&fields.get('password')!==fields.get('confirmation')){setStatus('Паролі не збігаються');return}
  setBusy(true);setStatus('');
  try{
   const response=await fetch(mode==='register'?'/api/register':'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:fields.get('name'),email:fields.get('email'),password:fields.get('password')})});
   const data=await response.json();if(!response.ok)throw Error(data.error||'Сервіс тимчасово недоступний');
   setUser(data.user);setStatus(mode==='register'?'Профіль створено':'Ти увійшов');form.reset();
  }catch(error){setStatus(error instanceof Error?error.message:'Сервіс тимчасово недоступний')}finally{setBusy(false)}
 }
 async function logout(){setBusy(true);try{const response=await fetch('/api/logout',{method:'POST'});if(!response.ok)throw Error();setUser(null);setStatus('');setOpen(false)}catch{setStatus('Сервіс тимчасово недоступний')}finally{setBusy(false)}}
 return <Localized><><div className="account-actions">{!user&&<button className="register-trigger" onClick={()=>show('register')}>Реєстрація</button>}<button className="account-trigger" onClick={()=>show('login')}><UserRound size={17}/><span>{user?user.name.split(' ')[0]:'Увійти'}</span>{!user&&<ArrowRight size={15}/>}</button></div><dialog ref={dialog} className="account-dialog" onCancel={()=>setOpen(false)} onClick={event=>{if(event.target===dialog.current)setOpen(false)}}><div className="account-dialog-body"><button aria-label="Закрити обліковий запис" className="dialog-close" onClick={()=>setOpen(false)}><X size={20}/></button><img width="48" height="48" src="/lemvori-ecg.svg" alt=""/><span className="micro">ТВОЯ АКАДЕМІЯ</span><h2>{user?user.name:mode==='login'?'Вхід у профіль':'Приєднуйся до академії'}</h2>{user?<><p>{user.email}</p><div className="account-confirm"><CheckCircle2 size={18}/> Обліковий запис активний</div><button className="secondary" disabled={busy} onClick={logout}><LogOut size={16}/> Вийти</button><p className="account-note">Прогрес навчання зберігається на цьому пристрої.</p></>:<><div className="auth-tabs"><button className={mode==='login'?'active':''} onClick={()=>{setMode('login');setStatus('')}}>Увійти</button><button className={mode==='register'?'active':''} onClick={()=>{setMode('register');setStatus('')}}>Реєстрація</button></div><form className="auth-form" onSubmit={submit} key={mode}>{mode==='register'&&<label>Ім’я<input name="name" autoComplete="name" maxLength={120} required/></label>}<label>Електронна адреса<input name="email" type="email" autoComplete="email" maxLength={254} required/></label><label>Пароль<input name="password" type="password" minLength={12} maxLength={128} autoComplete={mode==='register'?'new-password':'current-password'} placeholder="Мінімум 12 символів" required/></label>{mode==='register'&&<label>Повтори пароль<input name="confirmation" type="password" minLength={12} maxLength={128} autoComplete="new-password" required/></label>}<button className="primary" type="submit" disabled={busy||!emailEnabled}>{busy?'Зберігаємо…':mode==='register'?'Створити профіль':'Увійти'}<ArrowRight size={16}/></button></form>{googleEnabled?<a className="google-button" href="/auth/google" target="_top"><span className="google-letter">G</span> Продовжити з Google</a>:<small className="google-pending">Google потребує додаткового налаштування. Email-реєстрація вже доступна.</small>}<p className="account-note">Email використовується для входу. Надсилання листів і відновлення пароля ще не підключені.</p></>}{status&&<p className="auth-message" role="status">{status}</p>}</div></dialog></></Localized>;
}
