import * as THREE from "/vendor/three.module.js";
const canvas = document.querySelector("#workspace-scene");
const host = canvas.parentElement;
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
let paused = reduced.matches;
try {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(7, 7, 11);
  camera.lookAt(0, -0.9, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 1.9));
  const key = new THREE.DirectionalLight(0xffffff, 3);
  key.position.set(4, 9, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xcceee9, 2);
  fill.position.set(-5, 3, -3);
  scene.add(fill);
  const group = new THREE.Group();
  scene.add(group);
  group.rotation.set(0.04, -0.18, -0.1);
  const material = (color) =>
    new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.28,
      metalness: 0.12,
      clearcoat: 0.5,
    });
  const blue = material("#158c81"),
    white = material("#ffffff"),
    gray = material("#c6d4db"),
    green = material("#90d5bd"),
    yellow = material("#ee9a80");
  const box = (w, h, d, mat, x, y, z, parent = group) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  // Floating project lanes: simple geometry keeps the animation light on smaller devices.
  const lanes = [];
  [gray, blue, white].forEach((mat, i) => {
    const lane = new THREE.Group();
    lane.position.set((i - 1) * 1.75, 0, (i - 1) * -0.55);
    lane.rotation.y = -0.04 * (i - 1);
    group.add(lane);
    box(1.52, 0.13, 3.55, mat, 0, 0, 0, lane);
    box(0.8, 0.06, 0.12, i === 1 ? white : blue, -0.18, 0.13, -1.35, lane);
    for (let j = 0; j < 3; j++) {
      const y = 0.17 + j * 0.04,
        z = -0.72 + j * 0.95;
      box(1.23, 0.11, 0.74, white, 0, y, z, lane);
      box(
        0.34,
        0.035,
        0.11,
        [blue, green, yellow][j],
        -0.31,
        y + 0.08,
        z - 0.16,
        lane,
      );
      box(0.77, 0.025, 0.045, gray, -0.08, y + 0.08, z + 0.04, lane);
      box(0.48, 0.025, 0.045, gray, -0.23, y + 0.08, z + 0.16, lane);
    }
    lanes.push(lane);
  });
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.ShadowMaterial({ opacity: 0.09 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.5;
  floor.receiveShadow = true;
  scene.add(floor);
  let targetX = 0,
    targetY = 0,
    visible = true;
  const resize = () => {
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;
    // Keep the boards in the open area beside the sign-in form.
    group.position.set(
      rect.width > 650 ? -2.2 : 0,
      0,
      rect.width > 650 ? 1.4 : 0,
    );
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(host);
  resize();
  host.addEventListener("pointermove", (e) => {
    const r = host.getBoundingClientRect();
    targetX = (e.clientX - r.left) / r.width - 0.5;
    targetY = (e.clientY - r.top) / r.height - 0.5;
  });
  host.addEventListener("pointerleave", () => {
    targetX = targetY = 0;
  });
  const toggle = document.querySelector("#animation-toggle");
  function updateToggle() {
    toggle.innerHTML = `<i data-lucide="${paused ? "play" : "pause"}"></i>`;
    toggle.title = toggle.ariaLabel = paused
      ? "Play animation"
      : "Pause animation";
    window.lucide?.createIcons();
  }
  toggle.addEventListener("click", () => {
    paused = !paused;
    updateToggle();
  });
  updateToggle();
  window.addEventListener("scene-visibility", () => {
    visible = !document.querySelector("#auth-screen").hidden;
    resize();
  });
  let t = 0,
    last = performance.now(),
    measuredSize = "";
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (!visible || !host.offsetWidth || document.hidden) return;
    if (!paused) {
      t += dt;
      lanes.forEach(
        (l, i) =>
          (l.position.y =
            Math.sin(t * 0.7 + i * 0.8) * 0.18 + (i === 1 ? 0.35 : 0)),
      );
      group.rotation.y += (-0.18 + targetX * 0.18 - group.rotation.y) * 0.04;
      group.rotation.z += (-0.1 + targetY * 0.06 - group.rotation.z) * 0.04;
    }
    renderer.render(scene, camera);
    const sizeKey = `${canvas.width}x${canvas.height}`;
    if (measuredSize !== sizeKey) {
      const gl = renderer.getContext();
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(
        0,
        0,
        canvas.width,
        canvas.height,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels,
      );
      let painted = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) painted++;
      canvas.dataset.paintedPixels = String(painted);
      measuredSize = sizeKey;
    }
    canvas.dataset.rendered = "true";
    canvas.dataset.frame = String(Math.floor(t * 10));
  }
  requestAnimationFrame(frame);
} catch (error) {
  canvas.hidden = true;
  host.dataset.fallback = "true";
  console.warn("3D preview unavailable:", error.message);
}
