import * as THREE from '/vendor/three.module.js';
const canvas=document.querySelector('#communityScene');
const host=document.querySelector('#communityBanner');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let paused=reduced.matches;
try{
  const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setClearColor(0x242c28,0);
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.5;
  const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(32,1,.1,100);camera.position.set(0,0,8);
  scene.add(new THREE.HemisphereLight(0xffffff,0x637255,3));
  const key=new THREE.DirectionalLight(0xffffff,5);key.position.set(-3,4,5);scene.add(key);
  const rim=new THREE.DirectionalLight(0xe1c9f2,4);rim.position.set(4,-2,2);scene.add(rim);
  const sculpture=new THREE.Group();scene.add(sculpture);
  const geometry=new THREE.TorusGeometry(.91,.25,32,100);
  [0xcbf587,0xeee8ec,0xaa87ad].forEach((color,i)=>{const mesh=new THREE.Mesh(geometry,new THREE.MeshPhysicalMaterial({color,metalness:.32,roughness:.22,clearcoat:1}));mesh.rotation.set(i*Math.PI/3,Math.PI/4+i*.65,i*.55);mesh.position.y=(i-1)*.19;sculpture.add(mesh);});
  let width=0,height=0;let pointerX=0,pointerY=0;
  function resize(){width=host.clientWidth;height=host.clientHeight;if(!width||!height)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();const visibleWidth=2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.position.z*camera.aspect;sculpture.position.x=visibleWidth*(width<430?.34:.255);sculpture.scale.setScalar(width<430?.62:.9);}
  new ResizeObserver(resize).observe(host);resize();
  host.addEventListener('pointermove',e=>{const r=host.getBoundingClientRect();pointerX=(e.clientX-r.left)/r.width-.5;pointerY=(e.clientY-r.top)/r.height-.5;});
  host.addEventListener('pointerleave',()=>{pointerX=0;pointerY=0;});
  const control=document.querySelector('#motionButton');
  function sync(){control.innerHTML=`<i data-lucide="${paused?'play':'pause'}"></i>`;control.setAttribute('aria-label',paused?'Play animation':'Pause animation');control.title=paused?'Play animation':'Pause animation';window.lucide?.createIcons();}
  control.addEventListener('click',()=>{paused=!paused;sync();});reduced.addEventListener('change',()=>{paused=reduced.matches;sync();});sync();
  let tick=0;let last=performance.now();
  renderer.setAnimationLoop(now=>{const dt=Math.min((now-last)/1000,.05);last=now;if(document.hidden||host.hidden)return;if(!paused)tick+=dt;sculpture.rotation.y=.3+tick*.19+(paused?0:pointerX*.25);sculpture.rotation.z=-.2+Math.sin(tick*.45)*.1;sculpture.rotation.x=.3+(paused?0:pointerY*.2);sculpture.position.y=(width<430?-.25:0)+Math.sin(tick*.8)*.09;renderer.render(scene,camera);canvas.dataset.rendered='true';});
}catch(error){canvas.hidden=true;document.querySelector('#motionButton').hidden=true;host.classList.add('no-webgl');}
