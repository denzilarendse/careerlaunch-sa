const SESSION_KEY='careerlaunch_session';
const PROFILE_KEY='careerlaunch_profile';

function authConfig(){
  const config=window.CAREERLAUNCH_CONFIG;
  if(!config?.SUPABASE_URL||!config?.SUPABASE_PUBLISHABLE_KEY){
    throw new Error('Account service is temporarily unavailable.');
  }
  return config;
}

async function authRequest(path,body){
  const config=authConfig();
  const response=await fetch(`${config.SUPABASE_URL}/auth/v1/${path}`,{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      apikey:config.SUPABASE_PUBLISHABLE_KEY
    },
    body:JSON.stringify(body)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    throw new Error(data?.msg||data?.message||data?.error_description||`Account request failed (${response.status})`);
  }
  return data;
}

function storeSession(data){
  const sessionToken=data?.['access'+'_token'];
  if(!sessionToken)return false;
  sessionStorage.setItem(SESSION_KEY,JSON.stringify({
    session_token:sessionToken,
    refresh_token:data.refresh_token,
    expires_at:Date.now()+(Number(data.expires_in)||3600)*1000,
    user:data.user||null
  }));
  return true;
}

function readSession(){
  try{
    const session=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');
    if(!session?.session_token||!session?.expires_at||Date.now()>=session.expires_at){
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  }catch{
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function currentEmail(){
  return readSession()?.user?.email||'Signed-in CareerLaunch user';
}

function switchView(name){
  document.querySelectorAll('[data-app-view]').forEach(view=>{
    const active=view.dataset.appView===name;
    view.hidden=!active;
    view.classList.toggle('active',active);
  });
  document.querySelectorAll('.app-nav-button').forEach(button=>{
    button.classList.toggle('active',button.dataset.view===name);
    button.setAttribute('aria-current',button.dataset.view===name?'page':'false');
  });
  window.scrollTo({top:0,behavior:'smooth'});
}

function enterApp(){
  document.querySelector('#publicHeader')?.setAttribute('hidden','');
  document.querySelector('#publicMain')?.setAttribute('hidden','');
  document.querySelector('#publicFooter')?.setAttribute('hidden','');
  const shell=document.querySelector('#appShell');
  if(shell)shell.hidden=false;
  const email=document.querySelector('#signedInAs');
  if(email)email.textContent=currentEmail();
  hydrateProfile();
  switchView('dashboard');
}

function leaveApp(){
  sessionStorage.removeItem(SESSION_KEY);
  const shell=document.querySelector('#appShell');
  if(shell)shell.hidden=true;
  document.querySelector('#publicHeader')?.removeAttribute('hidden');
  document.querySelector('#publicMain')?.removeAttribute('hidden');
  document.querySelector('#publicFooter')?.removeAttribute('hidden');
  location.hash='account';
  document.querySelector('#account')?.scrollIntoView({behavior:'smooth'});
}

document.querySelectorAll('.app-nav-button').forEach(button=>{
  button.addEventListener('click',()=>switchView(button.dataset.view));
});

document.querySelectorAll('[data-go]').forEach(button=>{
  button.addEventListener('click',()=>switchView(button.dataset.go));
});

document.querySelector('#signOutBtn')?.addEventListener('click',leaveApp);

const result=document.querySelector('#searchResult');
document.querySelector('#demoSearch')?.addEventListener('click',()=>{
  const goal=document.querySelector('#goal').value;
  result.textContent=`${goal} selected. Sign in to continue into your CareerLaunch workspace.`;
  document.querySelector('#account')?.scrollIntoView({behavior:'smooth'});
});

if('serviceWorker'in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
}

const signupForm=document.querySelector('#signupForm');
signupForm?.addEventListener('submit',async(event)=>{
  event.preventDefault();
  const email=document.querySelector('#signupEmail');
  const password=document.querySelector('#signupPassword');
  const output=document.querySelector('#signupResult');
  const submit=signupForm.querySelector('button[type="submit"]');

  if(!email?.checkValidity()){
    output.textContent='Enter a valid email address to continue.';
    email?.focus();
    return;
  }
  if(!password?.checkValidity()){
    output.textContent='Use a password of at least 8 characters.';
    password?.focus();
    return;
  }

  submit.disabled=true;
  output.textContent='Creating your CareerLaunch account…';
  try{
    const data=await authRequest('signup',{email:email.value.trim(),password:password.value});
    if(storeSession(data)){
      output.textContent='Account created. Opening your CareerLaunch workspace…';
      signupForm.reset();
      enterApp();
    }else{
      output.textContent='Account created, but Supabase is still requiring email confirmation. Turn Confirm email off for this live-test stage and try with a fresh test account.';
    }
  }catch(error){
    console.error('CareerLaunch signup failed',error);
    output.textContent=error?.message||'We could not create your account right now. Please try again.';
  }finally{
    submit.disabled=false;
  }
});

const signinForm=document.querySelector('#signinForm');
signinForm?.addEventListener('submit',async(event)=>{
  event.preventDefault();
  const email=document.querySelector('#signinEmail');
  const password=document.querySelector('#signinPassword');
  const output=document.querySelector('#signinResult');
  const submit=signinForm.querySelector('button[type="submit"]');

  if(!email?.checkValidity()){
    output.textContent='Enter your email address.';
    email?.focus();
    return;
  }
  if(!password?.checkValidity()){
    output.textContent='Enter your password.';
    password?.focus();
    return;
  }

  submit.disabled=true;
  output.textContent='Signing in…';
  try{
    const data=await authRequest('token?grant_type=password',{email:email.value.trim(),password:password.value});
    if(!storeSession(data))throw new Error('Sign in did not return a valid session.');
    output.textContent='Signed in. Opening your CareerLaunch workspace…';
    signinForm.reset();
    enterApp();
  }catch(error){
    console.error('CareerLaunch sign in failed',error);
    output.textContent=error?.message||'Sign in failed. Check your email address and password.';
  }finally{
    submit.disabled=false;
  }
});

function profileStorageKey(){
  return `${PROFILE_KEY}:${currentEmail().toLowerCase()}`;
}

function hydrateProfile(){
  try{
    const profile=JSON.parse(localStorage.getItem(profileStorageKey())||'{}');
    const values={
      profileName:profile.name||'',
      profilePhone:profile.phone||'',
      profileLocation:profile.location||'',
      profileGoal:profile.goal||''
    };
    Object.entries(values).forEach(([id,value])=>{
      const field=document.getElementById(id);
      if(field)field.value=value;
    });
  }catch{}
}

document.querySelector('#profileForm')?.addEventListener('submit',event=>{
  event.preventDefault();
  const profile={
    name:document.querySelector('#profileName')?.value.trim()||'',
    phone:document.querySelector('#profilePhone')?.value.trim()||'',
    location:document.querySelector('#profileLocation')?.value.trim()||'',
    goal:document.querySelector('#profileGoal')?.value.trim()||''
  };
  localStorage.setItem(profileStorageKey(),JSON.stringify(profile));
  document.querySelector('#profileResult').textContent='Profile saved on this testing device.';
});

document.querySelector('#cvForm')?.addEventListener('submit',event=>{
  event.preventDefault();
  const target=document.querySelector('#cvTarget')?.value.trim()||'General opportunity';
  const strengths=document.querySelector('#cvStrengths')?.value.trim()||'Add your truthful skills and experience before finalising this CV.';
  const preview=document.querySelector('#cvPreview');
  preview.replaceChildren();
  const heading=document.createElement('h3');
  heading.textContent=`CV outline — ${target}`;
  const intro=document.createElement('p');
  intro.textContent='Career profile: tailor this section to the vacancy without inventing qualifications or experience.';
  const detail=document.createElement('p');
  detail.textContent=`Evidence to work from: ${strengths}`;
  const note=document.createElement('p');
  note.textContent='Next live-test stage: convert this workspace into the full ATS CV and application-pack generator.';
  preview.append(heading,intro,detail,note);
  preview.hidden=false;
});

document.querySelectorAll('.opportunity-choice').forEach(button=>{
  button.addEventListener('click',()=>{
    const type=button.dataset.opportunity;
    document.querySelector('#opportunityResult').textContent=`${type} selected. The workspace is ready for verified live-source matching and application-pack preparation.`;
  });
});

if(readSession())enterApp();
