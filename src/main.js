const SESSION_KEY='careerlaunch_session';

const state={
  profile:null,
  experience:[],
  education:[],
  skills:[],
  opportunities:[],
  applications:[],
  selectedOpportunity:null,
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

async function ensureSession(){
  const session=readSession();
  if(!session?.session_token)return null;
  if(session.expires_at && Date.now()<session.expires_at-60000)return session;
  if(!session.refresh_token){
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
  try{
    const refreshed=await authRequest('token?grant_type=refresh_token',{refresh_token:session.refresh_token});
    if(!storeSession(refreshed))throw new Error('Session refresh did not return a session.');
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
  const data=text?JSON.parse(text):null;
  if(!response.ok){
    throw new Error(data?.message||data?.details||data?.hint||`Data request failed (${response.status})`);
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
  const email=document.querySelector('#signedInAs');
  if(email)email.textContent=currentEmail();
  switchView('dashboard');
  await loadWorkspaceData();
}

function leaveApp(){
  localStorage.removeItem(SESSION_KEY);
  state.profile=null;
  state.experience=[];
  state.education=[];
  state.skills=[];
  state.applications=[];
  state.selectedOpportunity=null;
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
      await enterApp();
    }else{
      output.textContent='Account created, but Supabase is still requiring email confirmation. Turn Confirm email off for this controlled live-test stage and try with a fresh test account.';
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
    await enterApp();
  }catch(error){
    console.error('CareerLaunch sign in failed',error);
    output.textContent=error?.message||'Sign in failed. Check your email address and password.';
  }finally{
    submit.disabled=false;
  }
});

async function loadWorkspaceData(){
  if(state.loading)return;
  state.loading=true;
  setWorkspaceLoading(true);
  try{
    await Promise.all([
      loadProfileAndEvidence(),
      loadOpportunities(),
      loadApplications()
    ]);
    renderAll();
  }catch(error){
    console.error('CareerLaunch workspace load failed',error);
    setGlobalStatus(error.message||'Some live data could not be loaded.');
  }finally{
    state.loading=false;
    setWorkspaceLoading(false);
  }
}

function setWorkspaceLoading(loading){
  const status=document.querySelector('#opportunityStatus');
  const apps=document.querySelector('#applicationStatus');
  if(loading){
    if(status)status.textContent='Loading verified opportunities…';
    if(apps)apps.textContent='Loading your applications…';
  }
}

function setGlobalStatus(message){
  const status=document.querySelector('#opportunityStatus');
  if(status)status.textContent=message;
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
  state.opportunities=Array.isArray(data)?data:[];
}

async function loadApplications(){
  const userId=currentUserId();
  if(!userId)return;
  const data=await dbRequest(`applications?select=*&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`);
  state.applications=Array.isArray(data)?data:[];
}

function renderAll(){
  hydrateProfileForm();
  renderEvidenceLists();
  renderOpportunityList();
  renderStudyList();
  renderApplications();
  renderDashboard();
}

function hydrateProfileForm(){
  const profile=state.profile||{};
  const values={
    profileName:profile.full_name||'',
    profilePhone:profile.phone||'',
    profileCity:profile.city||'',
    profileProvince:profile.province||'',
    profileHeadline:profile.headline||'',
    profileSummary:profile.summary||''
  };
  Object.entries(values).forEach(([id,value])=>{
    const field=document.getElementById(id);
    if(field)field.value=value;
  });
  const matric=document.querySelector('#profileMatriculant');
  if(matric)matric.checked=Boolean(profile.is_matriculant);
}

function renderEvidenceLists(){
  renderRecords('#experienceList',state.experience,item=>[
    item.job_title,
    item.employer,
    item.description
  ]);
  renderRecords('#educationList',state.education,item=>[
    item.qualification,
    item.institution,
    item.field_of_study
  ]);
  renderRecords('#skillList',state.skills,item=>[
    item.skill_name,
    item.evidence
  ]);
}

function renderRecords(selector,records,toLines){
  const container=document.querySelector(selector);
  if(!container)return;
  clear(container);
  if(!records.length){
    container.append(make('p',{className:'muted',text:'Nothing saved yet.'}));
    return;
  }
  records.forEach(record=>{
    const card=make('article',{className:'mini-record'});
    toLines(record).filter(Boolean).forEach((line,index)=>{
      card.append(make(index===0?'strong':'span',{text:line}));
    });
    container.append(card);
  });
}

document.querySelector('#profileForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const output=document.querySelector('#profileResult');
  const userId=currentUserId();
  if(!userId){
    output.textContent='Your session is unavailable. Sign in again.';
    return;
  }
  const fullName=document.querySelector('#profileName')?.value.trim()||'';
  if(!fullName){
    output.textContent='Add your full name before saving.';
    return;
  }
  const payload={
    user_id:userId,
    full_name:fullName,
    email:currentEmail(),
    phone:document.querySelector('#profilePhone')?.value.trim()||null,
    city:document.querySelector('#profileCity')?.value.trim()||null,
    province:document.querySelector('#profileProvince')?.value||null,
    country:'South Africa',
    headline:document.querySelector('#profileHeadline')?.value.trim()||null,
    summary:document.querySelector('#profileSummary')?.value.trim()||null,
    is_matriculant:Boolean(document.querySelector('#profileMatriculant')?.checked),
    updated_at:new Date().toISOString()
  };
  output.textContent='Saving profile…';
  try{
    const saved=await dbRequest('profiles?on_conflict=user_id',{
      method:'POST',
      body:payload,
      prefer:'resolution=merge-duplicates,return=representation'
    });
    state.profile=saved?.[0]||payload;
    output.textContent='Profile saved securely to CareerLaunch.';
    renderDashboard();
  }catch(error){
    output.textContent=error.message||'Could not save profile.';
  }
});

document.querySelector('#experienceForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const userId=currentUserId();
  const employer=document.querySelector('#experienceEmployer')?.value.trim();
  const jobTitle=document.querySelector('#experienceTitle')?.value.trim();
  if(!userId||!employer||!jobTitle)return;
  try{
    const saved=await dbRequest('candidate_experience',{
      method:'POST',
      body:{
        user_id:userId,
        employer,
        job_title:jobTitle,
        description:document.querySelector('#experienceDescription')?.value.trim()||null
      },
      prefer:'return=representation'
    });
    state.experience=[...(saved||[]),...state.experience];
    event.currentTarget.reset();
    renderEvidenceLists();
    renderDashboard();
  }catch(error){
    alert(error.message||'Could not save experience.');
  }
});

document.querySelector('#educationForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const userId=currentUserId();
  const institution=document.querySelector('#educationInstitution')?.value.trim();
  const qualification=document.querySelector('#educationQualification')?.value.trim();
  if(!userId||!institution||!qualification)return;
  try{
    const saved=await dbRequest('candidate_education',{
      method:'POST',
      body:{
        user_id:userId,
        institution,
        qualification,
        field_of_study:document.querySelector('#educationField')?.value.trim()||null
      },
      prefer:'return=representation'
    });
    state.education=[...(saved||[]),...state.education];
    event.currentTarget.reset();
    renderEvidenceLists();
    renderDashboard();
  }catch(error){
    alert(error.message||'Could not save education.');
  }
});

document.querySelector('#skillForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const userId=currentUserId();
  const skillName=document.querySelector('#skillName')?.value.trim();
  if(!userId||!skillName)return;
  try{
    const saved=await dbRequest('candidate_skills',{
      method:'POST',
      body:{
        user_id:userId,
        skill_name:skillName,
        evidence:document.querySelector('#skillEvidence')?.value.trim()||null
      },
      prefer:'return=representation'
    });
    state.skills=[...(saved||[]),...state.skills];
    event.currentTarget.reset();
    renderEvidenceLists();
    renderDashboard();
  }catch(error){
    alert(error.message||'Could not save skill.');
  }
});

function renderDashboard(){
  const profile=state.profile||{};
  const required=[
    profile.full_name,
    profile.phone,
    profile.city,
    profile.province,
    profile.headline,
    profile.summary
  ];
  const profileBase=Math.round(required.filter(Boolean).length/required.length*70);
  const evidenceBonus=Math.min(30,
    (state.experience.length?10:0)+
    (state.education.length?10:0)+
    (state.skills.length?10:0)
  );
  const completeness=Math.min(100,profileBase+evidenceBonus);
  const open=state.opportunities.length;
  const deadlines=state.opportunities
    .filter(item=>item.closing_date)
    .map(item=>new Date(item.closing_date))
    .filter(date=>date.getTime()>Date.now())
    .sort((a,b)=>a-b);
  setText('#statProfile',`${completeness}%`);
  setText('#statOpportunities',String(open));
  setText('#statApplications',String(state.applications.length));
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
    row.append(
      make('strong',{text:item.title}),
      make('span',{text:`${item.organization} • verified ${formatDateTime(item.verified_at)}`})
    );
    row.addEventListener('click',()=>{
      state.selectedOpportunity=item;
      applySelectedOpportunity();
      switchView('jobs');
      document.querySelector(`[data-opportunity-id="${item.id}"]`)?.scrollIntoView({behavior:'smooth',block:'center'});
    });
    pulse.append(row);
  });
}

function setText(selector,value){
  const node=document.querySelector(selector);
  if(node)node.textContent=value;
}

function filteredOpportunities(){
  const type=document.querySelector('#opportunityTypeFilter')?.value||'';
  const province=document.querySelector('#opportunityProvinceFilter')?.value||'';
  const search=(document.querySelector('#opportunitySearch')?.value||'').trim().toLowerCase();
  return state.opportunities.filter(item=>{
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
  status.textContent=`${items.length} verified open opportunit${items.length===1?'y':'ies'} shown. Research records: ${state.opportunities.length}.`;
  if(!items.length){
    list.append(make('div',{className:'empty-state',text:'No researched opportunity currently matches these filters.'}));
    return;
  }
  items.forEach(item=>list.append(buildOpportunityCard(item)));
}

function buildOpportunityCard(item){
  const card=make('article',{className:'opportunity-card',attrs:{'data-opportunity-id':item.id}});
  const heading=make('div',{className:'opportunity-heading'});
  const titleWrap=make('div');
  titleWrap.append(
    make('span',{className:'badge',text:prettyType(item.opportunity_type)}),
    make('h3',{text:item.title}),
    make('p',{className:'muted',text:[item.organization,item.location,item.province].filter(Boolean).join(' • ')})
  );
  const deadline=make('div',{className:'deadline'});
  deadline.append(
    make('span',{text:'Closing'}),
    make('strong',{text:formatDate(item.closing_date)})
  );
  heading.append(titleWrap,deadline);
  card.append(heading);

  if(item.salary_or_stipend){
    card.append(make('p',{className:'salary',text:item.salary_or_stipend}));
  }
  if(item.description){
    card.append(make('p',{text:item.description}));
  }
  if(item.reference_number){
    card.append(make('p',{className:'meta',text:`Reference: ${item.reference_number}`}));
  }
  card.append(make('p',{className:'meta',text:`Source: ${item.source_name||'Official source'} • verified ${formatDateTime(item.verified_at)}`}));

  const actions=make('div',{className:'card-actions'});
  const source=make('a',{
    className:'button button-secondary button-small',
    text:'Open official source',
    attrs:{href:item.source_url,target:'_blank',rel:'noopener noreferrer'}
  });
  const prepare=make('button',{className:'button button-small',text:'Prepare application pack'});
  prepare.type='button';
  prepare.addEventListener('click',()=>{
    state.selectedOpportunity=item;
    applySelectedOpportunity();
    switchView('cv');
  });
  actions.append(source,prepare);
  card.append(actions);
  return card;
}

function prettyType(type){
  const labels={
    job:'Job',
    government_job:'Government job',
    learnership:'Learnership',
    apprenticeship:'Apprenticeship',
    internship:'Internship',
    bursary:'Bursary',
    scholarship:'Scholarship',
    study:'Study'
  };
  return labels[type]||type||'Opportunity';
}

['#opportunityTypeFilter','#opportunityProvinceFilter','#opportunitySearch'].forEach(selector=>{
  document.querySelector(selector)?.addEventListener(selector==='#opportunitySearch'?'input':'change',renderOpportunityList);
});

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

function applySelectedOpportunity(){
  const note=document.querySelector('#selectedOpportunityNote');
  const target=document.querySelector('#cvTarget');
  const mode=document.querySelector('#cvMode');
  if(!state.selectedOpportunity){
    if(note)note.hidden=true;
    return;
  }
  if(target)target.value=state.selectedOpportunity.title||'';
  if(mode)mode.value='job';
  if(note){
    note.hidden=false;
    note.textContent=`Selected: ${state.selectedOpportunity.title} — ${state.selectedOpportunity.organization}. Official source was last verified ${formatDateTime(state.selectedOpportunity.verified_at)}.`;
  }
}

function buildCvMarkdown({mode,target,extra}){
  const profile=state.profile||{};
  const lines=[];
  lines.push(profile.full_name||'Candidate name not yet provided');
  if(profile.headline)lines.push(profile.headline);
  lines.push('');
  lines.push('CONTACT');
  lines.push([currentEmail(),profile.phone,profile.city,profile.province].filter(Boolean).join(' | '));
  lines.push('');
  lines.push('PROFESSIONAL PROFILE');
  lines.push(profile.summary||'Profile summary not yet provided. Add evidence before finalising this CV.');
  lines.push('');
  if(mode==='job'&&target){
    lines.push(`TARGET ROLE: ${target}`);
    lines.push('');
  }
  if(state.experience.length){
    lines.push('EXPERIENCE');
    state.experience.forEach(item=>{
      lines.push(`${item.job_title} — ${item.employer}`);
      if(item.description)lines.push(item.description);
      lines.push('');
    });
  }
  if(state.education.length){
    lines.push('EDUCATION');
    state.education.forEach(item=>{
      lines.push(`${item.qualification} — ${item.institution}`);
      if(item.field_of_study)lines.push(item.field_of_study);
      lines.push('');
    });
  }
  if(state.skills.length){
    lines.push('SKILLS WITH EVIDENCE');
    state.skills.forEach(item=>{
      lines.push(`• ${item.skill_name}${item.evidence?` — ${item.evidence}`:''}`);
    });
    lines.push('');
  }
  if(extra){
    lines.push('ADDITIONAL VERIFIED EVIDENCE');
    lines.push(extra);
    lines.push('');
  }
  if(mode==='matriculant'&&!state.education.length){
    lines.push('MATRICULANT NOTE');
    lines.push('Add school, subjects, results, projects, leadership, volunteering and practical skills before finalising.');
  }
  return lines.join('\n').trim();
}

function buildPackPayload({mode,target,extra}){
  const opportunity=state.selectedOpportunity;
  const cv=buildCvMarkdown({mode,target,extra});
  const candidateName=state.profile?.full_name||'Applicant';
  const organisation=opportunity?.organization||'the organisation';
  const warnings=[];
  if(!state.profile?.full_name)warnings.push('Full name is missing.');
  if(!state.profile?.summary)warnings.push('Professional summary is missing.');
  if(!state.experience.length&&!state.education.length)warnings.push('Experience and education evidence are both empty.');
  if(opportunity?.requirements&&Object.keys(opportunity.requirements).length){
    warnings.push('Re-check every mandatory requirement on the official source before applying.');
  }
  const checklist=[
    'Review the official source and closing date',
    'Confirm every mandatory requirement against your evidence',
    'Check CV dates, titles and contact details',
    'Prepare only the supporting documents requested by the provider',
    'Record the real submission confirmation in CareerLaunch after you apply'
  ];
  const steps=[
    'Open the official source',
    'Compare mandatory criteria with your saved evidence',
    'Review the tailored CV and cover letter',
    'Upload or send documents through the official route',
    'Return to CareerLaunch and update the tracker only after the real submission'
  ];
  const coverLetter=[
    `Dear Hiring Team at ${organisation},`,
    '',
    `I am applying for ${target||'the advertised opportunity'}. This draft is intentionally limited to evidence saved in my CareerLaunch profile and should be reviewed before submission.`,
    '',
    state.profile?.summary||'Add a truthful summary explaining your fit for this opportunity.',
    '',
    'Kind regards,',
    candidateName
  ].join('\n');
  return {
    user_id:currentUserId(),
    opportunity_id:opportunity?.id||null,
    version:1,
    cv_markdown:cv,
    cover_letter_markdown:coverLetter,
    email_subject:opportunity?`Application: ${opportunity.title}${opportunity.reference_number?` — ${opportunity.reference_number}`:''}`:`CareerLaunch application — ${target||'general opportunity'}`,
    email_body:`Dear Hiring Team,\n\nPlease find my application for ${target||'the advertised opportunity'} attached. Please refer to the attached documents for my verified experience and qualifications.\n\nKind regards,\n${candidateName}`,
    application_steps:steps,
    checklist,
    warnings
  };
}

document.querySelector('#cvForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const mode=document.querySelector('#cvMode')?.value||'general';
  const target=document.querySelector('#cvTarget')?.value.trim()||'General opportunity';
  const extra=document.querySelector('#cvExtraEvidence')?.value.trim()||'';
  const result=document.querySelector('#cvResult');
  const preview=document.querySelector('#cvPreview');
  const payload=buildPackPayload({mode,target,extra});

  result.textContent='Building and saving your evidence-based application pack…';
  try{
    const saved=await dbRequest('application_packs',{
      method:'POST',
      body:payload,
      prefer:'return=representation'
    });
    const pack=saved?.[0];
    if(!pack?.id)throw new Error('Application pack was not returned after saving.');

    const appRows=await dbRequest('applications',{
      method:'POST',
      body:{
        user_id:currentUserId(),
        opportunity_id:payload.opportunity_id,
        application_pack_id:pack.id,
        status:'draft',
        next_action:'Review the official source and compare every mandatory requirement before submission.'
      },
      prefer:'return=representation'
    });
    state.applications=[...(appRows||[]),...state.applications];

    clear(preview);
    preview.append(
      make('h3',{text:`CV preview — ${target}`}),
      make('pre',{text:payload.cv_markdown}),
      make('h3',{text:'Cover letter draft'}),
      make('pre',{text:payload.cover_letter_markdown}),
      make('h3',{text:'Application checklist'})
    );
    const list=make('ul');
    payload.checklist.forEach(item=>list.append(make('li',{text:item})));
    preview.append(list);
    if(payload.warnings.length){
      const warning=make('div',{className:'warning-box'});
      warning.append(make('strong',{text:'Evidence warnings'}));
      const warningList=make('ul');
      payload.warnings.forEach(item=>warningList.append(make('li',{text:item})));
      warning.append(warningList);
      preview.append(warning);
    }
    preview.hidden=false;
    result.textContent='Application pack saved as a draft. It has not been submitted anywhere.';
    renderApplications();
    renderDashboard();
  }catch(error){
    result.textContent=error.message||'Could not save the application pack.';
  }
});

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
        const updated=await dbRequest(`applications?id=eq.${encodeURIComponent(app.id)}`,{
          method:'PATCH',
          body:{status:select.value,updated_at:new Date().toISOString()},
          prefer:'return=representation'
        });
        Object.assign(app,updated?.[0]||{status:select.value});
        save.textContent='Saved';
        renderDashboard();
      }catch(error){
        save.textContent='Try again';
        alert(error.message||'Could not update tracker.');
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

const publicSearch=document.querySelector('#demoSearch');
publicSearch?.addEventListener('click',()=>{
  const goal=document.querySelector('#goal')?.value||'Opportunities';
  const result=document.querySelector('#searchResult');
  if(result)result.textContent=`${goal} selected. Sign in to browse verified live research and create an application pack.`;
  document.querySelector('#account')?.scrollIntoView({behavior:'smooth'});
});

(async()=>{
  if(await ensureSession()){
    await enterApp();
  }
})();
