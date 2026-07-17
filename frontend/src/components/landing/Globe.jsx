import { useEffect, useRef, useState } from "react";

// Lightweight dot-matrix globe (Three.js + d3-geo, loaded from a CDN at runtime rather than
// bundled — this is decorative chrome for the landing page only, not worth adding two extra
// dependencies to the app's build for). Lazily started once scrolled near, and only ever
// mounted once per Landing visit (IntersectionObserver disconnects itself after first fire).

const reducedMotion =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
function mapLinear(v, inMin, inMax, outMin, outMax) {
  if (inMax === inMin) return outMin;
  const t = (v - inMin) / (inMax - inMin);
  return outMin + t * (outMax - outMin);
}
function latLngToXYZ(lat, lng) {
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;
  return {
    x: Math.cos(latRad) * Math.sin(lngRad),
    y: Math.sin(latRad),
    z: Math.cos(latRad) * Math.cos(lngRad),
  };
}

async function mountGlobe(container, options = {}) {
  const [THREE, d3geo] = await Promise.all([
    import(/* @vite-ignore */ "https://esm.sh/three@0.160.0"),
    import(/* @vite-ignore */ "https://esm.sh/d3-geo@3"),
  ]);

  const cfg = {
    dotColor: "#E7A23A",
    dotSize: 1.6,
    density: 6,
    outlineColor: "#E7A23A",
    markerColor: "#F3EEE3",
    markers: [{ lat: -17.83, lng: 31.05 }],
    speed: 1,
    initialLatitude: -8,
    initialLongitude: 24,
    scale: 8,
    dragSpeed: 5,
    ...options,
  };

  const width = container.clientWidth || 320;
  const height = container.clientHeight || 320;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
  const scaleMul = mapLinear(clamp(cfg.scale, 1, 20), 1, 20, 0.2, 2);
  const globeRadius = 1 * scaleMul;
  camera.position.set(0, 0, 2.5 / scaleMul);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const canvas = renderer.domElement;
  canvas.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;display:block;opacity:0;transition:opacity .7s ease;cursor:grab;touch-action:none;";
  container.appendChild(canvas);

  const group = new THREE.Group();
  scene.add(group);
  group.rotation.y = (cfg.initialLongitude * Math.PI) / 180;
  group.rotation.x = (cfg.initialLatitude * Math.PI) / 180;

  const oceanMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color("#0A0B0D"),
    transparent: true,
    opacity: 0.35,
  });
  group.add(new THREE.Mesh(new THREE.SphereGeometry(globeRadius * 0.985, 48, 48), oceanMat));

  const outlineGroup = new THREE.Group();
  const markerGroup = new THREE.Group();
  group.add(outlineGroup, markerGroup);

  let landLoaded = false;
  try {
    const res = await fetch(
      "https://raw.githubusercontent.com/martynafford/natural-earth-geojson/refs/heads/master/50m/physical/ne_50m_land.json"
    );
    const land = await res.json();

    const outlineMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(cfg.outlineColor),
      transparent: true,
      opacity: 0.4,
    });
    const addRing = (ring) => {
      if (ring.length < 3) return;
      const step = Math.max(1, Math.floor(ring.length / 140));
      const pts = [];
      for (let i = 0; i < ring.length; i += step) {
        const [lng, lat] = ring[i];
        const p = latLngToXYZ(lat, lng);
        pts.push(new THREE.Vector3(p.x * globeRadius, p.y * globeRadius, p.z * globeRadius));
      }
      if (pts.length < 2) return;
      pts.push(pts[0].clone());
      const curve = new THREE.CatmullRomCurve3(pts);
      const tube = new THREE.TubeGeometry(curve, pts.length * 2, 0.0016, 6, false);
      outlineGroup.add(new THREE.Mesh(tube, outlineMat));
    };
    land.features.forEach((f) => {
      const g = f.geometry;
      if (!g) return;
      if (g.type === "Polygon") addRing(g.coordinates[0]);
      else if (g.type === "MultiPolygon") g.coordinates.forEach((poly) => addRing(poly[0]));
    });

    const bw = 1024;
    const bh = 512;
    const off = document.createElement("canvas");
    off.width = bw;
    off.height = bh;
    const octx = off.getContext("2d");
    const proj = d3geo.geoEquirectangular().fitSize([bw, bh], { type: "Sphere" });
    const path = d3geo.geoPath().projection(proj).context(octx);
    octx.fillStyle = "#000";
    octx.fillRect(0, 0, bw, bh);
    octx.fillStyle = "#fff";
    octx.beginPath();
    land.features.forEach((f) => path(f));
    octx.fill();
    const img = octx.getImageData(0, 0, bw, bh).data;
    const isLand = (lng, lat) => {
      const x = Math.round(((lng + 180) / 360) * bw) % bw;
      const y = clamp(Math.round(((90 - lat) / 180) * bh), 0, bh - 1);
      return img[(y * bw + x) * 4] > 128;
    };

    const dots = [];
    const step = mapLinear(clamp(cfg.density, 1, 10), 1, 10, 3.4, 1.4);
    for (let lat = -90; lat <= 90; lat += step) {
      const cosLat = Math.max(0.15, Math.cos((lat * Math.PI) / 180));
      const lngStep = step / cosLat;
      for (let lng = -180; lng < 180; lng += lngStep) {
        if (isLand(lng, lat)) dots.push([lng, lat]);
      }
    }
    if (dots.length) {
      const dotGeo = new THREE.SphereGeometry(0.014 * cfg.dotSize, 4, 4);
      const dotMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(cfg.dotColor) });
      const dotMesh = new THREE.InstancedMesh(dotGeo, dotMat, dots.length);
      const m = new THREE.Matrix4();
      dots.forEach(([lng, lat], i) => {
        const p = latLngToXYZ(lat, lng);
        m.setPosition(p.x * globeRadius, p.y * globeRadius, p.z * globeRadius);
        dotMesh.setMatrixAt(i, m);
      });
      dotMesh.instanceMatrix.needsUpdate = true;
      group.add(dotMesh);
    }

    const markerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(cfg.markerColor) });
    cfg.markers.forEach((mk) => {
      const p = latLngToXYZ(mk.lat, mk.lng);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.024, 16, 16), markerMat);
      mesh.position.set(p.x * globeRadius * 1.01, p.y * globeRadius * 1.01, p.z * globeRadius * 1.01);
      markerGroup.add(mesh);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.03, 0.045, 24),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(cfg.markerColor),
          transparent: true,
          opacity: 0.5,
          side: THREE.DoubleSide,
        })
      );
      ring.position.copy(mesh.position);
      ring.lookAt(0, 0, 0);
      markerGroup.add(ring);
    });

    canvas.style.opacity = "1";
    landLoaded = true;
  } catch (err) {
    console.warn("Globe: failed to load land data", err);
    canvas.style.opacity = "1";
  }

  let rotX = group.rotation.x;
  let rotY = group.rotation.y;
  let targetX = rotX;
  let targetY = rotY;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let raf = null;
  const autoSpeed = reducedMotion ? 0 : mapLinear(clamp(cfg.speed, 0, 10), 0, 10, 0, 0.006);

  const onDown = (e) => {
    dragging = true;
    canvas.style.cursor = "grabbing";
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    if (!dragging) return;
    const sens = mapLinear(clamp(cfg.dragSpeed, 0, 10), 0, 10, 0.002, 0.02);
    targetY += (e.clientX - lastX) * sens;
    targetX += (e.clientY - lastY) * sens;
    targetX = clamp(targetX, -Math.PI / 2, Math.PI / 2);
    lastX = e.clientX;
    lastY = e.clientY;
  };
  const onUp = (e) => {
    dragging = false;
    canvas.style.cursor = "grab";
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointerleave", onUp);

  const animate = () => {
    if (!dragging) targetY += autoSpeed;
    rotX += (targetX - rotX) * 0.08;
    rotY += (targetY - rotY) * 0.08;
    group.rotation.x = rotX;
    group.rotation.y = rotY;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(animate);
  };
  animate();

  const ro = new ResizeObserver(() => {
    const w = container.clientWidth || width;
    const h = container.clientHeight || height;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
  ro.observe(container);

  return {
    landLoaded,
    dispose: () => {
      if (raf != null) cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onUp);
      renderer.dispose();
      if (canvas.parentNode === container) container.removeChild(canvas);
    },
  };
}

export default function Globe() {
  const mountRef = useRef(null);
  const [status, setStatus] = useState("loading"); // "loading" | "ready" | "offline"

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return undefined;

    let disposed = false;
    let disposeFn = null;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          io.disconnect();
          mountGlobe(el)
            .then((handle) => {
              if (disposed) {
                handle.dispose();
                return;
              }
              disposeFn = handle.dispose;
              setStatus(handle.landLoaded ? "ready" : "offline");
            })
            .catch((err) => {
              console.warn("Globe init failed", err);
              if (!disposed) setStatus("offline");
            });
        });
      },
      { rootMargin: "200px" }
    );
    io.observe(el);

    return () => {
      disposed = true;
      io.disconnect();
      if (disposeFn) disposeFn();
    };
  }, []);

  return (
    <div className="globe-wrap" ref={mountRef}>
      {status !== "ready" && (
        <div className="globe-fallback">
          {status === "loading" ? "Loading globe…" : "Globe unavailable offline"}
        </div>
      )}
    </div>
  );
}
