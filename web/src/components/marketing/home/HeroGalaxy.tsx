'use client';

import { useEffect, useRef } from 'react';
import { Camera, Geometry, Mesh, Program, Renderer } from 'ogl';

const PARTICLE_COLORS = ['#ffffff', '#f5fbff', '#e9f6fb', '#7AD9DA'];
const PARTICLE_COUNT = 500;
const PARTICLE_SPREAD = 10;
const PARTICLE_SPEED = 0.5;
const PARTICLE_BASE_SIZE = 100;
const PARTICLE_HOVER_FACTOR = 1;
const PIXEL_RATIO = 1;

function hexToRgb(hex: string) {
    const normalized = hex.replace(/^#/, '');
    const fullHex = normalized.length === 3
        ? normalized
            .split('')
            .map((char) => char + char)
            .join('')
        : normalized;

    const value = Number.parseInt(fullHex, 16);

    return [
        ((value >> 16) & 255) / 255,
        ((value >> 8) & 255) / 255,
        (value & 255) / 255,
    ];
}

const vertex = /* glsl */ `
attribute vec3 position;
attribute vec4 random;
attribute vec3 color;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;
uniform float uSpread;
uniform float uBaseSize;
uniform float uSizeRandomness;

varying vec4 vRandom;
varying vec3 vColor;

void main() {
  vRandom = random;
  vColor = color;

  vec3 pos = position * uSpread;
  pos.z *= 10.0;

  vec4 mPos = modelMatrix * vec4(pos, 1.0);
  float t = uTime;
  mPos.x += sin(t * random.z + 6.28 * random.w) * mix(0.1, 1.5, random.x);
  mPos.y += sin(t * random.y + 6.28 * random.x) * mix(0.1, 1.5, random.w);
  mPos.z += sin(t * random.w + 6.28 * random.y) * mix(0.1, 1.5, random.z);

  vec4 mvPos = viewMatrix * mPos;

  if (uSizeRandomness == 0.0) {
    gl_PointSize = uBaseSize;
  } else {
    gl_PointSize = (uBaseSize * (1.0 + uSizeRandomness * (random.x - 0.5))) / length(mvPos.xyz);
  }

  gl_Position = projectionMatrix * mvPos;
}
`;

const fragment = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uAlphaParticles;
varying vec4 vRandom;
varying vec3 vColor;

void main() {
  vec2 uv = gl_PointCoord.xy;
  float d = length(uv - vec2(0.5));

  if (uAlphaParticles < 0.5) {
    if (d > 0.5) {
      discard;
    }
    gl_FragColor = vec4(vColor + 0.15 * sin(uv.yxx + uTime + vRandom.y * 6.28), 1.0);
  } else {
    float circle = smoothstep(0.5, 0.4, d) * 0.8;
    gl_FragColor = vec4(vColor + 0.15 * sin(uv.yxx + uTime + vRandom.y * 6.28), circle);
  }
}
`;

interface HeroGalaxyProps {
    className?: string;
}

export default function HeroGalaxy({ className = '' }: HeroGalaxyProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mouseRef = useRef({ x: 0, y: 0 });

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
        const saveData = Boolean(connection?.saveData);

        if (reduceMotion || saveData || window.innerWidth < 1024) {
            return;
        }

        const container = containerRef.current;
        if (!container) return;

        let renderer: Renderer;
        try {
            renderer = new Renderer({
                dpr: PIXEL_RATIO,
                depth: false,
                alpha: true,
            });
        } catch {
            return;
        }

        const { gl } = renderer;
        gl.clearColor(0, 0, 0, 0);
        container.appendChild(gl.canvas);

        // fov=45 (was 15): the hero rebrand made the section much taller (~1500px
        // with the new eyebrow + 2-line h1 + subtitle + trust line + iframe).
        // The old narrow fov clipped all but the center ~26% of the particle
        // sphere, which after the section grew taller fell into the iframe area
        // — so the galaxy looked "gone" from the hero text. A wider fov keeps
        // the whole sphere visible across hero text AND iframe gutters.
        const camera = new Camera(gl, { fov: 45 });
        camera.position.set(0, 0, 20);

        const resize = () => {
            const width = container.clientWidth;
            const height = container.clientHeight;
            if (width <= 0 || height <= 0) return;
            renderer.setSize(width, height);
            camera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
        };

        const handleMouseMove = (event: MouseEvent) => {
            const rect = container.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
            mouseRef.current = { x, y };
        };

        // ResizeObserver covers every cause of container size change — initial
        // layout settling, font load reflow, DeferredEmbed iframe mounting,
        // window resize, viewport orientation. Without it, the canvas keeps
        // its mount-time dimensions and ends up squished or off-screen the
        // moment anything below it grows.
        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
        ro?.observe(container);
        window.addEventListener('resize', resize, { passive: true });
        container.addEventListener('mousemove', handleMouseMove);
        resize();

        const positions = new Float32Array(PARTICLE_COUNT * 3);
        const randoms = new Float32Array(PARTICLE_COUNT * 4);
        const colors = new Float32Array(PARTICLE_COUNT * 3);

        for (let index = 0; index < PARTICLE_COUNT; index += 1) {
            let x = 0;
            let y = 0;
            let z = 0;
            let length = 0;

            do {
                x = Math.random() * 2 - 1;
                y = Math.random() * 2 - 1;
                z = Math.random() * 2 - 1;
                length = x * x + y * y + z * z;
            } while (length > 1 || length === 0);

            const radius = Math.cbrt(Math.random());

            positions.set([x * radius, y * radius, z * radius], index * 3);
            randoms.set([Math.random(), Math.random(), Math.random(), Math.random()], index * 4);
            colors.set(hexToRgb(PARTICLE_COLORS[index % PARTICLE_COLORS.length]), index * 3);
        }

        const geometry = new Geometry(gl, {
            position: { size: 3, data: positions },
            random: { size: 4, data: randoms },
            color: { size: 3, data: colors },
        });

        const program = new Program(gl, {
            vertex,
            fragment,
            uniforms: {
                uTime: { value: 0 },
                uSpread: { value: PARTICLE_SPREAD },
                uBaseSize: { value: PARTICLE_BASE_SIZE * PIXEL_RATIO },
                uSizeRandomness: { value: 1 },
                uAlphaParticles: { value: 0 },
            },
            transparent: true,
            depthTest: false,
        });

        const particles = new Mesh(gl, { mode: gl.POINTS, geometry, program });

        let animationFrameId = 0;
        let lastTime = performance.now();
        let elapsed = 0;
        let contextLost = false;

        const update = (time: number) => {
            // Don't re-queue or render while the GPU context is gone — Chrome
            // will fire webglcontextrestored later and we'll resume from there.
            if (contextLost) return;
            animationFrameId = window.requestAnimationFrame(update);
            const delta = time - lastTime;
            lastTime = time;
            elapsed += delta * PARTICLE_SPEED;

            program.uniforms.uTime.value = elapsed * 0.001;
            particles.position.x = -mouseRef.current.x * PARTICLE_HOVER_FACTOR;
            particles.position.y = -mouseRef.current.y * PARTICLE_HOVER_FACTOR;

            try {
                renderer.render({ scene: particles, camera });
            } catch {
                // Swallow transient render failures so a single bad frame
                // doesn't trip Next.js's global error boundary on prod.
            }
        };

        animationFrameId = window.requestAnimationFrame(update);

        // ── WebGL context loss / recovery ──
        // Root cause of the "galaxy disappears after ~2s" bug: when the
        // DeferredEmbed iframe (shared analytics dashboard) finishes mounting
        // and Chromium's GPU process feels pressure, it evicts the LRU WebGL
        // context — which is this one, since the iframe just got busier. The
        // default behaviour is permanent loss. preventDefault() on the lost
        // event tells the browser we can recover; restored fires later and
        // we re-bind uniforms + resume the RAF loop.
        const handleContextLost = (e: Event) => {
            e.preventDefault();
            contextLost = true;
            window.cancelAnimationFrame(animationFrameId);
        };
        const handleContextRestored = () => {
            contextLost = false;
            // Re-upload uniforms — they may be reset by the driver on restore.
            // Geometry / program / mesh references in OGL hold their own gl
            // resources and re-create as needed on the next render call.
            program.uniforms.uTime.value = 0;
            lastTime = performance.now();
            animationFrameId = window.requestAnimationFrame(update);
        };
        gl.canvas.addEventListener('webglcontextlost', handleContextLost as EventListener, false);
        gl.canvas.addEventListener('webglcontextrestored', handleContextRestored as EventListener, false);

        // Pause the loop when the tab is hidden — saves GPU and reduces the
        // chance of being the LRU context targeted for eviction.
        const handleVisibility = () => {
            if (document.hidden) {
                window.cancelAnimationFrame(animationFrameId);
            } else if (!contextLost) {
                lastTime = performance.now();
                animationFrameId = window.requestAnimationFrame(update);
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            ro?.disconnect();
            window.removeEventListener('resize', resize);
            container.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('visibilitychange', handleVisibility);
            gl.canvas.removeEventListener('webglcontextlost', handleContextLost as EventListener);
            gl.canvas.removeEventListener('webglcontextrestored', handleContextRestored as EventListener);
            window.cancelAnimationFrame(animationFrameId);

            // Explicitly release the GL context so a re-mount (StrictMode in
            // dev, or any future remount) doesn't pile up against the per-page
            // WebGL context limit.
            try {
                const loseCtx = gl.getExtension('WEBGL_lose_context');
                loseCtx?.loseContext();
            } catch { /* extension unsupported — fine */ }

            if (container.contains(gl.canvas)) {
                container.removeChild(gl.canvas);
            }
        };
    }, []);

    return (
        <div
            ref={containerRef}
            className={`pointer-events-none absolute inset-0 overflow-hidden opacity-90 ${className}`}
        />
    );
}
