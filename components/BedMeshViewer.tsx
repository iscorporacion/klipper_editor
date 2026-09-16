"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export type BedMeshViewerData = {
  points: number[][];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

type BedMeshViewerProps = {
  data: BedMeshViewerData | null;
  showSurface: boolean;
  showPoints: boolean;
  showFlat: boolean;
  showWireframe: boolean;
  scaleGradient: boolean;
  zScale: number;
  accent: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function colorForHeight(value: number, min: number, max: number, scaleGradient: boolean) {
  const span = Math.max(Math.abs(max - min), 0.001);
  const t = scaleGradient ? clamp((value - min) / span, 0, 1) : clamp((value + span / 2) / span, 0, 1);
  const color = new THREE.Color();
  if (t < 0.5) {
    color.lerpColors(new THREE.Color("#3f5ccf"), new THREE.Color("#f3f5d4"), t * 2);
  } else {
    color.lerpColors(new THREE.Color("#f3f5d4"), new THREE.Color("#d4152f"), (t - 0.5) * 2);
  }
  return color;
}

function makeSurface(data: BedMeshViewerData, zScale: number, scaleGradient: boolean, showWireframe: boolean) {
  const rows = data.points.length;
  const cols = data.points[0]?.length ?? 0;
  const values = data.points.flat();
  const minZ = Math.min(...values);
  const maxZ = Math.max(...values);
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const width = Math.max(data.maxX - data.minX, 1);
  const depth = Math.max(data.maxY - data.minY, 1);
  const scale = Math.max(width, depth);

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const px = cols === 1 ? 0 : ((data.minX + (width * x) / (cols - 1)) - (data.minX + width / 2)) / scale;
      const py = rows === 1 ? 0 : ((data.minY + (depth * y) / (rows - 1)) - (data.minY + depth / 2)) / scale;
      const pz = data.points[y][x] * zScale;
      const color = colorForHeight(data.points[y][x], minZ, maxZ, scaleGradient);
      positions.push(px * width, pz * 46, py * depth);
      colors.push(color.r, color.g, color.b);
    }
  }

  for (let y = 0; y < rows - 1; y += 1) {
    for (let x = 0; x < cols - 1; x += 1) {
      const a = y * cols + x;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: 0.05,
    roughness: 0.72,
    side: THREE.DoubleSide,
    wireframe: showWireframe
  });
  return new THREE.Mesh(geometry, material);
}

function makePointCloud(data: BedMeshViewerData, zScale: number, accent: string) {
  const rows = data.points.length;
  const cols = data.points[0]?.length ?? 0;
  const width = Math.max(data.maxX - data.minX, 1);
  const depth = Math.max(data.maxY - data.minY, 1);
  const scale = Math.max(width, depth);
  const positions: number[] = [];

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const px = cols === 1 ? 0 : ((data.minX + (width * x) / (cols - 1)) - (data.minX + width / 2)) / scale;
      const py = rows === 1 ? 0 : ((data.minY + (depth * y) / (rows - 1)) - (data.minY + depth / 2)) / scale;
      positions.push(px * width, data.points[y][x] * zScale * 46 + 1.2, py * depth);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ color: accent, size: Math.max(width, depth) * 0.018, sizeAttenuation: true })
  );
}

function makeFlatPlane(data: BedMeshViewerData) {
  const width = Math.max(data.maxX - data.minX, 1);
  const depth = Math.max(data.maxY - data.minY, 1);
  const geometry = new THREE.PlaneGeometry(width, depth, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color: "#d7e2ee",
    transparent: true,
    opacity: 0.16,
    side: THREE.DoubleSide
  });
  return new THREE.Mesh(geometry, material);
}

function makeAxisLabel(text: string, color: string, size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(9, 13, 18, 0.72)";
    context.strokeStyle = color;
    context.lineWidth = 6;
    context.beginPath();
    context.roundRect(14, 14, 100, 100, 18);
    context.fill();
    context.stroke();
    context.fillStyle = color;
    context.font = "bold 72px Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, 64, 68);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.scale.set(size, size, 1);
  return sprite;
}

function makeAxes(data: BedMeshViewerData) {
  const width = Math.max(data.maxX - data.minX, 1);
  const depth = Math.max(data.maxY - data.minY, 1);
  const span = Math.max(width, depth);
  const xHalf = width / 2;
  const yHalf = depth / 2;
  const axisLength = span * 0.14;
  const labelSize = span * 0.048;
  const arrowSize = span * 0.018;
  const origin = new THREE.Vector3(-xHalf, span * 0.012, yHalf);
  const group = new THREE.Group();
  const axes = [
    { label: "X", color: "#ff5a5f", direction: new THREE.Vector3(1, 0, 0) },
    { label: "Y", color: "#42d96b", direction: new THREE.Vector3(0, 0, -1) },
    { label: "Z", color: "#4aa3ff", direction: new THREE.Vector3(0, 1, 0) }
  ];

  const originDot = new THREE.Mesh(
    new THREE.SphereGeometry(arrowSize * 1.35, 18, 18),
    new THREE.MeshBasicMaterial({ color: "#42d96b" })
  );
  originDot.position.copy(origin);
  group.add(originDot);

  for (const axis of axes) {
    const end = origin.clone().add(axis.direction.clone().multiplyScalar(axisLength));
    const labelPosition = origin.clone().add(axis.direction.clone().multiplyScalar(axisLength + labelSize * 0.7));
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
      origin,
      end
    ]);
    group.add(new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: axis.color, linewidth: 2 })));

    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(arrowSize, arrowSize * 2.8, 20),
      new THREE.MeshBasicMaterial({ color: axis.color })
    );
    cone.position.copy(end);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.direction.clone().normalize());
    group.add(cone);

    const label = makeAxisLabel(axis.label, axis.color, labelSize);
    label.position.copy(labelPosition);
    group.add(label);
  }

  return group;
}

export default function BedMeshViewer({
  data,
  showSurface,
  showPoints,
  showFlat,
  showWireframe,
  scaleGradient,
  zScale,
  accent
}: BedMeshViewerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const normalized = useMemo(() => {
    if (!data?.points.length || !data.points[0]?.length) return null;
    const columns = data.points[0].length;
    if (!data.points.every((row) => row.length === columns)) return null;
    return data;
  }, [data]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.replaceChildren();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#090d12");
    const camera = new THREE.PerspectiveCamera(42, Math.max(host.clientWidth, 1) / Math.max(host.clientHeight, 1), 0.1, 5000);
    camera.position.set(0, 145, 270);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(host.clientWidth || 1, host.clientHeight || 1);
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0, 0);

    scene.add(new THREE.HemisphereLight("#d7e2ee", "#1a2028", 2.6));
    const light = new THREE.DirectionalLight("#ffffff", 2.4);
    light.position.set(80, 160, 120);
    scene.add(light);

    if (normalized) {
      const width = Math.max(normalized.maxX - normalized.minX, 1);
      const depth = Math.max(normalized.maxY - normalized.minY, 1);
      scene.add(new THREE.GridHelper(Math.max(width, depth), 10, "#45505e", "#27313d"));
      scene.add(makeAxes(normalized));
      if (showFlat) scene.add(makeFlatPlane(normalized));
      if (showSurface) scene.add(makeSurface(normalized, zScale, scaleGradient, showWireframe));
      if (showPoints) scene.add(makePointCloud(normalized, zScale, accent));
      camera.position.set(0, Math.max(width, depth) * 0.54, Math.max(width, depth) * 1.05);
      controls.update();
    }

    const resize = () => {
      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    let frame = 0;
    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line || object instanceof THREE.Sprite) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => {
            if ("map" in material && material.map) material.map.dispose();
            material.dispose();
          });
        }
      });
      host.replaceChildren();
    };
  }, [accent, normalized, scaleGradient, showFlat, showPoints, showSurface, showWireframe, zScale]);

  return <div ref={hostRef} className="bed-mesh-canvas" data-testid="bed-mesh-canvas" />;
}
