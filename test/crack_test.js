const L=require('./load')(['util.js','phys.js','rocks.js','machine.js','sim.js','career.js']);
const {Sim,MATS,Career,Rocks}=L;
for (const mk of ['marmor','skifer','gneis','granitt','gabbro']) for (const mm of [350,600,900]) {
 const s=Career.newGame('x'); s.tier=2; const sim=new Sim(s,{seed:3});
 const m=MATS[mk], poly=Rocks.genBlockPoly(mm/2/sim.mmpx,m,sim.rng,0.3);
 let b=sim.addRock(poly,400,-400,0,m,{fol:0.3,tex:Rocks.genTex(m,L.Poly.radius(poly),sim.rng,0.3)});
 const M0=b.rock.mass; let n=0,res='',spalls=0; const lens=[];
 // aim at the same spot: the middle of the top face (world), every blow
 let aim=null;
 while(n<80){n++;
  const big=sim.rocks.slice().sort((a,c)=>c.rock.mass-a.rock.mass)[0]; b=big;
  if(b.rock.mass<M0*0.55){res='split';break;}
  if(!aim){ let top=null; for(const q of b.rock.poly){const c=Math.cos(b.a),sn=Math.sin(b.a); const wy=b.y+q.x*sn+q.y*c; if(!top||wy<top.y) top={x:b.x+q.x*c-q.y*sn,y:wy};} aim={x:b.x, y:top.y}; }
  // ray down from above to the surface at aim.x
  let y=aim.y-50; while(y<b.y && !sim.world.pointQuery(aim.x,y,sh=>sh.body===b)[0]) y+=1;
  res=sim.strike(b, aim.x, y+2, 360,'sledge'); if(res==='spall')spalls++;
  const nb=sim.rocks.slice().sort((a,c)=>c.rock.mass-a.rock.mass)[0];
  const c=nb.rock.cracks.filter(c=>c.len!=null).map(c=>Math.round(c.len/(c.chord||1)*100)); lens.push(c.join('/'));
  for(const r of sim.rocks){r.vx=r.vy=0;r.w=0;}
 }
 console.log(mk.padEnd(8), (mm+'mm').padEnd(6), 'blows',String(n).padStart(2), res.padEnd(6),'spalls',spalls,'|', lens.slice(0,10).join(' '));
}
