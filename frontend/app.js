(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const api = (window.GATHER_API_URL || '').replace(/\/$/, '');
  const storeKey = 'gather-demo-v1';
  const initial = {events: [{id: 'sample', title: 'Summer community meetup', date: '2027-06-19', location: 'London · example event'}], tasks: {sample: [{id:'one',title:'Choose a venue',done:true},{id:'two',title:'Plan the guest list',done:false},{id:'three',title:'Send the invitations',done:false}]}};
  let state = {events: [], tasks: [], selected: null};
  let local;
  try { local = JSON.parse(localStorage.getItem(storeKey)) || structuredClone(initial); } catch { local = structuredClone(initial); }
  const save = () => localStorage.setItem(storeKey, JSON.stringify(local));
  const id = () => crypto.randomUUID().replaceAll('-', '');
  const text = (tag, value, cls) => { const e=document.createElement(tag); e.textContent=value; if(cls)e.className=cls; return e; };
  async function request(path, method='GET', body) {
    const result = await fetch(api + path, {method, headers: body ? {'content-type':'application/json'} : {}, body: body ? JSON.stringify(body) : undefined});
    let data; try { data = await result.json(); } catch { throw Error('The server returned an unexpected response.'); }
    if (!result.ok) throw Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }
  const data = api ? {
    events: async () => (await request('/events')).events,
    createEvent: value => request('/events','POST',value),
    tasks: async event => (await request(`/events/${event}/tasks`)).tasks,
    addTask: (event,value) => request(`/events/${event}/tasks`,'POST',{title:value}),
    setTask: (event,task,done) => request(`/events/${event}/tasks/${task}`,'PATCH',{done})
  } : {
    events: async () => local.events,
    createEvent: async value => {const event={...value,id:id()};local.events.push(event);local.tasks[event.id]=[];save();return event;},
    tasks: async event => local.tasks[event] || [],
    addTask: async (event,title) => {const task={id:id(),title,done:false};local.tasks[event].push(task);save();return task;},
    setTask: async (event,task,done) => {const item=local.tasks[event].find(x=>x.id===task);item.done=done;save();return item;}
  };
  $('mode-label').textContent = api ? 'AWS connected' : 'Browser demo';
  $('privacy-note').textContent = api ? 'Shared demo: everyone with the link can read and change these events. Please don’t enter private information.' : 'Demo mode: changes are saved only in this browser. The example event is illustrative.';
  function notify(message) { $('message').textContent=message; }
  function dateParts(date) {const [y,m,d] = date.split('-').map(Number);const value=new Date(y,m-1,d);return {day:String(d).padStart(2,'0'),month:value.toLocaleDateString('en-GB',{month:'short'}).toUpperCase(),long:value.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})};}
  function render() {
    const event = state.events.find(x=>x.id===state.selected);
    $('event-count').textContent=state.events.length;
    $('task-count').textContent=state.tasks.length;
    const done=state.tasks.filter(x=>x.done).length;
    const progress=state.tasks.length ? Math.round(done/state.tasks.length*100) : 0;
    $('progress-count').textContent=`${progress}%`; $('detail-progress').textContent=`${progress}%`; $('progress-bar').style.width=`${progress}%`;
    $('task-badge').textContent=`${state.tasks.length} ${state.tasks.length===1?'TASK':'TASKS'}`;
    $('detail-title').textContent=event ? event.title : 'Select an event';
    $('detail-meta').textContent=event ? [dateParts(event.date).long,event.location].filter(Boolean).join(' · ') : 'Your checklist will appear here.';
    $('task-title').disabled=!event; $('task-form').querySelector('button').disabled=!event;
    const list=$('event-list'); list.replaceChildren();
    const events=[...state.events].sort((a,b)=>a.date.localeCompare(b.date));
    if(!events.length) list.append(text('p','No events yet. Create one to get started.','empty'));
    for(const e of events){
      const btn=text('button','',`event-card${e.id===state.selected?' selected':''}`);btn.type='button';btn.setAttribute('aria-pressed',String(e.id===state.selected));
      const tile=text('span','','date-tile'); const parts=dateParts(e.date); tile.append(text('strong',parts.day),text('small',parts.month));
      const labels=text('span','');labels.append(text('span',e.title,'event-name'),text('span',e.location || 'Location to be decided','event-location')); labels.style.display='grid';
      const arrow=text('span','›','event-arrow');arrow.setAttribute('aria-hidden','true');btn.append(tile,labels,arrow);btn.addEventListener('click',()=>selectEvent(e.id));list.append(btn);
    }
    const tasks=$('tasks');tasks.replaceChildren();
    if(!state.tasks.length) tasks.append(text('p',event?'No tasks yet. Add your first one below.':'Choose an event to see tasks.','empty'));
    for(const task of state.tasks){
      const label=text('label','',`task${task.done?' done':''}`), check=document.createElement('input');check.type='checkbox';check.checked=task.done;
      check.addEventListener('change',async()=>{check.disabled=true;try {await data.setTask(event.id,task.id,check.checked);if(state.selected===event.id){state.tasks=await data.tasks(event.id);render();}notify('');}catch(err){check.checked=!check.checked;check.disabled=false;notify(err.message);}});
      label.append(check,text('span',task.title));tasks.append(label);
    }
  }
  async function selectEvent(eventId){state.selected=eventId;state.tasks=[];render();try{const tasks=await data.tasks(eventId);if(state.selected===eventId){state.tasks=tasks;render();}notify('');}catch(err){notify(err.message);}}
  $('open-event').addEventListener('click',()=>$('event-dialog').showModal());
  $('close-event').addEventListener('click',()=>$('event-dialog').close());
  $('cancel-event').addEventListener('click',()=>$('event-dialog').close());
  $('event-form').addEventListener('submit',async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;try{const value={title:$('event-title').value.trim(),date:$('event-date').value,location:$('event-location').value.trim()};if(!value.title)throw Error('Enter an event name.');const created=await data.createEvent(value);state.events=await data.events();$('event-form').reset();$('event-dialog').close();await selectEvent(created.id);notify('');}catch(err){notify(err.message);$('event-dialog').close();}finally{button.disabled=false;}});
  $('task-form').addEventListener('submit',async event=>{event.preventDefault();const eventId=state.selected, input=$('task-title'), title=input.value.trim();if(!eventId||!title)return;const button=event.submitter;button.disabled=true;try{await data.addTask(eventId,title);input.value='';if(state.selected===eventId)state.tasks=await data.tasks(eventId);render();notify('');}catch(err){notify(err.message);button.disabled=false;}});
  (async()=>{try{state.events=await data.events();if(state.events.length)await selectEvent(state.events[0].id);else render();}catch(err){render();notify('Could not load events. '+err.message);}})();
})();
