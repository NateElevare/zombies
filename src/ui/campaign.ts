import type { GameState } from '../sim/types';
import * as campaign from '../sim/campaign';
import * as game from '../sim/game';
import { el } from './dom';
import { assetUrl } from '../asset-url';
import { keybinds } from '../keybinds';
import { drawFullMap } from './mapview';
import './campaign.css';

/** A journal, community ledger and radio in one keyboard-accessible overlay. */
export class CampaignUi {
  private tracker:HTMLButtonElement;
  private panel:HTMLElement;
  private state:GameState|null=null;
  private tab='story'; private signature=''; private confirmLaunch=false;
  constructor(root:HTMLElement){
    this.tracker=el('button','campaign-tracker hidden');this.tracker.type='button';
    this.tracker.addEventListener('click',()=>{if(this.state){campaign.open(this.state);this.signature='';}});
    this.panel=el('section','campaign-overlay hidden');this.panel.setAttribute('role','dialog');this.panel.setAttribute('aria-label','Haven journal');this.panel.setAttribute('aria-modal','true');
    root.append(this.tracker,this.panel);
  }
  attach(s:GameState|null){this.state=s;this.signature='';this.confirmLaunch=false;this.panel.classList.add('hidden');this.tracker.classList.add('hidden');}
  update(s:GameState){
    if(s!==this.state)return;
    const c=s.campaign,visible=s.mode==='survival'&&!!c&&s.screen==='playing';
    this.tracker.classList.toggle('hidden',!visible||s.ui!==null);
    const open=visible&&s.ui==='campaign';this.panel.classList.toggle('hidden',!open);
    if(!visible||!c)return;
    const o=campaign.tracked(s),near=campaign.nearest(s),site=o&&campaign.sites(s)![o.site];
    const encounter=c.encounter;
    this.tracker.textContent=encounter?`DEFEND • ${Math.ceil(encounter.remaining)}s • ${encounter.kills}/${encounter.total} cleared`:
      c.completed?'HAVEN • A connected community • Open journal':`CH ${c.chapter} • ${campaign.CHAPTERS[c.chapter-1].title}\n${o?.title||'Return to Haven'}${site?` • ${Math.round(Math.hypot(site.x-s.player.x,site.y-s.player.y))}m`:''}\n${near?`${keybinds.label('interact')} • ${near.name}`:'Open Haven journal'}`;
    if(!open){this.signature='';return;}
    const sig=JSON.stringify([this.tab,c.chapter,c.done,c.log.length,c.completed,c.tracked,c.supplyDay,c.radioDay,c.trip?.to,Math.floor(c.fuel/60),c.residents.map(r=>[r.id,r.home,r.following]),campaign.available(s).map(o=>[o.id,campaign.reason(s,o)]),this.confirmLaunch]);
    if(sig===this.signature)return;this.signature=sig;this.render(s);
  }
  private button(label:string,fn:()=>void,disabled=false){const b=el('button','btn',label);b.type='button';b.disabled=disabled;b.addEventListener('click',()=>{fn();this.signature='';});return b;}
  private picture(src:string,alt:string,cls:string){const img=el('img',cls);img.src=assetUrl(`assets/campaign/${src}.png`);img.alt=alt;return img;}
  private render(s:GameState){
    const c=s.campaign!;const oldScroll=this.panel.querySelector('.campaign-body')?.scrollTop||0;
    this.panel.replaceChildren();const box=el('div','campaign-book');
    const head=el('header','campaign-head');head.append(el('div','campaign-brand','HAVEN / FIELD JOURNAL'),this.button('Close · Esc',()=>{game.setUi(s,null);this.tracker.focus();}));box.append(head);
    const tabs=el('nav','campaign-tabs');for(const [id,name]of [['story','Objectives'],['community','Community'],['radio','Radio & records'],['map','Valley map']]){const b=this.button(name,()=>{this.tab=id;});b.classList.toggle('active',this.tab===id);tabs.append(b);}box.append(tabs);
    const body=el('div','campaign-body');box.append(body);this.panel.append(box);
    if(this.tab==='story'){
      body.append(this.picture(c.completed?'ending':`chapter-${c.chapter}`,c.completed?'Haven at dawn':campaign.CHAPTERS[c.chapter-1].title,'campaign-vignette'));
      body.append(el('p','campaign-kicker',c.completed?'A CONNECTED COMMUNITY':`CHAPTER ${c.chapter} / 6`),el('h2','',c.completed?'You kept the promise.':campaign.CHAPTERS[c.chapter-1].title),el('p','',c.completed?'The bus is in the yard. North Ridge’s people have a home. Continue exploring, improving Haven, and answering radio contacts.':campaign.CHAPTERS[c.chapter-1].text));
      const latest=c.log.at(-1);if(latest){const dialogue=el('div','campaign-dialogue');dialogue.append(this.picture(`portrait-${latest.speaker}-neutral`,campaign.CAST[latest.speaker].name,'campaign-portrait'));const words=el('div');words.append(el('strong','',campaign.CAST[latest.speaker].name),el('p','',latest.text));dialogue.append(words);body.append(dialogue);}
      if(c.encounter){body.append(el('p','campaign-notice','Defense in progress. Close the journal to continue. Stay near the objective and clear every attacker.'));}
      if(c.trip){body.append(el('p','campaign-notice',`The bus is heading to ${campaign.sites(s)![c.trip.to].name}. Follow it on foot, or travel with the convoy to the next encounter.`),this.button('Ride with the convoy',()=>campaign.rideConvoy(s)));}
      for(const o of campaign.available(s)){
        const row=el('article','campaign-objective');const why=campaign.reason(s,o),site=campaign.sites(s)![o.site];
        row.append(el('small','',`${o.optional?'OPTIONAL • ':''}${site.name}`),el('h3','',o.title),el('p','',o.before));
        if(o.cost)row.append(el('p','campaign-cost',Object.entries(o.cost).map(([id,n])=>`${n} ${id.replaceAll('_',' ')}`).join(' · ')));
        if(why)row.append(el('p','campaign-hint',why));
        const controls=el('div','campaign-actions');controls.append(this.button(c.tracked===o.id?'Tracked':'Track on map',()=>campaign.track(s,o.id)));
        controls.append(this.button(o.id==='launch'?'Prepare to depart':o.kind==='defend'?'Begin defense':o.kind==='build'?'Confirm construction':o.kind==='escort'?'Ask them to follow':'Continue',()=>{if(o.id==='launch'){this.confirmLaunch=true;}else campaign.act(s,o.id);},!!why));row.append(controls);
        if(o.id==='launch'&&this.confirmLaunch){row.append(el('p','campaign-notice','Depart now? Unfinished optional preparations will be left behind.'),this.button('Launch evacuation',()=>{campaign.act(s,'launch');this.confirmLaunch=false;}),this.button('Keep preparing',()=>{this.confirmLaunch=false;}));}
        body.append(row);
      }
      const done=campaign.OBJECTIVES.filter(o=>c.done.includes(o.id));if(done.length){const details=el('details');details.append(el('summary','',`${done.length} completed objectives`));for(const o of done)details.append(el('p','campaign-completed',`✓ ${o.title}`));body.append(details);}
    }else if(this.tab==='community'){
      body.append(el('p','campaign-kicker','JUNE’S LEDGER'),el('h2','','The people who live here'),el('p','',`${c.residents.filter(r=>r.home).length} at Haven · ${c.residents.filter(r=>r.following).length} following you`));
      const milestones=el('div','campaign-milestones');campaign.CHAPTERS.forEach((ch,i)=>milestones.append(el('span',i+1<c.chapter||c.completed?'achieved':'',`${i+1}. ${ch.milestone}`)));body.append(milestones);
      const cards=el('div','campaign-residents');for(const r of c.residents){const card=el('article','campaign-resident');const aboard=campaign.has(s,'boarding')&&!c.completed&&(r.id==='ruth'||r.id.startsWith('ridge-'));card.append(this.picture(`portrait-${r.look}-neutral`,r.name,'campaign-portrait'),el('strong','',r.name),el('small','',r.following?'Following you — stay close':r.home?'At Haven':aboard?'Aboard the convoy':'Awaiting rescue'));cards.append(card);}body.append(cards);
      const home=campaign.atHome(s);if(!home)body.append(el('p','campaign-notice','Return to Haven to use community services.'));
      const actions=el('div','campaign-actions');actions.append(this.button('Mara · Treatment',()=>campaign.service(s,'heal'),!home||!campaign.has(s,'infirmary')),this.button('June · Daily supplies',()=>campaign.service(s,'supplies'),!home||!campaign.has(s,'water')||c.supplyDay>=s.clock.day),this.button('Eli · Refuel (1 chemicals, 2 scrap)',()=>campaign.service(s,'fuel'),!home||!campaign.has(s,'power')));body.append(actions);
      body.append(el('p','',campaign.has(s,'power')?`Generator reserve: ${Math.ceil(c.fuel/60)} minutes. Fuel keeps the station lights on; progress is retained when it runs out.`:'The station is running on lanterns and its emergency battery.'));
      if(c.cargo.length){body.append(el('h3','','Recovered campaign equipment'));const cargo=el('div','campaign-cargo');for(const item of c.cargo){const row=el('span');row.append(this.picture(`icon-${item}`,item.replaceAll('_',' '),'campaign-cargo-icon'),el('span','',item.replaceAll('_',' ')));cargo.append(row);}body.append(cargo);}
    }else if(this.tab==='radio'){
      body.append(el('p','campaign-kicker','BELLWETHER RELAY • 104.6'),el('h2','',campaign.has(s,'contact')?'Outside contact':'Listening station'));
      const dial=el('div','campaign-radio-dial');dial.append(el('span','','88  ·  92  ·  96  ·  100  ·  104.6  ·  108'),el('i'));body.append(dial);
      if(!campaign.has(s,'power'))body.append(el('p','','Restore reliable power before the emergency radio can receive a signal.'));
      else if(!campaign.has(s,'contact'))body.append(el('p','',campaign.has(s,'signal')?'Ruth is alive at North Ridge. Recover the transmitter to answer her.':'Listen after dark. A voice is trying to reach Bellwether.'));
      else{body.append(el('p','','NORTH RIDGE — Ruth Calder · MILL CREEK — supply exchange'),this.button('Trade 2 bandages for 36 rounds (daily)',()=>campaign.service(s,'radio'),!campaign.atHome(s)||c.radioDay>=s.clock.day));}
      body.append(el('h3','','Field records'));for(const line of c.log.slice().reverse()){const entry=el('blockquote');entry.append(el('strong','',campaign.CAST[line.speaker].name),el('p','',line.text));body.append(entry);}
    }else{
      body.append(el('p','campaign-kicker','JUNE’S VALLEY MAP'),el('h2','','Bellwether & North Ridge'),el('p','','Objective diamonds remain visible beyond explored streets. Open the world map (M) for precise navigation.'));
      const canvas=el('canvas','campaign-valley-map');canvas.width=960;canvas.height=640;canvas.setAttribute('aria-label','Valley map with current campaign objectives');body.append(canvas);const ctx=canvas.getContext('2d');if(ctx)drawFullMap(ctx,s,{cx:8000,cy:8000,zoom:1},960,640);
      const map=campaign.sites(s)!;for(const id of ['haven','hardware','grocery','hospital','school','depot','comms','ridge','checkpoint','highway','fallback'] as const){if(id==='ridge'&&!campaign.has(s,'contact'))continue;const site=map[id];body.append(el('p','campaign-map-stop',`${id==='ridge'?'△':'◇'} ${site.name} — ${Math.round(Math.hypot(site.x-s.player.x,site.y-s.player.y))}m`));}
    }
    body.scrollTop=oldScroll;
  }
}
