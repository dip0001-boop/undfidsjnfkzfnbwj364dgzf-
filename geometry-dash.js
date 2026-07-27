const canvas=document.getElementById("game"),ctx=canvas.getContext("2d");
let W,H,playing=false,dead=false,last=0,progress=0,score=0;
const player={x:150,y:0,size:34,vy:0,onGround:false,rotation:0};
const gravity=2100,jump=-760,speed=360;
let obstacles=[];
function resize(){W=canvas.width=innerWidth*devicePixelRatio;H=canvas.height=innerHeight*devicePixelRatio;canvas.style.width=innerWidth+"px";canvas.style.height=innerHeight+"px";ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);W=innerWidth;H=innerHeight}
addEventListener("resize",resize);resize();
function reset(){player.y=H-140-player.size;player.vy=0;player.rotation=0;progress=0;score=0;dead=false;obstacles=[];for(let i=0;i<80;i++)obstacles.push({x:650+i*360+Math.random()*180,w:40+Math.random()*35,h:35+Math.random()*55});}
function jumpNow(){if(!playing){start();return}if(player.onGround)player.vy=jump}
function start(){document.getElementById("start").classList.add("hidden");document.getElementById("dead").classList.add("hidden");reset();playing=true;last=performance.now();requestAnimationFrame(loop)}
function crash(){playing=false;dead=true;document.getElementById("final").textContent=`You reached ${Math.floor(progress)}%`;document.getElementById("dead").classList.remove("hidden")}
function loop(t){if(!playing)return;const dt=Math.min((t-last)/1000,.03);last=t;update(dt);draw();requestAnimationFrame(loop)}
function update(dt){player.vy+=gravity*dt;player.y+=player.vy*dt;const ground=H-140-player.size;player.onGround=false;if(player.y>=ground){player.y=ground;player.vy=0;player.onGround=true;player.rotation=0}else player.rotation+=dt*8;
for(const o of obstacles){o.x-=speed*dt;if(o.x<-100)o.x+=80*360;const ox=o.x,oy=H-140-o.h;if(player.x+player.size>ox&&player.x<ox+o.w&&player.y+player.size>oy&&player.y<oy+o.h)crash()}
progress=Math.min(100,progress+dt*4);score=progress;document.getElementById("score").textContent=Math.floor(score)+"%"}
function draw(){ctx.clearRect(0,0,W,H);const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,"#151c35");g.addColorStop(1,"#090d18");ctx.fillStyle=g;ctx.fillRect(0,0,W,H);ctx.fillStyle="#273557";for(let x=0;x<W;x+=80)ctx.fillRect(x,H-140,2,140);ctx.fillStyle="#5fd9ff";ctx.fillRect(0,H-140,W,4);ctx.save();ctx.translate(player.x+17,player.y+17);ctx.rotate(player.rotation);ctx.fillStyle="#8e7bff";ctx.fillRect(-17,-17,34,34);ctx.restore();ctx.fillStyle="#ff6d8b";for(const o of obstacles){ctx.beginPath();ctx.moveTo(o.x,H-140);ctx.lineTo(o.x+o.w/2,H-140-o.h);ctx.lineTo(o.x+o.w,H-140);ctx.fill()}}
addEventListener("keydown",e=>{if(e.code==="Space"){e.preventDefault();jumpNow()}});addEventListener("pointerdown",jumpNow);document.getElementById("startBtn").onclick=start;document.getElementById("retry").onclick=start;document.getElementById("back").onclick=()=>location.href="/";