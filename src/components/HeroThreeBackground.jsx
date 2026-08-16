import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// Decorative only: it never captures pointer or keyboard input from the page.
export default function HeroThreeBackground() {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!host || reduceMotion.matches) return undefined;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch {
      return undefined;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0, 8);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    const particleCount = window.innerWidth < 640 ? 48 : 88;
    const positions = new Float32Array(particleCount * 3);
    const phases = new Float32Array(particleCount);
    for (let index = 0; index < particleCount; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 1.1 + Math.random() * 2.25;
      positions[index * 3] = Math.cos(angle) * radius;
      positions[index * 3 + 1] = Math.sin(angle) * radius * 0.75;
      positions[index * 3 + 2] = (Math.random() - 0.5) * 1.8;
      phases[index] = Math.random() * Math.PI * 2;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particles = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xed7e65, size: 0.045, transparent: true, opacity: 0.72, depthWrite: false }));
    scene.add(particles);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.05, 0.014, 8, 100),
      new THREE.MeshBasicMaterial({ color: 0x8ab6a4, transparent: true, opacity: 0.45 })
    );
    ring.rotation.set(0.35, -0.42, 0.15);
    scene.add(ring);

    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 28, 28),
      new THREE.MeshBasicMaterial({ color: 0xf0a58d, transparent: true, opacity: 0.7 })
    );
    glow.position.set(1.5, -0.82, 0.4);
    scene.add(glow);

    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const clock = new THREE.Clock();
    let frameId;
    const animate = () => {
      const time = clock.getElapsedTime();
      particles.rotation.z = time * 0.045;
      particles.rotation.y = Math.sin(time * 0.16) * 0.12;
      ring.rotation.z = 0.15 + Math.sin(time * 0.22) * 0.12;
      glow.position.y = -0.82 + Math.sin(time * 0.9) * 0.14;
      glow.position.x = 1.5 + Math.cos(time * 0.7) * 0.08;
      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
      geometry.dispose();
      particles.material.dispose();
      ring.geometry.dispose();
      ring.material.dispose();
      glow.geometry.dispose();
      glow.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={hostRef} className="hero-three" aria-hidden="true" />;
}
