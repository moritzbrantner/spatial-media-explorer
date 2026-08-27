import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { CameraObservation, ProjectSnapshot } from "../../types";

type Props = {
  project: ProjectSnapshot;
  activeCamera: CameraObservation | null;
  selectedPointId: number | null;
  onSelectPoint: (pointId: number | null) => void;
};

export function ScenePanel({ project, activeCamera, selectedPointId, onSelectPoint }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeMarkerRef = useRef<THREE.Mesh | null>(null);
  const selectedMarkerRef = useRef<THREE.Mesh | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const scene = new THREE.Scene();
    const width = container.clientWidth;
    const height = Math.max(container.clientHeight, 320);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    container.replaceChildren(renderer.domElement);

    const center = new THREE.Vector3(
      (project.bounds.min[0] + project.bounds.max[0]) / 2,
      (project.bounds.min[1] + project.bounds.max[1]) / 2,
      (project.bounds.min[2] + project.bounds.max[2]) / 2,
    );
    const extent = new THREE.Vector3(
      project.bounds.max[0] - project.bounds.min[0],
      project.bounds.max[1] - project.bounds.min[1],
      project.bounds.max[2] - project.bounds.min[2],
    );
    const radius = Math.max(extent.length() * 0.65, 1);
    const camera = new THREE.PerspectiveCamera(50, width / height, radius / 1000, radius * 100);
    camera.position.copy(center).add(new THREE.Vector3(radius, radius * 0.65, radius));

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(center);
    controls.enableDamping = true;

    const positions = new Float32Array(project.points.length * 3);
    project.points.forEach((point, index) => {
      positions[index * 3] = point.position[0];
      positions[index * 3 + 1] = point.position[1];
      positions[index * 3 + 2] = point.position[2];
    });
    const pointGeometry = new THREE.BufferGeometry();
    pointGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(
      pointGeometry,
      new THREE.PointsMaterial({ size: Math.max(radius / 450, 0.008), sizeAttenuation: true }),
    );
    scene.add(points);

    const cameraGeometry = new THREE.BufferGeometry();
    const cameraVertices: number[] = [];
    for (const observation of project.cameras) {
      cameraVertices.push(...observation.position);
      cameraVertices.push(
        observation.position[0] + observation.forward[0] * radius * 0.04,
        observation.position[1] + observation.forward[1] * radius * 0.04,
        observation.position[2] + observation.forward[2] * radius * 0.04,
      );
    }
    cameraGeometry.setAttribute("position", new THREE.Float32BufferAttribute(cameraVertices, 3));
    scene.add(new THREE.LineSegments(cameraGeometry, new THREE.LineBasicMaterial()));

    const activeMarker = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(radius / 100, 0.02), 16, 12),
      new THREE.MeshBasicMaterial(),
    );
    activeMarker.visible = false;
    activeMarkerRef.current = activeMarker;
    scene.add(activeMarker);

    const selectedMarker = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(radius / 80, 0.015), 16, 12),
      new THREE.MeshBasicMaterial(),
    );
    selectedMarker.visible = false;
    selectedMarkerRef.current = selectedMarker;
    scene.add(selectedMarker);

    scene.add(new THREE.GridHelper(radius * 3, 20));

    const raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: Math.max(radius / 100, 0.02) };
    const pointer = new THREE.Vector2();
    const onPointerDown = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(points, false)[0];
      const index = hit?.index;
      onSelectPoint(typeof index === "number" ? (project.points[index]?.id ?? null) : null);
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);

    let animationFrame = 0;
    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(render);
    };
    render();

    const resizeObserver = new ResizeObserver(() => {
      const nextWidth = container.clientWidth;
      const nextHeight = Math.max(container.clientHeight, 320);
      renderer.setSize(nextWidth, nextHeight);
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      activeMarkerRef.current = null;
      selectedMarkerRef.current = null;
      controls.dispose();
      pointGeometry.dispose();
      cameraGeometry.dispose();
      renderer.dispose();
      container.replaceChildren();
    };
  }, [onSelectPoint, project]);

  useEffect(() => {
    const marker = activeMarkerRef.current;
    if (!marker) {
      return;
    }
    marker.visible = activeCamera !== null;
    if (activeCamera) {
      marker.position.fromArray(activeCamera.position);
    }
  }, [activeCamera]);

  useEffect(() => {
    const marker = selectedMarkerRef.current;
    if (!marker) {
      return;
    }
    const selectedPoint =
      selectedPointId === null
        ? null
        : (project.points.find((point) => point.id === selectedPointId) ?? null);
    marker.visible = selectedPoint !== null;
    if (selectedPoint) {
      marker.position.fromArray(selectedPoint.position);
    }
  }, [project.points, selectedPointId]);

  return (
    <section className="workspace-panel scene-panel" aria-labelledby="scene-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">COLMAP reconstruction</p>
          <h2 id="scene-heading">3D scene</h2>
        </div>
        <span className="frame-pill">
          {activeCamera ? `Camera ${activeCamera.imageId}` : "No camera"}
        </span>
      </div>
      <div className="scene-stage" ref={containerRef} />
      <p className="panel-help">
        Drag to orbit, scroll to zoom, and click a sparse point to inspect its source frames.
      </p>
    </section>
  );
}
