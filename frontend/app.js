(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const config = window.GATHER_CONFIG || {};
  const api = String(config.apiUrl || '').replace(/\/$/, '');
  const auth = window.GatherAuth;
  const storeKey = 'gather-demo-v2';
  const initial = {events:[{id:'sample',title:'Summer community meetup',date:'2027-06-19',location:'London · example event',category:'Social'}],tasks:{sample:[{id:'one',title:'Choose a venue',dueDate:'2027-05-01',done:true},{id:'two',title:'Plan the guest list',dueDate:'2027-05-15',done:false},{id:'three',title:'Send the invitations',dueDate:'',done:false}]}};
  let state = {events:[],tasks:[],selected:null,signedIn:!api};
  let local;
  try { local = JSON.parse(localStorage.getItem(storeKey)) || structuredClone(initial); } catch { local = structuredClone(initial); }
  const save = () => localStorage.setItem(storeKey,JSON.stringify(local));
  const id = () => crypto.randomUUID().replaceAll('-','');
  const text = (tag,value,cls) => {const e=document.createElement(tag);e.textContent=value;if(cls)e.className=cls;return e;};
  const today = () => {const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
  function notify(message) { $('message').textContent=message; }
  async function request(path,method='GET',body) {
    const token=await auth.accessToken();
    if (!token) throw Error('Your session expired. Please sign in again.');
    const headers={'authorization':'Bearer '+token}; if(body)headers['content-type']='application/json';
    const result=await fetch(api+path,{method,headers,body:body?JSON.stringify(body):undefined});
    let data;try{data=await result.json();}catch{throw Error('The server returned an unexpected response.');}
    if(!result.ok)throw Error(data.error || (result.status===401?'Please sign in again.':'Something went wrong. Please try again.'));
    return data;
  }
  const data = api ? {
    events:async()=>(await request('/events')).events,
    createEvent:value=>request('/events','POST',value),
    tasks:async event=>(await request(`/events/${event}/tasks`)).tasks,
    addTask:(event,value)=>request(`/events/${event}/tasks`,'POST',value),
    setTask:(event,task,done)=>request(`/events/${event}/tasks/${task}`,'PATCH',{done})
  } : {
    events:async()=>local.events,
    createEvent:async value=>{const event={...value,id:id()};local.events.push(event);local.tasks[event.id]=[];save();return event;},
    tasks:async event=>local.tasks[event] || [],
    addTask:async(event,value)=>{const task={...value,id:id(),done:false};local.tasks[event].push(task);save();return task;},
    setTask:async(event,task,done)=>{const item=local.tasks[event].find(x=>x.id===task);item.done=done;save();return item;}
  };
  function dateParts(date) {const [y,m,d]=date.split('-').map(Number);const value=new Date(y,m-1,d);return {day:String(d).padStart(2,'0'),month:value.toLocaleDateString('en-GB',{month:'short'}).toUpperCase(),long:value.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})};}
  function render() {
    const event=state.events.find(x=>x.id===state.selected), dateNow=today();
    $('event-count').textContent=state.events.length;
    $('task-count').textContent=state.events.filter(x=>x.date>=dateNow).length;
    $('progress-count').textContent=state.tasks.filter(x=>!x.done && x.dueDate && x.dueDate<dateNow).length;
    const complete=state.tasks.filter(x=>x.done).length;
    const progress=state.tasks.length?Math.round(complete/state.tasks.length*100):0;
    $('detail-progress').textContent=`${progress}%`; $('progress-bar').style.width=`${progress}%`;
    $('task-badge').textContent=`${state.tasks.length} ${state.tasks.length===1?'TASK':'TASKS'}`;
    $('detail-title').textContent=event?event.title:'Select an event';
    $('detail-meta').textContent=event?[dateParts(event.date).long,event.category,event.location].filter(Boolean).join(' · '):'Your checklist will appear here.';
    $('open-event').disabled=!state.signedIn;
    $('task-title').disabled=!event;$('task-due').disabled=!event;$('task-form').querySelector('button').disabled=!event;
    const list=$('event-list');list.replaceChildren();
    const events=[...state.events].sort((a,b)=>a.date.localeCompare(b.date));
    if(!events.length)list.append(text('p',state.signedIn?'No events yet. Create one to get started.':'Sign in to view your events.','empty'));
    for(const e of events){
      const btn=text('button','',`event-card${e.id===state.selected?' selected':''}`);btn.type='button';btn.setAttribute('aria-pressed',String(e.id===state.selected));
      const tile=text('span','','date-tile'),parts=dateParts(e.date);tile.append(text('strong',parts.day),text('small',parts.month));
      const labels=text('span','');labels.append(text('span',e.title,'event-name'),text('span',[e.category,e.location].filter(Boolean).join(' · ') || 'Location to be decided','event-location'));labels.style.display='grid';
      const arrow=text('span','›','event-arrow');arrow.setAttribute('aria-hidden','true');btn.append(tile,labels,arrow);btn.addEventListener('click',()=>selectEvent(e.id));list.append(btn);
    }
    const tasks=$('tasks');tasks.replaceChildren();
    if(!state.tasks.length)tasks.append(text('p',event?'No tasks yet. Add your first one below.':'Choose an event to see tasks.','empty'));
    const sorted=[...state.tasks].sort((a,b)=>(a.done-b.done)||((a.dueDate||'9999').localeCompare(b.dueDate||'9999')));
    for(const task of sorted){
      const label=text('label','',`task${task.done?' done':''}`),check=document.createElement('input');check.type='checkbox';check.checked=task.done;
      check.addEventListener('change',async()=>{check.disabled=true;try{await data.setTask(event.id,task.id,check.checked);if(state.selected===event.id){state.tasks=await data.tasks(event.id);render();}notify('');}catch(err){check.checked=!check.checked;check.disabled=false;notify(err.message);}});
      const body=text('span','','task-content');body.append(text('span',task.title));
      if(task.dueDate){const overdue=!task.done && task.dueDate<dateNow;body.append(text('small',(overdue?'Overdue · ':'Due ')+dateParts(task.dueDate).long,`task-date${overdue?' overdue':''}`));}
      label.append(check,body);tasks.append(label);
    }
  }
  async function selectEvent(eventId){state.selected=eventId;state.tasks=[];render();try{const tasks=await data.tasks(eventId);if(state.selected===eventId){state.tasks=tasks;render();}notify('');}catch(err){notify(err.message);}}
  $('open-event').addEventListener('click',()=>$('event-dialog').showModal());
  $('close-event').addEventListener('click',()=>$('event-dialog').close());
  $('cancel-event').addEventListener('click',()=>$('event-dialog').close());
  $('account-button').addEventListener('click',async()=>{try{if(state.signedIn)auth.signOut();else await auth.signIn();}catch(err){notify(err.message);}});
  $('event-form').addEventListener('submit',async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{const value={title:$('event-title').value.trim(),date:$('event-date').value,category:$('event-category').value,location:$('event-location').value.trim()};if(!value.title)throw Error('Enter an event name.');const created=await data.createEvent(value);state.events=await data.events();$('event-form').reset();$('event-dialog').close();await selectEvent(created.id);notify('');}catch(err){notify(err.message);$('event-dialog').close();}finally{button.disabled=false;}});
  $('task-form').addEventListener('submit',async e=>{e.preventDefault();const eventId=state.selected,input=$('task-title'),title=input.value.trim();if(!eventId||!title)return;const button=e.submitter;button.disabled=true;try{await data.addTask(eventId,{title,dueDate:$('task-due').value});input.value='';$('task-due').value='';if(state.selected===eventId)state.tasks=await data.tasks(eventId);render();notify('');}catch(err){notify(err.message);button.disabled=false;}});
  (async()=>{
    try{
      if(api){
        $('account-button').hidden=false;
        if(!auth.configured)throw Error('AWS sign-in configuration is incomplete.');
        await auth.completeRedirect();
        state.signedIn=Boolean(await auth.accessToken());
        $('account-button').textContent=state.signedIn?'Sign out':'Sign in';
        $('mode-label').textContent=state.signedIn?'Private AWS workspace':'Sign in required';
        $('privacy-note').textContent=state.signedIn?'Your events are stored in your AWS account workspace.':'Sign in or create an account to access your private workspace.';
      }else{
        $('mode-label').textContent='Browser demo';
        $('privacy-note').textContent='Demo mode: changes are saved only in this browser. The example event is illustrative.';
      }
      if(state.signedIn){state.events=await data.events();if(state.events.length)await selectEvent(state.events[0].id);else render();}else render();
    }catch(err){state.signedIn=false;$('mode-label').textContent='Sign-in unavailable';render();notify(err.message);}
  })();
})();
