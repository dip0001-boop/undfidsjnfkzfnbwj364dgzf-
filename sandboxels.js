const canvas=document.getElementById("canvas"),ctx=canvas.getContext("2d");let W,H,paused=false,brush=8,selected="sand",mouse=false;
const elements={sand:{color:"#d6ad68",density:5},water:{color:"#4c9ee8",density:3},wall:{color:"#778399",density:99},wood:{color:"#986b42",density:8},fire:{color:"#ff7b38",density:1},smoke:{color:"#9da7b7",density:0},plant:{color:"#54b86b",density:7}};
let scale=5,grid=[],cols,rows;
function resize(){W=canvas.clientWidth;H=canvas.clientHeight;canvas.width=W;canvas.height=H;cols=Math.floor(W/scale);rows=Math.floor(H/scale);grid=Array.from({length:rows},()=>Array(cols).fill(null))}
function inside(x,y){return x>=0&&y>=0&&x<cols&&y<rows}
function set(x,y,type){if(inside(x,y))grid[y][x]=type}
function get(x,y){return inside(x,y)?grid[y][x]:null}
function swap(x1,y1,x2,y2){const t=grid[y1][x1];grid[y1][x1]=grid[y2][x2];grid[y2][x2]=t}
function step(){if(paused)return;for(let y=rows-2;y>=0;y--)for(let x=0;x<cols;x++){const type=grid[y][x];if(!type)continue;const e=elements[type];if(type==="fire"){if(Math.random()<.04)grid[y][x]=null;else if(Math.random()<.03&&inside(x,y-1)&&!grid[y-1][x])grid[y-1][x]="fire";continue}if(type==="smoke"){if(Math.random()<.03)grid[y][x]=null;else if(!get(x,y-1)){swap(x,y,x,y-1);continue}}if(e.density<99){if(!get(x,y+1)){swap(x,y,x,y+1);continue}let dir=Math.random()<.5?-1:1;if(!get(x+dir,y+1)&&e.density<getDensity(x+dir,y+1)){swap(x,y,x+dir,y+1);continue}if(type==="water"&&!get(x+dir,y)&&!get(x+dir,y+1)){swap(x,y,x+dir,y);continue}}if(type==="fire"&&get(x,y+1)==="wood")grid[y+1][x]="fire";if(type==="water"&&get(x,y+1)==="fire")grid[y+1][x]="smoke"}}
function getDensity(x,y){const t=get(x,y);return t?elements[t].density:0}
function draw(){ctx.clearRect(0,0,W,H);for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const t=grid[y][x];if(t){ctx.fillStyle=elements[t].color;ctx.fillRect(x*scale,y*scale,scale,scale)}}}
function loop(){step();draw();requestAnimationFrame(loop)}
function paint(e){const r=brush;for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(dx*dx+dy*dy<=r*r&&Math.random()<.8)set(e.x+dx,e.y+dy,selected)}
function pos(e){const r=canvas.getBoundingClientRect();return{x:Math.floor((e.clientX-r.left)/scale),y:Math.floor((e.clientY-r.top)/scale)}}
canvas.onpointerdown=e=>{mouse=true;paint(pos(e))};canvas.onpointermove=e=>{if(mouse)paint(pos(e))};addEventListener("pointerup",()=>mouse=false);
document.getElementById("size").oninput=e=>brush=+e.target.value;document.getElementById("pause").onclick=()=>{paused=!paused;document.getElementById("pause").textContent=paused?"Resume":"Pause"};document.getElementById("clear").onclick=()=>grid=Array.from({length:rows},()=>Array(cols).fill(null));document.getElementById("back").onclick=()=>location.href="/";
document.getElementById("elements").innerHTML=Object.entries(elements).map(([k,v])=>`<button class="element" data-e="${k}">${k}</button>`).join("");document.querySelectorAll(".element").forEach(b=>b.onclick=()=>{selected=b.dataset.e;document.querySelectorAll(".element").forEach(x=>x.classList.remove("active"));b.classList.add("active")});document.querySelector(".element").classList.add("active");
addEventListener("resize",resize);resize();loop();