const result=document.querySelector('#searchResult');document.querySelector('#demoSearch')?.addEventListener('click',()=>{const goal=document.querySelector('#goal').value;result.textContent=`${goal} selected. Live matching will use verified server-side sources and your approved profile data.`});document.querySelector('#startBtn')?.addEventListener('click',()=>{document.querySelector('#startResult').textContent='CareerLaunch foundation is ready. Authentication and document workflows connect through protected backend services.'});if('serviceWorker'in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}))}

const signupForm=document.querySelector('#signupForm');
signupForm?.addEventListener('submit',async(event)=>{
  event.preventDefault();
  const email=document.querySelector('#signupEmail');
  const password=document.querySelector('#signupPassword');
  const confirm=document.querySelector('#signupPasswordConfirm');
  const output=document.querySelector('#signupResult');
  const submit=signupForm.querySelector('button[type="submit"]');
  if(!email?.checkValidity()){output.textContent='Enter a valid email address to continue.';email?.focus();return;}
  if(!password?.checkValidity()){output.textContent='Use a password of at least 8 characters.';password?.focus();return;}
  if(password.value!==confirm?.value){output.textContent='The passwords do not match.';confirm?.focus();return;}
  const config=window.CAREERLAUNCH_CONFIG;
  if(!config?.SUPABASE_URL||!config?.SUPABASE_PUBLISHABLE_KEY){output.textContent='Account service is temporarily unavailable.';return;}
  submit.disabled=true;output.textContent='Creating your CareerLaunch account…';
  try{
    const response=await fetch(`${config.SUPABASE_URL}/auth/v1/signup`,{method:'POST',headers:{'Content-Type':'application/json','apikey':config.SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify({email:email.value.trim(),password:password.value})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data?.msg||data?.message||`Account request failed (${response.status})`);
    output.textContent='Account created. If email confirmation is enabled, confirm your email, then sign in with your email and password.';
    signupForm.reset();
  }catch(error){console.error('CareerLaunch signup failed',error);output.textContent=error?.message||'We could not create your account right now. Please try again.';}finally{submit.disabled=false;}
});
