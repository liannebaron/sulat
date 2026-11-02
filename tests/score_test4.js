const fs=require('fs'),vm=require('vm');const ctx={};ctx.window=ctx;vm.createContext(ctx);
const dir=(process.env.SULAT_DIR||require('path').join(__dirname,'..')+'/');
vm.runInContext(fs.readFileSync(dir+'sulat-engine.js','utf8'),ctx);vm.runInContext(fs.readFileSync(process.argv[2]||dir+'sulat-score.js','utf8'),ctx);
const S=ctx.Sulat,SC=ctx.SulatScore;const pack=JSON.parse(fs.readFileSync(dir+'packs/baybayin.json','utf8'));
function bez(pts,n=10){if(pts.length===1)return[{x:pts[0][0],y:pts[0][1]}];const out=[];for(let i=0;i<pts.length-1;i++){const p0=pts[i-1]||pts[i],p1=pts[i],p2=pts[i+1],p3=pts[i+2]||pts[i+1];const c1=[p1[0]+(p2[0]-p0[0])/6,p1[1]+(p2[1]-p0[1])/6],c2=[p2[0]-(p3[0]-p1[0])/6,p2[1]-(p3[1]-p1[1])/6];for(let k=0;k<n;k++){const t=k/n,a=(1-t)**3,b=3*(1-t)**2*t,c=3*(1-t)*t*t,d=t**3;out.push({x:a*p1[0]+b*c1[0]+c*c2[0]+d*p2[0],y:a*p1[1]+b*c1[1]+c*c2[1]+d*p2[1]});}}out.push({x:pts[pts.length-1][0],y:pts[pts.length-1][1]});return out;}
function refFor(tok){const L=S.layout(pack,[{text:tok.text,tokens:[tok]}]);const it=L.items[0];const r=[];pack.glyphs[it.base].strokes.forEach(s=>r.push({pts:bez(s.points).map(p=>({x:p.x+it.dx,y:p.y+it.dy})),dot:s.kind==='dot'}));if(it.mark)pack.glyphs[it.mark.id].strokes.forEach(s=>r.push({pts:bez(s.points).map(p=>({x:p.x+it.mark.dx,y:p.y+it.mark.dy})),dot:s.kind==='dot'}));
 const opts={markStrokes:it.mark?pack.glyphs[it.mark.id].strokes.length:0,markSide:it.mark?(it.mark.id==='mark-i'?'above':'below'):null,markKind:it.mark&&it.mark.id==='mark-virama'?'cross':'dot'};return{r,opts};}
let seed=5;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
function wobble(pts,amp,size){const f1=0.6+rnd()*1.2,f2=1.2+rnd()*1.6,p1=rnd()*6.28,p2=rnd()*6.28,q1=rnd()*6.28,q2=rnd()*6.28,a1=amp*size*(0.5+rnd()),a2=amp*size*0.5*rnd();return pts.map((p,i)=>{const t=i/Math.max(1,pts.length-1);return{x:p.x+a1*Math.sin(6.28*f1*t+p1)+a2*Math.sin(6.28*f2*t+p2)+(rnd()-.5)*0.004*size,y:p.y+a1*Math.sin(6.28*f1*t+q1)+a2*Math.sin(6.28*f2*t+q2)+(rnd()-.5)*0.004*size};});}
const tracing=(ref,amp=0.02)=>{const sz=SC.bbox(ref).size,dx=(rnd()-.5)*40,dy=(rnd()-.5)*40;return ref.map(st=>({pts:wobble(st.pts.map(p=>({x:p.x+dx,y:p.y+dy})),amp,sz)}));};
const human=(ref,amp=0.022)=>{const b=SC.bbox(ref),sz=b.size,sx=0.9+0.2*rnd(),sy=0.9+0.2*rnd(),tx=(rnd()-0.5)*260,ty=(rnd()-0.5)*260;return ref.map(st=>({pts:wobble(st.pts.map(p=>({x:(p.x-b.cx)*sx+b.cx+tx,y:(p.y-b.cy)*sy+b.cy+ty})),amp,sz)}));};
const novice=(ref,amp=0.05)=>{const b=SC.bbox(ref),sz=b.size,A=amp*sz*(0.6+0.8*rnd()),fx=0.5+rnd(),fy=0.5+rnd(),px=rnd()*6.28,py=rnd()*6.28,sx=0.8+0.4*rnd(),sy=0.8+0.4*rnd(),tx=(rnd()-.5)*300,ty=(rnd()-.5)*300;
  return ref.map(st=>{const ox=(rnd()-.5)*0.07*sz,oy=(rnd()-.5)*0.07*sz;return{pts:wobble(st.pts.map(p=>({x:(p.x-b.cx)*sx+b.cx+tx+ox+A*Math.sin(6.28*fy*(p.y-b.y0)/sz+px),y:(p.y-b.cy)*sy+b.cy+ty+oy+A*Math.sin(6.28*fx*(p.x-b.x0)/sz+py)})),0.022,sz)};});};
const alts=(tok)=>Object.keys(pack.glyphs).filter(g=>!g.startsWith('mark')&&g!==tok.base).map(g=>{try{return{strokes:refFor({base:g,mark:tok.mark,text:'x'}).r};}catch(e){return null;}}).filter(Boolean);
const straighten=(u,i)=>{const p=u[i].pts,a=p[0],b=p[p.length-1];u[i]={pts:p.map((q,k)=>({x:a.x+(b.x-a.x)*k/(p.length-1),y:a.y+(b.y-a.y)*k/(p.length-1)}))};};
const shift=(r,dx,dy)=>r.map(st=>({pts:st.pts.map(p=>({x:p.x+dx,y:p.y+dy}))}));
const shrink=(r,k)=>{const b=SC.bbox(r);return r.map(st=>({pts:st.pts.map(p=>({x:(p.x-b.cx)*k+b.cx,y:(p.y-b.cy)*k+b.cy}))}));};
const sagOf=(st,R)=>{const a=st.pts[0],b=st.pts.at(-1);let sag=0;st.pts.forEach(p=>{const d=Math.abs((b.y-a.y)*p.x-(b.x-a.x)*p.y+b.x*a.y-b.y*a.x)/Math.hypot(b.x-a.x,b.y-a.y||1e-9);if(d>sag)sag=d;});return sag/R.size;};
const toks=[];['mahal kita','salamat','kumusta','magandang umaga','paalam'].forEach(t=>S.syllabify(t).forEach(w=>w.tokens.forEach(k=>{if(!toks.find(x=>x.text===k.text&&x.mark===k.mark))toks.push(k);})));
const T={};const bump=(k,ok,note)=>{T[k]=T[k]||[0,0,[]];T[k][ok?0:1]++;if(!ok&&note&&T[k][2].length<4)T[k][2].push(note);};
for(const tok of toks){const {r,opts}=refFor(tok);const R=SC.bbox(r);const tr={...opts,mode:'trace'},AL=alts(tok),me={...opts,mode:'memory',alternatives:AL};
 for(let t=0;t<(+process.env.TRIALS||5);t++){
  let res=SC.score(r,tracing(r),tr);bump('TRACE  good trace passes',res.pass,tok.text+': '+res.message);
  {const stretch=u=>u.map((st,i)=>{const f=0.88+0.24*rnd();const p=st.pts;if(p.length<8||(opts.markStrokes&&i>=u.length-opts.markStrokes))return st;
     if(f<1){return{pts:p.slice(0,Math.max(4,Math.floor(p.length*f)))};}
     const a=p[p.length-8],b=p[p.length-1],n=Math.floor(p.length*(f-1));const ex=[];for(let k=1;k<=n;k++)ex.push({x:b.x+(b.x-a.x)/7*k,y:b.y+(b.y-a.y)/7*k});return{pts:p.concat(ex)};});
   res=SC.score(r,stretch(tracing(r)),tr);bump('TRACE  good trace, ends a little long or short, passes',res.pass,tok.text+': '+res.message);
   if(opts.markStrokes){const t2=tracing(r);const k=opts.markStrokes;const bb=SC.bbox(t2.slice(t2.length-k));const big=t2.map((st,i)=>i<t2.length-k?st:{pts:st.pts.map(p=>({x:(p.x-bb.cx)*2+bb.cx+0.07*R.size,y:(p.y-bb.cy)*2+bb.cy+0.05*R.size}))});
     res=SC.score(r,big,tr);bump('TRACE  mark traced twice as big and off to the side passes',res.pass,tok.text+': '+res.message);}}
  res=SC.score(r,novice(r),me);bump('MEMORY novice, loose but legible: passes',res.pass,tok.text+': '+res.message+' ['+res.issue+']');
  res=SC.score(r,human(r),me);bump('MEMORY careful copy passes',res.pass,tok.text+': '+res.message);
  {const jit=u=>u.map(st=>({pts:st.pts.map(p=>({x:p.x+(rnd()-.5)*10,y:p.y+(rnd()-.5)*10}))}));
   res=SC.score(r,jit(novice(r)),me);bump('MEMORY novice with jittery input passes',res.pass,tok.text+': '+res.message);
   res=SC.score(r,jit(tracing(r)),tr);bump('TRACE  good trace with jittery input passes',res.pass,tok.text+': '+res.message);}
  if(r.length>1){{const rs=SC.score(r,tracing(r).slice(0,-1),tr);bump('TRACE  a missing stroke fails',!rs.pass,tok.text+' -> '+rs.issue);const rm=SC.score(r,novice(r).slice(0,-1),me);bump('MEMORY a missing stroke fails',!rm.pass,tok.text+' -> '+rm.issue);}}
  r.forEach((st,i)=>{if(st.dot||sagOf(st,R)<0.10)return;
    let u=tracing(r);straighten(u,i);res=SC.score(r,u,tr);bump('TRACE  straight line for a curve fails',!res.pass,tok.text+' s'+(i+1)+' sag '+sagOf(st,R).toFixed(2)+' -> '+res.message);
    u=novice(r);straighten(u,i);res=SC.score(r,u,me);bump('MEMORY straight line for a curve fails',!res.pass,tok.text+' s'+(i+1)+' -> '+res.message);});
  res=SC.score(r,shift(tracing(r),200+rnd()*150,150),tr);bump('TRACE  shifted off the guide fails',!res.pass);
  res=SC.score(r,shrink(tracing(r),0.6),tr);bump('TRACE  shrunk well below the guide fails',!res.pass);
  const longest=r.reduce((bi,st,i,a)=>st.pts.length>a[bi].pts.length?i:bi,0);
  const closed=Math.hypot(r[longest].pts[0].x-r[longest].pts.at(-1).x,r[longest].pts[0].y-r[longest].pts.at(-1).y)<0.25*R.size;
  if(!closed){const h=human(r);h[longest].pts.reverse();res=SC.score(r,h,me);bump('MEMORY a reversed stroke still passes (tip only)',res.pass,tok.text+' -> '+res.message);}
  const li=r.map((st,i)=>[i,st.pts.length]).filter(x=>x[1]>15).map(x=>x[0]);
  if(li.length>=2){const h=human(r);[h[li[0]],h[li[1]]]=[h[li[1]],h[li[0]]];res=SC.score(r,h,me);bump('MEMORY swapped stroke order still passes (tip only)',res.pass,tok.text+' -> '+res.message);}
  if(opts.markStrokes){const h=human(r);const k=opts.markStrokes;const base=SC.bbox(h.slice(0,h.length-k));for(let q=h.length-k;q<h.length;q++){const c=SC.bbox([h[q]]);const tgt=opts.markSide==='above'?base.y1+0.15*base.h:base.y0-0.15*base.h;h[q].pts=h[q].pts.map(p=>({x:p.x,y:p.y-c.cy+tgt}));}res=SC.score(r,h,me);bump('MEMORY mark on wrong side -> mark',res.issue==='mark',tok.text+' -> '+res.issue);}
 
  {// new freedoms: marks first, stroke split in two, every stroke reversed
   if(opts.markStrokes){const h=human(r);const k=opts.markStrokes;const re=h.slice(h.length-k).concat(h.slice(0,h.length-k));res=SC.score(r,re,me);bump('MEMORY mark drawn first still passes',res.pass,tok.text+': '+res.message);
     const h2=human(r);const rv=h2.map((st,i)=>i>=h2.length-k?{pts:st.pts.slice().reverse()}:st);res=SC.score(r,rv,me);bump('MEMORY mark strokes reversed still pass',res.pass,tok.text+': '+res.message);}
   const h3=human(r);const li2=r.map((st,i)=>[i,st.pts.length]).filter(x=>x[1]>20).map(x=>x[0]);
   if(li2.length){const i=li2[0];const p=h3[i].pts,mid=Math.floor(p.length/2);const sp=h3.slice();sp.splice(i,1,{pts:p.slice(0,mid+1)},{pts:p.slice(mid)});res=SC.score(r,sp,me);bump('MEMORY a stroke lifted into two pieces still passes',res.pass,tok.text+': '+res.message);}
   const h4=human(r);const k4=opts.markStrokes||0;const all=h4.map((st,i)=>i<h4.length-k4?{pts:st.pts.slice().reverse()}:st);res=SC.score(r,all,me);bump('MEMORY every stroke reversed still passes',res.pass,tok.text+': '+res.message);
   const sc=human(r);const b2=SC.bbox(sc);const zz=[{pts:Array.from({length:40},(_,q)=>({x:b2.x0+(b2.w)*(q%2?0.9:0.1)+rnd()*20,y:b2.y0+b2.h*q/39}))}];res=SC.score(r,zz,me);bump('MEMORY a scribble fails',!res.pass,tok.text+': '+res.message);
   if(opts.markStrokes){const nm=human(r).slice(0,r.length-opts.markStrokes);res=SC.score(r,nm,me);bump('MEMORY a missing mark fails',!res.pass,tok.text+': '+res.message);}
  }
 const same=AL.filter(a=>a.strokes.length===r.length);
  if(same.length){const o=same[Math.floor(rnd()*same.length)].strokes;bump('MEMORY a different letter fails',!SC.score(r,novice(o,0.03),me).pass,tok.text+': another letter passed');bump('TRACE  a different letter fails',!SC.score(r,tracing(o),tr).pass);}
 }}
let bad=0;for(const [k,[ok,no,notes]] of Object.entries(T)){const pct=100*ok/(ok+no);const hardFail=/passes/.test(k)?pct<93:pct<80;if(hardFail)bad++;console.log((hardFail?'✗ ':'✓ ')+k.padEnd(44),String(ok).padStart(4)+'/'+(ok+no),'('+pct.toFixed(0)+'%)');if(hardFail&&notes.length)console.log('     e.g. '+notes.join('\n          '));}
console.log(bad?'\nSCORER NEEDS WORK':'\nSCORER OK');
