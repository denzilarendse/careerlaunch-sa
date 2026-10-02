import {
  ROLE_OPTIONS,
  STRENGTH_OPTIONS,
  SKILL_OPTIONS,
  OFO_SOURCE_NOTE
} from './career-options.js';
import { MAJOR_JOB_SITES, APPLICATION_FORMS } from './resource-catalog.js';

const SESSION_KEY='careerlaunch_session';
const PDFJS_URL='https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.min.mjs';
const PDFJS_WORKER_URL='https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.worker.min.mjs';
const JSPDF_URL='https://cdn.jsdelivr.net/npm/jspdf@4.2.1/+esm';

const state={
  profile:null,
  experience:[],
  education:[],
  skills:[],
  opportunities:[],
  applications:[],
  shortlist:[],
  documents:[],
  packs:[],
  cvDraft:null,
  selectedOpportunity:null,
  generatedAi:null,
  manualPreviewText:'',
  aiConversation:[],
  libraryFilter:'cvs',
  selections:{
    profileRoles:[],
    roles:[],
    strengths:[],
    skills:[]
  },
  loading:false
};

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
  localStorage.setItem(SESSION_KEY,JSON.stringify({
    session_token:sessionToken,
    refresh_token:data.refresh_token,
    expires_at:Date.now()+(Number(data.expires_in)||3600)*1000,
    user:data.user||null
  }));
  return true;
}

function readSession(){
  try{
    return JSON.parse(localStorage.getItem(SESSION_KEY)||'null');
  }catch{
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

async function revokeSession(session){
  if(!session?.session_token)return;
  const config=authConfig();
  const response=await fetch(`${config.SUPABASE_URL}/auth/v1/logout`,{
    method:'POST',
    headers:{
      apikey:config.SUPABASE_PUBLISHABLE_KEY,
      Authorization:`Bearer ${session.session_token}`
    }
  });
  if(!response.ok&&response.status!==401){
    throw new Error(`Sign out request failed (${response.status})`);
  }
}

async function ensureSession(){
  const session=readSession();
  if(!session?.session_token)return null;
  if(session.expires_at&&Date.now()<session.expires_at-60000)return session;
  if(!session.refresh_token){
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
  try{
    const refreshed=await authRequest('token?grant_type=refresh_token',{refresh_token:session.refresh_token});
    if(!storeSession(refreshed))throw new Error('Session refresh failed.');
    return readSession();
  }catch{
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function currentEmail(){
  return readSession()?.user?.email||'Signed-in CareerLaunch user';
}

function currentUserId(){
  return readSession()?.user?.id||null;
}

async function dbRequest(path,{method='GET',body,prefer}={}){
  const config=authConfig();
  const session=await ensureSession();
  if(!session?.session_token)throw new Error('Your session has expired. Sign in again.');
  const headers={
    apikey:config.SUPABASE_PUBLISHABLE_KEY,
    Authorization:`Bearer ${session.session_token}`
  };
  if(body!==undefined)headers['Content-Type']='application/json';
  if(prefer)headers.Prefer=prefer;
  const response=await fetch(`${config.SUPABASE_URL}/rest/v1/${path}`,{
    method,
    headers,
    body:body===undefined?undefined:JSON.stringify(body)
  });
  const text=await response.text();
  let data=null;
  try{ data=text?JSON.parse(text):null; }catch{ data=text; }
  if(!response.ok){
    throw new Error(data?.message||data?.details||data?.hint||`Data request failed (${response.status})`);
  }
  return data;
}

async function functionRequest(name,body){
  const config=authConfig();
  const session=await ensureSession();
  if(!session?.session_token)throw new Error('Your session has expired. Sign in again.');
  const response=await fetch(`${config.SUPABASE_URL}/functions/v1/${name}`,{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      apikey:config.SUPABASE_PUBLISHABLE_KEY,
      Authorization:`Bearer ${session.session_token}`
    },
    body:JSON.stringify(body)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const message=data?.message||data?.detail||data?.error||`AI request failed (${response.status})`;
    throw new Error(message);
  }
  return data;
}

function make(tag,{className,text,attrs}={}){
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(text!==undefined)node.textContent=text;
  if(attrs){
    Object.entries(attrs).forEach(([key,value])=>{
      if(value!==null&&value!==undefined)node.setAttribute(key,String(value));
    });
  }
  return node;
}

function clear(node){
  while(node?.firstChild)node.removeChild(node.firstChild);
}

function setText(selector,value){
  const node=document.querySelector(selector);
  if(node)node.textContent=value;
}

function formatDate(value){
  if(!value)return 'No closing date published';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return 'Date unavailable';
  return new Intl.DateTimeFormat('en-ZA',{day:'numeric',month:'short',year:'numeric'}).format(date);
}

function formatDateTime(value){
  if(!value)return 'Not yet verified';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return 'Verification time unavailable';
  return new Intl.DateTimeFormat('en-ZA',{
    day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'
  }).format(date);
}

function isExpired(item){
  if(!item?.closing_date)return false;
  const close=new Date(item.closing_date);
  if(Number.isNaN(close.getTime()))return false;
  return close.getTime()<Date.now();
}

function switchView(name){
  document.querySelectorAll('[data-app-view]').forEach(view=>{
    const active=view.dataset.appView===name;
    view.hidden=!active;
    view.classList.toggle('active',active);
  });
  document.querySelectorAll('.app-nav-button').forEach(button=>{
    const active=button.dataset.view===name;
    button.classList.toggle('active',active);
    button.setAttribute('aria-current',active?'page':'false');
  });
  window.scrollTo({top:0,behavior:'smooth'});
}

async function enterApp(){
  document.querySelector('#publicHeader')?.setAttribute('hidden','');
  document.querySelector('#publicMain')?.setAttribute('hidden','');
  document.querySelector('#publicFooter')?.setAttribute('hidden','');
  const shell=document.querySelector('#appShell');
  if(shell)shell.hidden=false;
  setText('#signedInAs',currentEmail());
  switchView('dashboard');
  await loadWorkspaceData();
}

async function leaveApp(){
  const session=readSession();
  try{
    await revokeSession(session);
  }catch(error){
    console.warn('CareerLaunch remote sign out could not be confirmed',error);
  }finally{
    localStorage.removeItem(SESSION_KEY);
  }
  Object.assign(state,{
    profile:null,
    experience:[],
    education:[],
    skills:[],
    applications:[],
    shortlist:[],
    documents:[],
    packs:[],
    cvDraft:null,
    selectedOpportunity:null,
    generatedAi:null,
    manualPreviewText:'',
    aiConversation:[]
  });
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
document.querySelector('#signOutBtn')?.addEventListener('click',async event=>{
  const button=event.currentTarget;
  button.disabled=true;
  try{
    await leaveApp();
  }finally{
    button.disabled=false;
  }
});

if('serviceWorker'in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
}

/* Authentication */
const signupForm=document.querySelector('#signupForm');
signupForm?.addEventListener('submit',async event=>{
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
      signupForm.reset();
      await enterApp();
    }else{
      output.textContent='Account created, but email confirmation is still required by the authentication service.';
    }
  }catch(error){
    output.textContent=error?.message||'We could not create your account right now.';
  }finally{
    submit.disabled=false;
  }
});

const signinForm=document.querySelector('#signinForm');
signinForm?.addEventListener('submit',async event=>{
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
    signinForm.reset();
    await enterApp();
  }catch(error){
    output.textContent=error?.message||'Sign in failed. Check your email address and password.';
  }finally{
    submit.disabled=false;
  }
});

/* Data loading */
async function loadWorkspaceData(){
  if(state.loading)return;
  state.loading=true;
  try{
    await Promise.all([
      loadProfileAndEvidence(),
      loadOpportunities(),
      loadApplications(),
      loadShortlist(),
      loadDocuments(),
      loadApplicationPacks(),
      loadCvDraft()
    ]);
    renderAll();
  }catch(error){
    console.error('CareerLaunch workspace load failed',error);
    setText('#opportunityStatus',error.message||'Some live data could not be loaded.');
  }finally{
    state.loading=false;
  }
}

async function loadProfileAndEvidence(){
  const userId=currentUserId();
  if(!userId)return;
  const encoded=encodeURIComponent(userId);
  const [profile,experience,education,skills]=await Promise.all([
    dbRequest(`profiles?select=*&user_id=eq.${encoded}&limit=1`),
    dbRequest(`candidate_experience?select=*&user_id=eq.${encoded}&order=created_at.desc`),
    dbRequest(`candidate_education?select=*&user_id=eq.${encoded}&order=created_at.desc`),
    dbRequest(`candidate_skills?select=*&user_id=eq.${encoded}&order=created_at.desc`)
  ]);
  state.profile=profile?.[0]||null;
  state.experience=experience||[];
  state.education=education||[];
  state.skills=skills||[];
}

async function loadOpportunities(){
  const data=await dbRequest('opportunities?select=*&status=eq.open&order=closing_date.asc.nullslast');
  state.opportunities=(Array.isArray(data)?data:[]).filter(item=>!isExpired(item));
}

async function loadApplications(){
  const userId=currentUserId();
  if(!userId)return;
  state.applications=await dbRequest(
    `applications?select=*&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`
  )||[];
}

async function loadShortlist(){
  const userId=currentUserId();
  if(!userId)return;
  const rows=await dbRequest(
    `shortlisted_opportunities?select=id,created_at,opportunity_id,opportunities(*)&user_id=eq.${encodeURIComponent(userId)}&order=created_at.asc`
  );
  state.shortlist=Array.isArray(rows)?rows:[];
}

async function loadDocuments(){
  const userId=currentUserId();
  if(!userId)return;
  state.documents=await dbRequest(
    `candidate_documents?select=*&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`
  )||[];
}

async function loadApplicationPacks(){
  const userId=currentUserId();
  if(!userId)return;
  state.packs=await dbRequest(
    `application_packs?select=*&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`
  )||[];
}

async function loadCvDraft(){
  const userId=currentUserId();
  if(!userId)return;
  const rows=await dbRequest(`cv_drafts?select=*&user_id=eq.${encodeURIComponent(userId)}&limit=1`);
  state.cvDraft=rows?.[0]||null;
  const content=state.cvDraft?.content||{};
  state.selections.roles=Array.isArray(content.target_roles)?content.target_roles:[];
  state.selections.strengths=Array.isArray(content.strengths)?content.strengths:[];
  state.selections.skills=Array.isArray(content.skills)?content.skills:[];
}

function renderAll(){
  hydrateProfileForm();
  hydrateManualCv();
  hydrateSelectionState();
  renderEvidenceLists();
  renderOpportunityList();
  renderStudyList();
  renderApplications();
  renderShortlist();
  renderDocuments();
  renderJobSites();
  renderLibrary();
  renderApplicationForms();
  renderAiConversation();
  renderDashboard();
  populateAiVacancySelect();
}

/* Profile */
function hydrateProfileForm(){
  const profile=state.profile||{};
  const values={
    profileName:profile.full_name||'',
    profilePhone:profile.phone||'',
    profileAltPhone:profile.alternative_phone||'',
    profileCity:profile.city||'',
    profileProvince:profile.province||'',
    profileAddress:profile.address_text||'',
    profileSummary:profile.summary||''
  };
  Object.entries(values).forEach(([id,value])=>{
    const field=document.getElementById(id);
    if(field)field.value=value;
  });
  const storedRoles=Array.isArray(profile.cv_builder_state?.profile_roles)
    ?profile.cv_builder_state.profile_roles
    :profile.headline?[profile.headline]:[];
  state.selections.profileRoles=[...storedRoles];
  profileRoleMulti?.renderChips();
  setValue('#profileRoleOther',profile.cv_builder_state?.profile_other_role||'');
  const profileOtherWrap=document.querySelector('#profileRoleOtherWrap');
  if(profileOtherWrap)profileOtherWrap.hidden=!profile.cv_builder_state?.profile_other_role;
  const matric=document.querySelector('#profileMatriculant');
  if(matric)matric.checked=Boolean(profile.is_matriculant);
}

document.querySelector('#profileForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const output=document.querySelector('#profileResult');
  const userId=currentUserId();
  if(!userId)return;
  const fullName=document.querySelector('#profileName')?.value.trim()||state.profile?.full_name||'';
  if(!fullName){
    output.textContent='You can skip this for now. Add a full name when you want to save the profile section.';
    return;
  }
  const payload={
    user_id:userId,
    full_name:fullName,
    email:currentEmail(),
    phone:valueOrNull('#profilePhone'),
    alternative_phone:valueOrNull('#profileAltPhone'),
    city:valueOrNull('#profileCity'),
    province:document.querySelector('#profileProvince')?.value||null,
    country:'South Africa',
    address_text:valueOrNull('#profileAddress'),
    headline:selectionValues('profileRoles').join(' / ')||null,
    summary:valueOrNull('#profileSummary'),
    is_matriculant:Boolean(document.querySelector('#profileMatriculant')?.checked),
    cv_builder_state:{
      ...(state.profile?.cv_builder_state||{}),
      profile_roles:selectionValues('profileRoles'),
      profile_other_role:valueOrNull('#profileRoleOther')
    },
    updated_at:new Date().toISOString()
  };
  try{
    const saved=await dbRequest('profiles?on_conflict=user_id',{
      method:'POST',
      body:payload,
      prefer:'resolution=merge-duplicates,return=representation'
    });
    state.profile=saved?.[0]||payload;
    output.textContent='Profile saved securely to CareerLaunch.';
    hydrateManualCv();
    renderDashboard();
  }catch(error){
    output.textContent=error.message||'Could not save profile.';
  }
});

function valueOrNull(selector){
  const value=document.querySelector(selector)?.value?.trim();
  return value||null;
}

/* Evidence records */
function renderEvidenceLists(){
  renderRecords('#experienceList',state.experience,item=>[item.job_title,item.employer,item.description],{
    table:'candidate_experience',stateKey:'experience',label:'experience'
  });
  renderRecords('#educationList',state.education,item=>[item.qualification,item.institution,item.field_of_study],{
    table:'candidate_education',stateKey:'education',label:'education'
  });
  renderRecords('#skillList',state.skills,item=>[item.skill_name,item.evidence],{
    table:'candidate_skills',stateKey:'skills',label:'skill / evidence'
  });
  renderRecords('#manualExperienceList',state.experience,item=>[item.job_title,item.employer,item.description],{
    table:'candidate_experience',stateKey:'experience',label:'experience'
  });
  renderRecords('#manualEducationList',state.education,item=>[
    item.qualification,
    item.institution,
    [item.field_of_study,...(item.subjects||[])].filter(Boolean).join(' • ')
  ],{
    table:'candidate_education',stateKey:'education',label:'education'
  });
}

function renderRecords(selector,records,toLines,removeConfig=null){
  const container=document.querySelector(selector);
  if(!container)return;
  clear(container);
  if(!records.length){
    container.append(make('p',{className:'muted',text:'Nothing saved yet.'}));
    return;
  }
  records.forEach(record=>{
    const card=make('article',{className:'mini-record'});
    const body=make('div',{className:'mini-record-body'});
    toLines(record).filter(Boolean).forEach((line,index)=>{
      body.append(make(index===0?'strong':'span',{text:String(line)}));
    });
    card.append(body);
    if(removeConfig&&record.id){
      const remove=make('button',{className:'button button-danger button-small',text:'Remove'});
      remove.type='button';
      remove.addEventListener('click',()=>removeOwnedRecord(removeConfig,record));
      card.append(remove);
    }
    container.append(card);
  });
}

async function removeOwnedRecord(config,record){
  const label=config.label||'item';
  if(!confirm(`Remove this ${label}? This cannot be undone.`))return;
  try{
    await dbRequest(`${config.table}?id=eq.${encodeURIComponent(record.id)}`,{method:'DELETE'});
    state[config.stateKey]=state[config.stateKey].filter(item=>item.id!==record.id);
    renderEvidenceLists();
    renderDashboard();
    setText('#profileResult',`Removed ${label}.`);
  }catch(error){
    setText('#profileResult',error.message||`Could not remove ${label}.`);
  }
}

async function addExperience(payload){
  const saved=await dbRequest('candidate_experience',{
    method:'POST',
    body:{user_id:currentUserId(),...payload},
    prefer:'return=representation'
  });
  state.experience=[...(saved||[]),...state.experience];
  renderEvidenceLists();
  renderDashboard();
}

async function addEducation(payload){
  const saved=await dbRequest('candidate_education',{
    method:'POST',
    body:{user_id:currentUserId(),...payload},
    prefer:'return=representation'
  });
  state.education=[...(saved||[]),...state.education];
  renderEvidenceLists();
  renderDashboard();
}

document.querySelector('#experienceForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const employer=valueOrNull('#experienceEmployer');
  const jobTitle=valueOrNull('#experienceTitle');
  if(!employer&&!jobTitle)return;
  try{
    await addExperience({
      employer:employer||'Not provided',
      job_title:jobTitle||'Role not provided',
      description:valueOrNull('#experienceDescription')
    });
    event.currentTarget.reset();
  }catch(error){
    setText('#profileResult',error.message||'Could not save experience.');
  }
});

document.querySelector('#educationForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const institution=valueOrNull('#educationInstitution');
  const qualification=valueOrNull('#educationQualification');
  if(!institution&&!qualification)return;
  try{
    await addEducation({
      institution:institution||'Not provided',
      qualification:qualification||'Qualification not provided',
      field_of_study:valueOrNull('#educationField')
    });
    event.currentTarget.reset();
  }catch(error){
    setText('#profileResult',error.message||'Could not save education.');
  }
});

document.querySelector('#skillForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const skillName=valueOrNull('#skillName');
  if(!skillName)return;
  try{
    const saved=await dbRequest('candidate_skills',{
      method:'POST',
      body:{
        user_id:currentUserId(),
        skill_name:skillName,
        evidence:valueOrNull('#skillEvidence')
      },
      prefer:'return=representation'
    });
    state.skills=[...(saved||[]),...state.skills];
    event.currentTarget.reset();
    renderEvidenceLists();
    renderDashboard();
  }catch(error){
    setText('#profileResult',error.message||'Could not save skill.');
  }
});

/* Searchable multi-selects */
function setupMultiSelect({key,input,menu,chips,otherWrap,otherInput,options}){
  const inputEl=document.querySelector(input);
  const menuEl=document.querySelector(menu);
  const chipsEl=document.querySelector(chips);
  const otherWrapEl=document.querySelector(otherWrap);
  const otherInputEl=document.querySelector(otherInput);
  if(!inputEl||!menuEl||!chipsEl)return;

  const renderMenu=()=>{
    const query=inputEl.value.trim().toLowerCase();
    const visible=options
      .filter(item=>!query||item.toLowerCase().includes(query))
      .filter(item=>item==='Other'||!state.selections[key].includes(item))
      .slice(0,30);
    clear(menuEl);
    visible.forEach(item=>{
      const button=make('button',{className:'option-item',text:item});
      button.type='button';
      button.addEventListener('mousedown',event=>{
        event.preventDefault();
        if(item==='Other'){
          otherWrapEl.hidden=false;
          otherInputEl?.focus();
        }else{
          state.selections[key]=[...state.selections[key],item];
          inputEl.value='';
          renderChips();
        }
        renderMenu();
      });
      menuEl.append(button);
    });
    menuEl.hidden=visible.length===0;
  };

  const renderChips=()=>{
    clear(chipsEl);
    state.selections[key].forEach(item=>{
      const chip=make('span',{className:'chip'});
      chip.append(make('span',{text:item}));
      const remove=make('button',{text:'×',attrs:{'aria-label':`Remove ${item}`}});
      remove.type='button';
      remove.addEventListener('click',()=>{
        state.selections[key]=state.selections[key].filter(value=>value!==item);
        renderChips();
      });
      chip.append(remove);
      chipsEl.append(chip);
    });
  };

  inputEl.addEventListener('focus',renderMenu);
  inputEl.addEventListener('input',renderMenu);
  inputEl.addEventListener('keydown',event=>{
    if(event.key==='Enter'){
      event.preventDefault();
      const first=menuEl.querySelector('.option-item');
      first?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
    }
    if(event.key==='Escape')menuEl.hidden=true;
  });
  inputEl.addEventListener('blur',()=>setTimeout(()=>{menuEl.hidden=true;},150));
  otherInputEl?.addEventListener('input',()=>{});
  return {renderChips};
}

const profileRoleMulti=setupMultiSelect({
  key:'profileRoles',input:'#profileRoleSearch',menu:'#profileRoleOptions',chips:'#profileRoleChips',
  otherWrap:'#profileRoleOtherWrap',otherInput:'#profileRoleOther',options:ROLE_OPTIONS
});
const roleMulti=setupMultiSelect({
  key:'roles',input:'#roleSearch',menu:'#roleOptions',chips:'#roleChips',
  otherWrap:'#roleOtherWrap',otherInput:'#roleOther',options:ROLE_OPTIONS
});
const strengthMulti=setupMultiSelect({
  key:'strengths',input:'#strengthSearch',menu:'#strengthOptions',chips:'#strengthChips',
  otherWrap:'#strengthOtherWrap',otherInput:'#strengthOther',options:STRENGTH_OPTIONS
});
const skillMulti=setupMultiSelect({
  key:'skills',input:'#skillSearchCv',menu:'#skillOptionsCv',chips:'#skillChipsCv',
  otherWrap:'#skillOtherWrap',otherInput:'#skillOtherCv',options:SKILL_OPTIONS
});

function selectionValues(key){
  const values=[...state.selections[key]];
  const otherMap={
    profileRoles:'#profileRoleOther',
    roles:'#roleOther',
    strengths:'#strengthOther',
    skills:'#skillOtherCv'
  };
  const other=valueOrNull(otherMap[key]);
  if(other&&!values.includes(other))values.push(other);
  return values;
}

function hydrateSelectionState(){
  profileRoleMulti?.renderChips();
  roleMulti?.renderChips();
  strengthMulti?.renderChips();
  skillMulti?.renderChips();
  const content=state.cvDraft?.content||{};
  setChecked('#noExperienceYet',Boolean(content.no_experience_yet));
  setChecked('#firstJobMode',Boolean(content.first_job_mode));
  setValue('#cvExperienceNotes',content.experience_notes||'');
  setValue('#roleOther',content.other_role||'');
  setValue('#strengthOther',content.other_strength||'');
  setValue('#skillOtherCv',content.other_skill||'');
  document.querySelector('#roleOtherWrap').hidden=!content.other_role;
  document.querySelector('#strengthOtherWrap').hidden=!content.other_strength;
  document.querySelector('#skillOtherWrap').hidden=!content.other_skill;
}

function setValue(selector,value){
  const node=document.querySelector(selector);
  if(node)node.value=value??'';
}
function setChecked(selector,value){
  const node=document.querySelector(selector);
  if(node)node.checked=Boolean(value);
}

/* Expanded manual CV builder */
function hydrateManualCv(){
  const profile=state.profile||{};
  const content=state.cvDraft?.content||{};
  setValue('#manualName',profile.full_name||content.full_name||'');
  setValue('#manualEmail',profile.email||currentEmail());
  setValue('#manualPhone',profile.phone||content.phone||'');
  setValue('#manualAltPhone',profile.alternative_phone||content.alternative_phone||'');
  setValue('#manualLocation',[profile.city,profile.province].filter(Boolean).join(', ')||content.location||'');
  setValue('#manualAddress',profile.address_text||content.address||'');
  setValue('#manualSummary',profile.summary||content.professional_summary||'');
  setValue('#manualCoreSkills',(content.core_skills||state.skills.map(item=>item.skill_name)).join(', '));
  setValue('#manualLanguages',(profile.languages||content.languages||[]).join(', '));
  setValue('#manualAvailability',profile.availability||content.availability||'');
  const references=profile.references||content.references||[];
  setValue('#manualReferences',references.map(item=>typeof item==='string'?item:item?.text||'').filter(Boolean).join('\n'));
}

function buildCvDraftContent(){
  return {
    ...(state.cvDraft?.content||{}),
    full_name:valueOrNull('#manualName'),
    email:valueOrNull('#manualEmail')||currentEmail(),
    phone:valueOrNull('#manualPhone'),
    alternative_phone:valueOrNull('#manualAltPhone'),
    location:valueOrNull('#manualLocation'),
    address:valueOrNull('#manualAddress'),
    professional_summary:valueOrNull('#manualSummary'),
    core_skills:splitCsv(valueOrNull('#manualCoreSkills')),
    languages:splitCsv(valueOrNull('#manualLanguages')),
    availability:valueOrNull('#manualAvailability'),
    references:(document.querySelector('#manualReferences')?.value||'')
      .split('\n').map(v=>v.trim()).filter(Boolean).map(text=>({text})),
    target_roles:selectionValues('roles'),
    strengths:selectionValues('strengths'),
    skills:selectionValues('skills'),
    other_role:valueOrNull('#roleOther'),
    other_strength:valueOrNull('#strengthOther'),
    other_skill:valueOrNull('#skillOtherCv'),
    no_experience_yet:Boolean(document.querySelector('#noExperienceYet')?.checked),
    first_job_mode:Boolean(document.querySelector('#firstJobMode')?.checked),
    experience_notes:valueOrNull('#cvExperienceNotes'),
    ofo_source_note:OFO_SOURCE_NOTE
  };
}

function splitCsv(value){
  return String(value||'').split(',').map(v=>v.trim()).filter(Boolean);
}

async function saveCvDraft(){
  const content=buildCvDraftContent();
  const rows=await dbRequest('cv_drafts?on_conflict=user_id',{
    method:'POST',
    body:{user_id:currentUserId(),content,updated_at:new Date().toISOString()},
    prefer:'resolution=merge-duplicates,return=representation'
  });
  state.cvDraft=rows?.[0]||{user_id:currentUserId(),content};
  return content;
}

async function saveManualProfileFields(content){
  const existing=state.profile||{};
  const fullName=content.full_name||existing.full_name;
  if(!fullName)return;
  const payload={
    user_id:currentUserId(),
    full_name:fullName,
    email:content.email||existing.email||currentEmail(),
    phone:content.phone||existing.phone||null,
    alternative_phone:content.alternative_phone||existing.alternative_phone||null,
    city:existing.city||content.location||null,
    province:existing.province||null,
    country:existing.country||'South Africa',
    address_text:content.address||existing.address_text||null,
    headline:existing.headline||selectionValues('roles')[0]||null,
    summary:content.professional_summary||existing.summary||null,
    is_matriculant:Boolean(existing.is_matriculant||content.first_job_mode),
    languages:content.languages||existing.languages||[],
    availability:content.availability||existing.availability||null,
    references:content.references||existing.references||[],
    cv_builder_state:{
      target_roles:content.target_roles,
      strengths:content.strengths,
      skills:content.skills
    },
    updated_at:new Date().toISOString()
  };
  const rows=await dbRequest('profiles?on_conflict=user_id',{
    method:'POST',
    body:payload,
    prefer:'resolution=merge-duplicates,return=representation'
  });
  state.profile=rows?.[0]||payload;
}

document.querySelector('#manualCvForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const output=document.querySelector('#manualCvResult');
  output.textContent='Saving your CV draft…';
  try{
    const content=await saveCvDraft();
    await saveManualProfileFields(content);
    output.textContent='CV draft saved to your private CareerLaunch account.';
    state.manualPreviewText=buildManualCvText();
    renderManualPreview();
    renderDashboard();
  }catch(error){
    output.textContent=error.message||'Could not save the CV draft.';
  }
});

document.querySelector('#previewManualCv')?.addEventListener('click',()=>{
  state.manualPreviewText=buildManualCvText();
  renderManualPreview();
});

function buildManualCvText(){
  const content=buildCvDraftContent();
  const name=content.full_name||state.profile?.full_name||'';
  const lines=[];
  lines.push(name?`CURRICULUM VITAE OF ${name.toUpperCase()}`:'CURRICULUM VITAE');
  lines.push('');
  lines.push('CONTACT DETAILS');
  const contacts=[
    content.phone,
    content.alternative_phone&&`Alternative: ${content.alternative_phone}`,
    content.email,
    content.location,
    content.address
  ].filter(Boolean);
  if(contacts.length)lines.push(...contacts);
  else lines.push('Contact details not yet provided.');
  lines.push('');
  lines.push('PROFESSIONAL SUMMARY');
  lines.push(content.professional_summary||'Professional summary not yet provided.');
  lines.push('');

  if(content.target_roles.length){
    lines.push('CAREER INTERESTS');
    lines.push(content.target_roles.join(' • '));
    lines.push('');
  }

  lines.push('WORK EXPERIENCE');
  if(state.experience.length){
    state.experience.forEach(item=>{
      const dates=[item.start_date,item.end_date].filter(Boolean).join(' – ');
      lines.push(`${item.job_title||'Role'} — ${item.employer||'Employer'}${dates?` (${dates})`:''}`);
      if(item.location)lines.push(item.location);
      if(item.description)lines.push(item.description);
      if(item.achievements?.length)lines.push(...item.achievements.map(v=>`• ${v}`));
      lines.push('');
    });
  }else if(content.no_experience_yet||content.first_job_mode){
    lines.push('No formal work experience provided yet.');
    if(content.experience_notes)lines.push(content.experience_notes);
    lines.push('');
  }else{
    lines.push('No work experience entered.');
    lines.push('');
  }

  lines.push('EDUCATION');
  if(state.education.length){
    state.education.forEach(item=>{
      lines.push(`${item.qualification||'Qualification'} — ${item.institution||'Institution'}`);
      if(item.field_of_study)lines.push(item.field_of_study);
      if(item.subjects?.length)lines.push(`Subjects: ${item.subjects.join(', ')}`);
      if(item.result_summary)lines.push(item.result_summary);
      lines.push('');
    });
  }else{
    lines.push('No education entered.');
    lines.push('');
  }

  const combinedSkills=[
    ...content.core_skills,
    ...content.skills,
    ...state.skills.map(item=>item.skill_name)
  ].filter(Boolean);
  lines.push('CORE SKILLS');
  lines.push(combinedSkills.length?[...new Set(combinedSkills)].join(' • '):'No skills selected yet.');
  lines.push('');

  if(content.strengths.length){
    lines.push('STRENGTHS');
    lines.push(content.strengths.join(' • '));
    lines.push('');
  }

  lines.push('LANGUAGES');
  lines.push(content.languages.length?content.languages.join(' • '):'Not provided.');
  lines.push('');
  lines.push('AVAILABILITY');
  lines.push(content.availability||'Not provided.');
  lines.push('');
  lines.push('REFERENCES');
  lines.push(content.references.length?content.references.map(item=>item.text).join('\n'):'Available on request / not provided.');
  return lines.join('\n').trim();
}

function renderManualPreview(){
  const preview=document.querySelector('#manualCvPreview');
  if(!preview)return;
  clear(preview);
  preview.append(make('pre',{text:state.manualPreviewText||buildManualCvText()}));
  preview.hidden=false;
  document.querySelector('#manualExportActions').hidden=false;
}

document.querySelector('#addManualExperience')?.addEventListener('click',()=>{
  const editor=document.querySelector('#manualExperienceEditor');
  editor.hidden=!editor.hidden;
});
document.querySelector('#saveManualExperience')?.addEventListener('click',async()=>{
  const employer=valueOrNull('#manualExperienceEmployer');
  const title=valueOrNull('#manualExperienceTitle');
  if(!employer&&!title)return;
  try{
    await addExperience({
      employer:employer||'Not provided',
      job_title:title||'Role not provided',
      start_date:valueOrNull('#manualExperienceStart'),
      end_date:valueOrNull('#manualExperienceEnd'),
      location:valueOrNull('#manualExperienceLocation'),
      description:valueOrNull('#manualExperienceDescription')
    });
    ['#manualExperienceEmployer','#manualExperienceTitle','#manualExperienceStart','#manualExperienceEnd','#manualExperienceLocation','#manualExperienceDescription']
      .forEach(selector=>setValue(selector,''));
  }catch(error){
    setText('#manualCvResult',error.message||'Could not save experience.');
  }
});

document.querySelector('#addManualEducation')?.addEventListener('click',()=>{
  const editor=document.querySelector('#manualEducationEditor');
  editor.hidden=!editor.hidden;
});
document.querySelector('#saveManualEducation')?.addEventListener('click',async()=>{
  const institution=valueOrNull('#manualEducationInstitution');
  const qualification=valueOrNull('#manualEducationQualification');
  if(!institution&&!qualification)return;
  try{
    await addEducation({
      institution:institution||'Not provided',
      qualification:qualification||'Qualification not provided',
      field_of_study:valueOrNull('#manualEducationField'),
      status:valueOrNull('#manualEducationStatus'),
      subjects:splitCsv(valueOrNull('#manualEducationSubjects'))
    });
    ['#manualEducationInstitution','#manualEducationQualification','#manualEducationField','#manualEducationStatus','#manualEducationSubjects']
      .forEach(selector=>setValue(selector,''));
  }catch(error){
    setText('#manualCvResult',error.message||'Could not save education.');
  }
});

/* Uploads */
async function extractTextFromFile(file){
  const lower=file.name.toLowerCase();
  if(file.type==='text/plain'||lower.endsWith('.txt')){
    return (await file.text()).slice(0,60000);
  }
  if(lower.endsWith('.docx')&&window.JSZip){
    const zip=await window.JSZip.loadAsync(await file.arrayBuffer());
    const xml=await zip.file('word/document.xml')?.async('string');
    if(!xml)return '';
    const doc=new DOMParser().parseFromString(xml,'application/xml');
    return [...doc.getElementsByTagNameNS('*','t')]
      .map(node=>node.textContent||'')
      .join(' ')
      .replace(/\s+/g,' ')
      .trim()
      .slice(0,60000);
  }
  if(file.type==='application/pdf'||lower.endsWith('.pdf')){
    try{
      const pdfjs=await import(PDFJS_URL);
      pdfjs.GlobalWorkerOptions.workerSrc=PDFJS_WORKER_URL;
      const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
      const pages=[];
      for(let pageNo=1;pageNo<=Math.min(pdf.numPages,40);pageNo++){
        const page=await pdf.getPage(pageNo);
        const content=await page.getTextContent();
        pages.push(content.items.map(item=>item.str).join(' '));
      }
      return pages.join('\n').slice(0,60000);
    }catch(error){
      console.warn('PDF text extraction unavailable',error);
      return '';
    }
  }
  return '';
}

function safeFileName(name){
  return name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').slice(0,120)||'document';
}

async function uploadCandidateDocument(file,documentType){
  const config=authConfig();
  const session=await ensureSession();
  if(!session?.session_token)throw new Error('Your session has expired.');
  const userId=currentUserId();
  const path=`${userId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const response=await fetch(`${config.SUPABASE_URL}/storage/v1/object/candidate-documents/${path}`,{
    method:'POST',
    headers:{
      apikey:config.SUPABASE_PUBLISHABLE_KEY,
      Authorization:`Bearer ${session.session_token}`,
      'Content-Type':file.type||'application/octet-stream',
      'x-upsert':'false'
    },
    body:file
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data?.message||data?.error||'Document upload failed.');
  const extractedText=await extractTextFromFile(file);
  const rows=await dbRequest('candidate_documents',{
    method:'POST',
    body:{
      user_id:userId,
      document_type:documentType,
      file_name:file.name,
      storage_path:path,
      verified:false,
      metadata:{
        mime_type:file.type||null,
        size:file.size,
        extracted_text:extractedText||null,
        text_extraction:extractedText?'available':'not_available'
      }
    },
    prefer:'return=representation'
  });
  state.documents=[...(rows||[]),...state.documents];
  renderDocuments();
  return {extractedText};
}

document.querySelector('#documentUploadForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const input=document.querySelector('#documentFile');
  const output=document.querySelector('#documentUploadResult');
  const files=[...(input?.files||[])];
  if(!files.length){
    output.textContent='Choose one or more documents first.';
    return;
  }
  const oversized=files.find(file=>file.size>15*1024*1024);
  if(oversized){
    output.textContent=oversized.name+' exceeds the 15 MB upload limit.';
    return;
  }
  const button=event.currentTarget.querySelector('button[type="submit"]');
  button.disabled=true;
  let completed=0;
  try{
    for(const file of files){
      output.textContent='Uploading '+file.name+' securely and extracting usable text where supported…';
      await uploadCandidateDocument(file,document.querySelector('#documentType')?.value||'other');
      completed++;
    }
    output.textContent=completed+' document'+(completed===1?'':'s')+' uploaded to your private CareerLaunch storage.';
    event.currentTarget.reset();
  }catch(error){
    output.textContent=error.message||'Could not upload document.';
  }finally{
    button.disabled=false;
  }
});

function renderDocuments(){
  const list=document.querySelector('#documentList');
  if(!list)return;
  clear(list);
  if(!state.documents.length){
    list.append(make('p',{className:'muted',text:'No documents uploaded yet.'}));
    return;
  }
  state.documents.forEach(doc=>{
    const hasText=Boolean(doc.metadata?.extracted_text);
    const card=make('article',{className:'mini-record'});
    card.append(
      make('strong',{text:doc.file_name}),
      make('span',{text:`${doc.document_type} • ${hasText?'text available to AI':'stored securely'}`}),
      make('span',{text:`Uploaded ${formatDateTime(doc.created_at)}`})
    );
    const remove=make('button',{className:'button button-danger button-small',text:'Remove document'});
    remove.type='button';
    remove.addEventListener('click',()=>removeDocument(doc));
    card.append(remove);
    list.append(card);
  });
}

async function removeDocument(doc){
  if(!confirm(`Remove ${doc.file_name} from your CareerLaunch library?`))return;
  const config=authConfig();
  const session=await ensureSession();
  if(!session?.session_token)return;
  try{
    if(doc.storage_path){
      const storageResponse=await fetch(
        `${config.SUPABASE_URL}/storage/v1/object/candidate-documents/${doc.storage_path}`,
        {
          method:'DELETE',
          headers:{
            apikey:config.SUPABASE_PUBLISHABLE_KEY,
            Authorization:`Bearer ${session.session_token}`
          }
        }
      );
      if(!storageResponse.ok&&storageResponse.status!==404){
        const data=await storageResponse.json().catch(()=>({}));
        throw new Error(data?.message||'Could not remove stored document.');
      }
    }
    await dbRequest(`candidate_documents?id=eq.${encodeURIComponent(doc.id)}`,{method:'DELETE'});
    state.documents=state.documents.filter(item=>item.id!==doc.id);
    renderDocuments();
    renderLibrary();
  }catch(error){
    setText('#libraryStatus',error.message||'Could not remove document.');
  }
}

/* Opportunities and shortlist */
function filteredOpportunities(){
  const type=document.querySelector('#opportunityTypeFilter')?.value||'';
  const province=document.querySelector('#opportunityProvinceFilter')?.value||'';
  const search=(document.querySelector('#opportunitySearch')?.value||'').trim().toLowerCase();
  return state.opportunities.filter(item=>{
    if(isExpired(item))return false;
    if(type&&item.opportunity_type!==type)return false;
    if(province&&item.province!==province)return false;
    if(search){
      const haystack=[item.title,item.organization,item.location,item.province,item.description,item.reference_number]
        .filter(Boolean).join(' ').toLowerCase();
      if(!haystack.includes(search))return false;
    }
    return true;
  });
}

function renderOpportunityList(){
  const list=document.querySelector('#opportunityList');
  const status=document.querySelector('#opportunityStatus');
  if(!list||!status)return;
  clear(list);
  const items=filteredOpportunities();
  status.textContent=`${items.length} current verified opportunit${items.length===1?'y':'ies'} shown.`;
  if(!items.length){
    list.append(make('div',{className:'empty-state',text:'No researched opportunity currently matches these filters.'}));
    return;
  }
  items.forEach(item=>list.append(buildOpportunityCard(item)));
}

function buildOpportunityCard(item,{shortlistView=false}={}){
  const card=make('article',{className:'opportunity-card',attrs:{'data-opportunity-id':item.id}});
  const heading=make('div',{className:'opportunity-heading'});
  const titleWrap=make('div');
  titleWrap.append(
    make('span',{className:'badge',text:prettyType(item.opportunity_type)}),
    make('h3',{text:item.title}),
    make('p',{className:'muted',text:[item.organization,item.location,item.province].filter(Boolean).join(' • ')})
  );
  const deadline=make('div',{className:'deadline'});
  deadline.append(make('span',{text:'Closing'}),make('strong',{text:formatDate(item.closing_date)}));
  heading.append(titleWrap,deadline);
  card.append(heading);
  if(item.salary_or_stipend)card.append(make('p',{className:'salary',text:item.salary_or_stipend}));
  if(item.description)card.append(make('p',{text:item.description}));
  if(item.reference_number)card.append(make('p',{className:'meta',text:`Reference: ${item.reference_number}`}));
  card.append(make('p',{className:'meta',text:`Source: ${item.source_name||'Official source'} • verified ${formatDateTime(item.verified_at)}`}));

  const actions=make('div',{className:'card-actions'});
  actions.append(make('a',{
    className:'button button-secondary button-small',
    text:'Open official source',
    attrs:{href:item.source_url,target:'_blank',rel:'noopener noreferrer'}
  }));

  const isFunding=['bursary','scholarship','study','learnership','apprenticeship','internship'].includes(item.opportunity_type);
  const ai=make('button',{
    className:'button button-small',
    text:isFunding?'AI application assistant':'AI role-specific CV'
  });
  ai.type='button';
  ai.addEventListener('click',()=>prepareAssistantForOpportunity(item));
  actions.append(ai);

  if(shortlistView){
    const remove=make('button',{className:'button button-danger button-small',text:'Remove'});
    remove.type='button';
    remove.addEventListener('click',()=>removeFromShortlist(item.id));
    actions.append(remove);
    const applied=make('button',{className:'button button-small',text:'Mark applied'});
    applied.type='button';
    applied.addEventListener('click',()=>markOpportunityApplied(item));
    actions.append(applied);
  }else{
    const row=state.shortlist.find(entry=>entry.opportunity_id===item.id);
    const shortlistButton=make('button',{
      className:'button button-secondary button-small',
      text:row?'Shortlisted':'Shortlist'
    });
    shortlistButton.type='button';
    shortlistButton.disabled=Boolean(row);
    shortlistButton.addEventListener('click',()=>addToShortlist(item));
    actions.append(shortlistButton);
  }

  card.append(actions);
  return card;
}

function prettyType(type){
  return ({
    job:'Job',government_job:'Government job',learnership:'Learnership',
    apprenticeship:'Apprenticeship',internship:'Internship',bursary:'Bursary',
    scholarship:'Scholarship',study:'Study'
  })[type]||type||'Opportunity';
}

['#opportunityTypeFilter','#opportunityProvinceFilter'].forEach(selector=>{
  document.querySelector(selector)?.addEventListener('change',renderOpportunityList);
});
document.querySelector('#opportunitySearch')?.addEventListener('keydown',event=>{
  if(event.key==='Enter'){
    event.preventDefault();
    renderOpportunityList();
  }
});
document.querySelector('#opportunitySearchBtn')?.addEventListener('click',renderOpportunityList);
document.querySelector('#opportunityResetBtn')?.addEventListener('click',()=>{
  setValue('#opportunitySearch','');
  setValue('#opportunityTypeFilter','');
  setValue('#opportunityProvinceFilter','');
  renderOpportunityList();
});

async function addToShortlist(item){
  if(state.shortlist.length>=5){
    setText('#opportunityStatus','Your shortlist already has five vacancies. Remove one before adding another.');
    return;
  }
  try{
    const rows=await dbRequest('shortlisted_opportunities',{
      method:'POST',
      body:{user_id:currentUserId(),opportunity_id:item.id},
      prefer:'return=representation'
    });
    const row=rows?.[0];
    if(row)state.shortlist.push({...row,opportunities:item});
    renderShortlist();
    renderOpportunityList();
    renderDashboard();
    setText('#opportunityStatus',`Added ${item.title} to your shortlist.`);
  }catch(error){
    const message=String(error.message||'');
    setText('#opportunityStatus',message.includes('SHORTLIST_LIMIT_REACHED')
      ?'Your shortlist is limited to five vacancies.'
      :message||'Could not save shortlist item.');
  }
}

async function removeFromShortlist(opportunityId){
  const row=state.shortlist.find(entry=>entry.opportunity_id===opportunityId);
  if(!row)return;
  try{
    await dbRequest(`shortlisted_opportunities?id=eq.${encodeURIComponent(row.id)}`,{method:'DELETE'});
    state.shortlist=state.shortlist.filter(entry=>entry.id!==row.id);
    renderShortlist();
    renderOpportunityList();
    renderDashboard();
  }catch(error){
    setText('#shortlistStatus',error.message||'Could not remove shortlist item.');
  }
}

async function markOpportunityApplied(item){
  const userId=currentUserId();
  if(!userId)return;
  try{
    const existing=await dbRequest(
      `applications?select=*&user_id=eq.${encodeURIComponent(userId)}&opportunity_id=eq.${encodeURIComponent(item.id)}&order=created_at.desc&limit=1`
    );
    let saved;
    if(existing?.[0]){
      const rows=await dbRequest(`applications?id=eq.${encodeURIComponent(existing[0].id)}`,{
        method:'PATCH',
        body:{
          status:'submitted',
          submitted_at:existing[0].submitted_at||new Date().toISOString(),
          next_action:'Wait for employer feedback and record any interview or follow-up.',
          updated_at:new Date().toISOString()
        },
        prefer:'return=representation'
      });
      saved=rows?.[0]||existing[0];
      state.applications=state.applications.map(app=>app.id===saved.id?saved:app);
    }else{
      const rows=await dbRequest('applications',{
        method:'POST',
        body:{
          user_id:userId,
          opportunity_id:item.id,
          status:'submitted',
          submitted_at:new Date().toISOString(),
          next_action:'Wait for employer feedback and record any interview or follow-up.'
        },
        prefer:'return=representation'
      });
      saved=rows?.[0];
      if(saved)state.applications=[saved,...state.applications];
    }
    await removeFromShortlist(item.id);
    renderApplications();
    renderDashboard();
    switchView('applications');
    setText('#applicationStatus',`Recorded your application for ${item.title}. It was removed from the shortlist.`);
  }catch(error){
    setText('#shortlistStatus',error.message||'Could not move this vacancy to Applications.');
  }
}

function renderShortlist(){
  const list=document.querySelector('#shortlistList');
  const status=document.querySelector('#shortlistStatus');
  if(!list||!status)return;
  clear(list);
  setText('#shortlistCount',`${state.shortlist.length} / 5 saved`);
  if(!state.shortlist.length){
    status.textContent='No vacancies shortlisted yet.';
    list.append(make('div',{className:'empty-state',text:'Use the Shortlist button in Opportunities to save up to five priority vacancies.'}));
    return;
  }
  status.textContent='Shortlisted vacancies are kept even if a later refresh closes the listing, so your application history is preserved.';
  state.shortlist.forEach(entry=>{
    const item=entry.opportunities||state.opportunities.find(op=>op.id===entry.opportunity_id);
    if(item)list.append(buildOpportunityCard(item,{shortlistView:true}));
  });
}

/* Study and dashboard */
function renderStudyList(){
  const list=document.querySelector('#studyList');
  if(!list)return;
  clear(list);
  const items=state.opportunities.filter(item=>['bursary','scholarship','study'].includes(item.opportunity_type));
  if(!items.length){
    list.append(make('div',{className:'empty-state',text:'No verified study or funding opportunity is currently loaded.'}));
    return;
  }
  items.forEach(item=>list.append(buildOpportunityCard(item)));
}

function renderDashboard(){
  const profile=state.profile||{};
  const required=[profile.full_name,profile.phone,profile.city,profile.province,profile.headline];
  const profileBase=Math.round(required.filter(Boolean).length/required.length*70);
  const evidenceBonus=Math.min(30,(state.experience.length?10:0)+(state.education.length?10:0)+(state.skills.length?10:0));
  setText('#statProfile',`${Math.min(100,profileBase+evidenceBonus)}%`);
  setText('#statOpportunities',String(state.opportunities.length));
  setText('#statShortlist',`${state.shortlist.length} / 5`);
  const deadlines=state.opportunities
    .filter(item=>item.closing_date&&!isExpired(item))
    .map(item=>new Date(item.closing_date)).sort((a,b)=>a-b);
  setText('#statDeadline',deadlines.length?formatDate(deadlines[0]):'No dated deadline');

  const pulse=document.querySelector('#researchPulse');
  if(!pulse)return;
  clear(pulse);
  const recent=[...state.opportunities]
    .sort((a,b)=>new Date(b.verified_at||0)-new Date(a.verified_at||0))
    .slice(0,4);
  if(!recent.length){
    pulse.append(make('p',{className:'muted',text:'No verified opportunity research has been loaded yet.'}));
    return;
  }
  recent.forEach(item=>{
    const row=make('button',{className:'research-row'});
    row.type='button';
    row.append(make('strong',{text:item.title}),make('span',{text:`${item.organization} • verified ${formatDateTime(item.verified_at)}`}));
    row.addEventListener('click',()=>{
      switchView('jobs');
      document.querySelector(`[data-opportunity-id="${item.id}"]`)?.scrollIntoView({behavior:'smooth',block:'center'});
    });
    pulse.append(row);
  });
}

function applicationKindForOpportunity(item){
  if(!item)return 'job';
  if(item.opportunity_type==='government_job')return 'government';
  if(item.opportunity_type==='bursary')return 'bursary';
  if(item.opportunity_type==='scholarship')return 'scholarship';
  if(item.opportunity_type==='learnership')return 'learnership';
  if(item.opportunity_type==='internship'||item.opportunity_type==='apprenticeship')return 'internship';
  return 'job';
}

function prepareAssistantForOpportunity(item){
  state.selectedOpportunity=item;
  applySelectedOpportunity();
  const kind=applicationKindForOpportunity(item);
  setValue('#aiApplicationKind',kind);
  const instruction=kind==='bursary'||kind==='scholarship'
    ?`Help me prepare a complete funding application for ${item.title} at ${item.organization}, including a truthful motivational letter and document checklist.`
    :kind==='government'
      ?`Help me prepare a complete government application for ${item.title} at ${item.organization}, including my CV, cover letter and Z83 completion guidance. Do not sign or make declarations for me.`
      :`Help me prepare a role-specific CV and application package for ${item.title} at ${item.organization}.`;
  setValue('#aiPrompt',instruction);
  switchView('cv');
  document.querySelector('#aiCvAssistant')?.scrollIntoView({behavior:'smooth',block:'start'});
}

function renderAiConversation(){
  const container=document.querySelector('#aiChatMessages');
  if(!container)return;
  clear(container);
  if(!state.aiConversation.length){
    const welcome=make('article',{className:'chat-bubble assistant'});
    welcome.append(
      make('strong',{text:'CareerLaunch AI'}),
      make('p',{text:'Tell me what you want to apply for. Choose a vacancy, paste an advert, add a vacancy link, or name a role. I can use your saved details or interview you from scratch.'})
    );
    container.append(welcome);
    return;
  }
  state.aiConversation.forEach(message=>{
    const bubble=make('article',{className:`chat-bubble ${message.role==='user'?'user':'assistant'}`});
    bubble.append(
      make('strong',{text:message.role==='user'?'You':'CareerLaunch AI'}),
      make('p',{text:message.content})
    );
    container.append(bubble);
  });
  container.scrollTop=container.scrollHeight;
}

async function runAiConversation(userMessage,{restart=false}={}){
  const output=document.querySelector('#aiCvResult');
  const message=String(userMessage||'').trim();
  if(restart)state.aiConversation=[];
  if(message)state.aiConversation.push({role:'user',content:message});
  renderAiConversation();
  output.textContent='CareerLaunch AI is reviewing the application context…';
  try{
    const result=await functionRequest('generate-cv',{
      mode:'assistant',
      opportunity_id:document.querySelector('#aiVacancySelect')?.value||null,
      vacancy_text:valueOrNull('#aiVacancyText')||'',
      vacancy_url:valueOrNull('#aiVacancyUrl')||'',
      prompt:valueOrNull('#aiPrompt')||'',
      application_kind:document.querySelector('#aiApplicationKind')?.value||'job',
      use_existing_details:document.querySelector('#aiDetailSource')?.value!=='fresh',
      conversation:state.aiConversation,
      target_roles:selectionValues('roles'),
      strengths:selectionValues('strengths'),
      skills:selectionValues('skills')
    });
    const reply=String(result.assistant_message||'Tell me anything else that should be included.').trim();
    state.aiConversation.push({role:'assistant',content:reply});
    if(Array.isArray(result.questions)&&result.questions.length){
      state.aiConversation.push({
        role:'assistant',
        content:'Questions:\n'+result.questions.map((q,index)=>`${index+1}. ${q}`).join('\n')
      });
    }
    renderAiConversation();
    output.textContent=result.ready_to_generate
      ?'The assistant has enough information for a draft. You can keep chatting or generate the complete package now.'
      :'Reply to the questions above. You can generate a draft at any time; missing facts will be flagged rather than invented.';
    return result;
  }catch(error){
    output.textContent=error.message||'The AI conversation could not continue.';
    throw error;
  }
}

document.querySelector('#aiStartConversation')?.addEventListener('click',async()=>{
  const starter=valueOrNull('#aiPrompt')
    ||(state.selectedOpportunity
      ?`I want to apply for ${state.selectedOpportunity.title} at ${state.selectedOpportunity.organization}. Ask me for anything you still need.`
      :'I want to create a professional CV and application package. Ask me for the information you need.');
  await runAiConversation(starter,{restart:true}).catch(()=>{});
});

document.querySelector('#aiChatForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const input=document.querySelector('#aiChatInput');
  const message=input?.value?.trim();
  if(!message)return;
  input.value='';
  await runAiConversation(message).catch(()=>{});
});

document.querySelector('#aiVacancyUrlBtn')?.addEventListener('click',async event=>{
  const button=event.currentTarget;
  const status=document.querySelector('#aiVacancyUrlStatus');
  const url=valueOrNull('#aiVacancyUrl');
  if(!url){
    status.textContent='Paste a vacancy link first.';
    return;
  }
  button.disabled=true;
  status.textContent='Checking the vacancy link…';
  try{
    const result=await functionRequest('generate-cv',{mode:'fetch_vacancy',vacancy_url:url});
    if(result.vacancy_text){
      setValue('#aiVacancyText',result.vacancy_text);
      status.textContent=`Vacancy text loaded from ${result.source_host||'the supplied link'}. Review it before generation.`;
    }else{
      status.textContent=result.message||'The site did not provide usable vacancy text. Paste the advert or upload it instead.';
    }
  }catch(error){
    status.textContent=error.message||'CareerLaunch could not read that vacancy link. Paste or upload the advert instead.';
  }finally{
    button.disabled=false;
  }
});

/* AI CV generation */
function populateAiVacancySelect(){
  const select=document.querySelector('#aiVacancySelect');
  if(!select)return;
  const current=select.value;
  [...select.querySelectorAll('option')].slice(1).forEach(option=>option.remove());
  state.opportunities.forEach(item=>{
    const option=make('option',{text:`${item.title} — ${item.organization}`});
    option.value=item.id;
    select.append(option);
  });
  if(current&&state.opportunities.some(item=>item.id===current))select.value=current;
}

document.querySelector('#aiVacancySelect')?.addEventListener('change',event=>{
  const id=event.currentTarget.value;
  state.selectedOpportunity=state.opportunities.find(item=>item.id===id)||null;
  applySelectedOpportunity();
});

function applySelectedOpportunity(){
  const note=document.querySelector('#selectedOpportunityNote');
  const select=document.querySelector('#aiVacancySelect');
  if(!state.selectedOpportunity){
    if(note)note.hidden=true;
    return;
  }
  if(select)select.value=state.selectedOpportunity.id;
  if(note){
    note.hidden=false;
    note.textContent=`Selected: ${state.selectedOpportunity.title} — ${state.selectedOpportunity.organization}. Official source verified ${formatDateTime(state.selectedOpportunity.verified_at)}.`;
  }
}

async function generateAiCv({opportunityId,prompt,savePack=false}){
  await saveCvDraft();
  const result=await functionRequest('generate-cv',{
    mode:'generate',
    opportunity_id:opportunityId||null,
    vacancy_text:valueOrNull('#aiVacancyText')||'',
    vacancy_url:valueOrNull('#aiVacancyUrl')||'',
    prompt:prompt||'Create a truthful ATS-friendly application package using the evidence I provided.',
    application_kind:document.querySelector('#aiApplicationKind')?.value||'job',
    use_existing_details:document.querySelector('#aiDetailSource')?.value!=='fresh',
    conversation:state.aiConversation,
    target_roles:selectionValues('roles'),
    strengths:selectionValues('strengths'),
    skills:selectionValues('skills')
  });
  if(savePack){
    await persistGeneratedPack(result,opportunityId||null);
  }
  return result;
}

document.querySelector('#aiCvForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const output=document.querySelector('#aiCvResult');
  const button=event.currentTarget.querySelector('button[type="submit"]');
  button.disabled=true;
  output.textContent='Generating a role-specific CV from your saved evidence…';
  try{
    const opportunityId=document.querySelector('#aiVacancySelect')?.value||null;
    const result=await generateAiCv({
      opportunityId,
      prompt:document.querySelector('#aiPrompt')?.value.trim()||''
    });
    state.generatedAi={...result,opportunity_id:opportunityId};
    renderAiPreview();
    output.textContent=result.generation_mode==='structured_fallback'
      ?'Structured evidence-only draft generated. The external AI provider was unavailable or not configured; review every fact before saving or applying.'
      :'AI draft generated. Review every fact before saving or applying.';
  }catch(error){
    output.textContent=error.message||'AI CV generation is unavailable right now.';
  }finally{
    button.disabled=false;
  }
});

function renderAiPreview(){
  const preview=document.querySelector('#aiCvPreview');
  if(!preview||!state.generatedAi)return;
  clear(preview);
  const fallback=state.generatedAi.generation_mode==='structured_fallback';
  preview.append(
    make('h3',{text:fallback?'Structured evidence-only CV draft':'AI-generated CV draft'}),
    make('pre',{text:state.generatedAi.cv_markdown||''})
  );
  if(fallback){
    preview.append(make('p',{
      className:'muted',
      text:'This draft was built from your saved evidence without external AI inference. It does not invent missing facts.'
    }));
  }
  if(state.generatedAi.cover_letter_markdown){
    preview.append(make('h3',{text:'Cover letter draft'}),make('pre',{text:state.generatedAi.cover_letter_markdown}));
  }
  if(state.generatedAi.motivation_letter_markdown){
    preview.append(make('h3',{text:'Motivational letter draft'}),make('pre',{text:state.generatedAi.motivation_letter_markdown}));
  }
  if(state.generatedAi.form_completion_markdown){
    preview.append(make('h3',{text:'Form completion worksheet'}),make('pre',{text:state.generatedAi.form_completion_markdown}));
  }
  if(state.generatedAi.warnings?.length){
    const warning=make('div',{className:'warning-box'});
    warning.append(make('strong',{text:'Review warnings'}));
    const ul=make('ul');
    state.generatedAi.warnings.forEach(item=>ul.append(make('li',{text:item})));
    warning.append(ul);
    preview.append(warning);
  }
  preview.hidden=false;
  document.querySelector('#aiExportActions').hidden=false;
}

async function persistGeneratedPack(generated,opportunityId){
  const rows=await dbRequest('application_packs',{
    method:'POST',
    body:{
      user_id:currentUserId(),
      opportunity_id:opportunityId||null,
      version:1,
      title:state.selectedOpportunity
        ?`${state.selectedOpportunity.title} — application pack`
        :`${document.querySelector('#aiApplicationKind')?.value||'job'} application pack`,
      pack_type:document.querySelector('#aiApplicationKind')?.value||'job',
      cv_markdown:generated.cv_markdown||'',
      cover_letter_markdown:generated.cover_letter_markdown||'',
      motivation_letter_markdown:generated.motivation_letter_markdown||'',
      form_completion_markdown:generated.form_completion_markdown||'',
      email_subject:generated.email_subject||'',
      email_body:generated.email_body||'',
      checklist:generated.checklist||[],
      warnings:generated.warnings||[],
      application_steps:[
        'Open the official source',
        'Re-check the vacancy requirements',
        'Review the generated CV against your real evidence',
        'Submit through the official route',
        'Update CareerLaunch only after the real submission'
      ]
    },
    prefer:'return=representation'
  });
  const pack=rows?.[0];
  if(pack?.id){
    const apps=await dbRequest('applications',{
      method:'POST',
      body:{
        user_id:currentUserId(),
        opportunity_id:opportunityId||null,
        application_pack_id:pack.id,
        status:'draft',
        next_action:'Review the AI-generated pack and official vacancy requirements before submission.'
      },
      prefer:'return=representation'
    });
    state.applications=[...(apps||[]),...state.applications];
    renderApplications();
  }
  if(pack){
    state.packs=[pack,...state.packs.filter(item=>item.id!==pack.id)];
    renderLibrary();
  }
  return pack;
}

document.querySelector('#saveAiPack')?.addEventListener('click',async()=>{
  const output=document.querySelector('#aiCvResult');
  if(!state.generatedAi){
    output.textContent='Generate an AI CV first.';
    return;
  }
  try{
    await persistGeneratedPack(state.generatedAi,state.generatedAi.opportunity_id||null);
    output.textContent='AI application pack saved to CareerLaunch. It has not been submitted anywhere.';
    renderDashboard();
  }catch(error){
    output.textContent=error.message||'Could not save the application pack.';
  }
});

document.querySelector('#generateShortlistCvs')?.addEventListener('click',async event=>{
  const button=event.currentTarget;
  const status=document.querySelector('#shortlistStatus');
  if(!state.shortlist.length){
    status.textContent='Add vacancies to your shortlist first.';
    return;
  }
  button.disabled=true;
  let completed=0;
  const failures=[];
  try{
    for(const entry of state.shortlist){
      const item=entry.opportunities||state.opportunities.find(op=>op.id===entry.opportunity_id);
      if(!item)continue;
      status.textContent=`Generating ${completed+1} of ${state.shortlist.length}: ${item.title}…`;
      try{
        await generateAiCv({
          opportunityId:item.id,
          prompt:`Create a role-specific ATS-friendly CV for ${item.title} at ${item.organization}. Use only my verified evidence and flag missing requirements.`,
          savePack:true
        });
        completed++;
      }catch(error){
        failures.push(`${item.title}: ${error.message}`);
      }
    }
    status.textContent=failures.length
      ?`Generated and saved ${completed} CV pack(s). ${failures.length} could not be generated: ${failures.join(' | ')}`
      :`Generated and saved ${completed} role-specific CV pack(s). Review each before applying.`;
    renderDashboard();
  }finally{
    button.disabled=false;
  }
});

/* Export */
async function createPdfBlob(text){
  const module=await import(JSPDF_URL);
  const doc=new module.jsPDF({unit:'pt',format:'a4'});
  const margin=48;
  const usableWidth=doc.internal.pageSize.getWidth()-margin*2;
  const pageHeight=doc.internal.pageSize.getHeight();
  const lines=doc.splitTextToSize(String(text||''),usableWidth);
  let y=margin;
  doc.setFont('helvetica','normal');
  doc.setFontSize(10.5);
  lines.forEach(line=>{
    if(y>pageHeight-margin){
      doc.addPage();
      y=margin;
    }
    doc.text(line,margin,y);
    y+=14;
  });
  return doc.output('blob');
}

function xmlEscape(value){
  return String(value||'').replace(/[<>&"']/g,char=>({
    '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'
  })[char]);
}

function createTxtBlob(text){
  return new Blob([String(text||'')],{type:'text/plain;charset=utf-8'});
}

async function createDocxBlob(text){
  if(!window.JSZip)throw new Error('DOCX export library has not loaded yet. Check your connection and try again.');
  const zip=new window.JSZip();
  const contentTypes='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    +'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    +'<Default Extension="xml" ContentType="application/xml"/>'
    +'<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    +'</Types>';
  const rels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    +'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    +'</Relationships>';
  zip.file('[Content_Types].xml',contentTypes);
  zip.folder('_rels').file('.rels',rels);
  const paragraphs=String(text||'').split('\n').map(line=>
    '<w:p><w:r><w:t xml:space="preserve">'+xmlEscape(line)+'</w:t></w:r></w:p>'
  ).join('');
  const documentXml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
    +paragraphs+'<w:sectPr/></w:body></w:document>';
  zip.folder('word').file('document.xml',documentXml);
  return zip.generateAsync({
    type:'blob',
    mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });
}

function downloadBlob(blob,fileName){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function exportBaseName(prefix){
  const raw=state.profile?.full_name||valueOrNull('#manualName')||prefix||'CareerLaunch-CV';
  return String(raw).trim().replace(/[^a-z0-9]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,80)||'CareerLaunch-CV';
}

async function exportCv(text,format,{cloud=false,prefix='CareerLaunch-CV'}={}){
  const content=String(text||'').trim();
  if(!content)throw new Error('Build or generate the CV before exporting it.');
  const blob=format==='pdf'
    ?await createPdfBlob(content)
    :format==='docx'
      ?await createDocxBlob(content)
      :createTxtBlob(content);
  const fileName=exportBaseName(prefix)+'.'+format;
  if(cloud){
    const mime=format==='pdf'
      ?'application/pdf'
      :format==='docx'
        ?'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        :'text/plain';
    const file=new File([blob],fileName,{type:mime});
    await uploadCandidateDocument(file,'generated_cv');
    return fileName+' saved to your private CareerLaunch cloud storage.';
  }
  downloadBlob(blob,fileName);
  return fileName+' saved locally.';
}

function bindExport(selector,getText,format,cloud,prefix,statusSelector){
  document.querySelector(selector)?.addEventListener('click',async event=>{
    const button=event.currentTarget;
    button.disabled=true;
    try{
      const message=await exportCv(getText(),format,{cloud,prefix});
      if(statusSelector)setText(statusSelector,message);
    }catch(error){
      if(statusSelector)setText(statusSelector,error.message||'Export failed.');
      else alert(error.message||'Export failed.');
    }finally{
      button.disabled=false;
    }
  });
}

bindExport('#saveManualPdf',()=>state.manualPreviewText||buildManualCvText(),'pdf',false,'CareerLaunch-Manual-CV','#manualCvResult');
bindExport('#saveManualDocx',()=>state.manualPreviewText||buildManualCvText(),'docx',false,'CareerLaunch-Manual-CV','#manualCvResult');
bindExport('#saveManualCloudPdf',()=>state.manualPreviewText||buildManualCvText(),'pdf',true,'CareerLaunch-Manual-CV','#manualCvResult');
bindExport('#saveManualCloudDocx',()=>state.manualPreviewText||buildManualCvText(),'docx',true,'CareerLaunch-Manual-CV','#manualCvResult');
bindExport('#saveAiPdf',()=>state.generatedAi?.cv_markdown||'','pdf',false,'CareerLaunch-AI-CV','#aiCvResult');
bindExport('#saveAiDocx',()=>state.generatedAi?.cv_markdown||'','docx',false,'CareerLaunch-AI-CV','#aiCvResult');
bindExport('#saveAiTxt',()=>state.generatedAi?.cv_markdown||'','txt',false,'CareerLaunch-AI-CV','#aiCvResult');
bindExport('#saveAiCloudPdf',()=>state.generatedAi?.cv_markdown||'','pdf',true,'CareerLaunch-AI-CV','#aiCvResult');
bindExport('#saveAiCloudDocx',()=>state.generatedAi?.cv_markdown||'','docx',true,'CareerLaunch-AI-CV','#aiCvResult');

function renderJobSites(){
  const list=document.querySelector('#jobSiteList');
  if(!list)return;
  clear(list);
  MAJOR_JOB_SITES.forEach(site=>{
    const card=make('article',{className:'job-site-card'});
    card.append(
      make('h3',{text:site.name}),
      make('p',{text:site.focus}),
      make('p',{className:'muted',text:site.note})
    );
    const actions=make('div',{className:'card-actions'});
    actions.append(make('a',{
      className:'button button-secondary button-small',
      text:'Open website',
      attrs:{href:site.url,target:'_blank',rel:'noopener noreferrer'}
    }));
    const prepare=make('button',{className:'button button-small',text:'Prepare CareerLaunch pack'});
    prepare.type='button';
    prepare.addEventListener('click',()=>{
      state.selectedOpportunity=null;
      setValue('#aiVacancyUrl',site.url);
      setValue('#aiPrompt',`I found a vacancy on ${site.name}. Help me prepare a truthful role-specific application package. Ask me for the vacancy link or advert and any missing applicant details.`);
      switchView('cv');
      document.querySelector('#aiCvAssistant')?.scrollIntoView({behavior:'smooth'});
    });
    actions.append(prepare);
    card.append(actions);
    list.append(card);
  });
}

function libraryCategories(){
  const categories=state.cvDraft?.content?.library_categories;
  return Array.isArray(categories)?categories.filter(Boolean):[];
}

async function saveLibraryCategories(categories){
  const content={...(state.cvDraft?.content||{}),library_categories:[...new Set(categories.filter(Boolean))]};
  const rows=await dbRequest('cv_drafts?on_conflict=user_id',{
    method:'POST',
    body:{user_id:currentUserId(),content,updated_at:new Date().toISOString()},
    prefer:'resolution=merge-duplicates,return=representation'
  });
  state.cvDraft=rows?.[0]||{user_id:currentUserId(),content};
}

function documentLibraryGroup(doc){
  const type=String(doc.document_type||'').toLowerCase();
  if(['cv','generated_cv'].includes(type))return 'cvs';
  if(['certificate','qualification','reference'].includes(type))return 'evidence';
  if(['personal_document','id','identity'].includes(type))return 'personal';
  if(['application_form','form'].includes(type))return 'forms';
  return type.startsWith('custom:')?type:'other';
}

function renderLibrary(){
  const list=document.querySelector('#libraryList');
  const status=document.querySelector('#libraryStatus');
  const customTabs=document.querySelector('#libraryCustomTabs');
  if(!list||!status)return;
  clear(list);
  if(customTabs){
    clear(customTabs);
    libraryCategories().forEach(category=>{
      const button=make('button',{className:'chip library-custom-tab',text:category});
      button.type='button';
      button.addEventListener('click',()=>{
        state.libraryFilter=`custom:${category.toLowerCase()}`;
        renderLibrary();
      });
      customTabs.append(button);
    });
  }

  document.querySelectorAll('.library-tab').forEach(button=>{
    button.classList.toggle('active',button.dataset.libraryFilter===state.libraryFilter);
  });

  let shown=0;
  if(state.libraryFilter==='cvs'){
    state.packs.forEach(pack=>{
      const card=make('article',{className:'library-card'});
      card.append(
        make('span',{className:'badge',text:pack.pack_type||'application'}),
        make('h3',{text:pack.title||'CareerLaunch application pack'}),
        make('p',{className:'muted',text:`Created ${formatDateTime(pack.created_at)}`})
      );
      const actions=make('div',{className:'card-actions'});
      for(const [label,format] of [['CV PDF','pdf'],['CV DOCX','docx'],['CV TXT','txt']]){
        const button=make('button',{className:'button button-secondary button-small',text:label});
        button.type='button';
        button.addEventListener('click',async()=>{
          try{await exportCv(pack.cv_markdown||'',format,{prefix:pack.title||'CareerLaunch-CV'});}
          catch(error){setText('#libraryStatus',error.message||'Export failed.');}
        });
        actions.append(button);
      }
      card.append(actions);
      list.append(card);
      shown++;
    });
  }

  state.documents.forEach(doc=>{
    if(documentLibraryGroup(doc)!==state.libraryFilter)return;
    const card=make('article',{className:'library-card'});
    card.append(
      make('span',{className:'badge',text:doc.document_type}),
      make('h3',{text:doc.file_name}),
      make('p',{className:'muted',text:`Uploaded ${formatDateTime(doc.created_at)}`})
    );
    const remove=make('button',{className:'button button-danger button-small',text:'Remove'});
    remove.type='button';
    remove.addEventListener('click',()=>removeDocument(doc));
    card.append(remove);
    list.append(card);
    shown++;
  });

  status.textContent=shown
    ?`${shown} item${shown===1?'':'s'} in this library section.`
    :'Nothing saved in this library section yet.';
}

document.querySelectorAll('.library-tab').forEach(button=>{
  button.addEventListener('click',()=>{
    state.libraryFilter=button.dataset.libraryFilter||'cvs';
    renderLibrary();
  });
});

document.querySelector('#libraryAddCategoryBtn')?.addEventListener('click',async()=>{
  const input=document.querySelector('#libraryCategoryName');
  const category=input?.value?.trim();
  if(!category)return;
  try{
    await saveLibraryCategories([...libraryCategories(),category]);
    input.value='';
    renderLibrary();
    setText('#libraryStatus',`Added library category: ${category}. Use document type Other for documents you want to organise manually in a future refinement.`);
  }catch(error){
    setText('#libraryStatus',error.message||'Could not save library category.');
  }
});

function renderApplicationForms(){
  const list=document.querySelector('#applicationFormCatalog');
  if(!list)return;
  clear(list);
  APPLICATION_FORMS.forEach(form=>{
    const card=make('article',{className:'library-card'});
    card.append(
      make('h3',{text:form.name}),
      make('p',{className:'muted',text:`${form.source} • ${form.note}`})
    );
    const actions=make('div',{className:'card-actions'});
    actions.append(make('a',{
      className:'button button-secondary button-small',
      text:'Open official form',
      attrs:{href:form.url,target:'_blank',rel:'noopener noreferrer'}
    }));
    const assistant=make('button',{className:'button button-small',text:'Start form assistant'});
    assistant.type='button';
    assistant.addEventListener('click',()=>{
      setValue('#aiApplicationKind','government');
      setValue('#aiVacancyUrl',form.url);
      setValue('#aiPrompt',`Help me prepare the ${form.name}. Ask me the required questions one by one, produce a completion worksheet, identify anything missing, and remind me where I must personally sign or declare information.`);
      switchView('cv');
      document.querySelector('#aiCvAssistant')?.scrollIntoView({behavior:'smooth'});
    });
    actions.append(assistant);
    card.append(actions);
    list.append(card);
  });
}

document.querySelector('#studyAiAssistantBtn')?.addEventListener('click',()=>{
  state.selectedOpportunity=null;
  setValue('#aiApplicationKind','bursary');
  setValue('#aiPrompt','Help me prepare a bursary, scholarship or learnership application. Ask me for the opportunity details, then prepare a truthful motivational letter and application checklist.');
  switchView('cv');
  document.querySelector('#aiCvAssistant')?.scrollIntoView({behavior:'smooth'});
});

/* Applications */
function renderApplications(){
  const list=document.querySelector('#applicationList');
  const status=document.querySelector('#applicationStatus');
  const empty=document.querySelector('#applicationEmpty');
  if(!list||!status||!empty)return;
  clear(list);
  if(!state.applications.length){
    status.textContent='No tracker records yet.';
    empty.hidden=false;
    return;
  }
  empty.hidden=true;
  status.textContent=`${state.applications.length} application tracker record${state.applications.length===1?'':'s'}.`;
  const opportunityMap=new Map(state.opportunities.map(item=>[item.id,item]));
  state.applications.forEach(app=>{
    const opportunity=opportunityMap.get(app.opportunity_id);
    const card=make('article',{className:'application-card'});
    card.append(
      make('span',{className:'badge',text:(app.status||'draft').replaceAll('_',' ')}),
      make('h3',{text:opportunity?.title||'General application pack'}),
      make('p',{className:'muted',text:opportunity?.organization||'No opportunity linked'}),
      make('p',{text:app.next_action||'Review your pack and official requirements.'}),
      make('p',{className:'meta',text:`Created ${formatDateTime(app.created_at)}`})
    );
    const tracker=make('div',{className:'tracker-row'});
    const select=make('select');
    ['draft','ready','submitted','interview','offer','rejected','withdrawn','closed'].forEach(value=>{
      const option=make('option',{text:value.replaceAll('_',' ')});
      option.value=value;
      option.selected=value===app.status;
      select.append(option);
    });
    const save=make('button',{className:'button button-small',text:'Update tracker'});
    save.type='button';
    save.addEventListener('click',async()=>{
      save.disabled=true;
      try{
        const patch={
          status:select.value,
          updated_at:new Date().toISOString(),
          submitted_at:select.value==='submitted'?(app.submitted_at||new Date().toISOString()):app.submitted_at
        };
        const updated=await dbRequest(`applications?id=eq.${encodeURIComponent(app.id)}`,{
          method:'PATCH',body:patch,prefer:'return=representation'
        });
        Object.assign(app,updated?.[0]||patch);
        if(select.value==='submitted'&&app.opportunity_id){
          await removeFromShortlist(app.opportunity_id);
        }
        save.textContent='Saved';
      }catch(error){
        save.textContent='Try again';
      }finally{
        save.disabled=false;
      }
    });
    tracker.append(select,save);
    card.append(tracker);
    if(opportunity?.source_url){
      card.append(make('a',{
        className:'text-link',
        text:'Open official source',
        attrs:{href:opportunity.source_url,target:'_blank',rel:'noopener noreferrer'}
      }));
    }
    list.append(card);
  });
}

(async()=>{
  if(await ensureSession())await enterApp();
})();
