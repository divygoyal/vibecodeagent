'use client';

import { useEffect, useRef } from 'react';
import { Camera, Geometry, Mesh, Program, Renderer } from 'ogl';

const PARTICLE_COLORS = ['#ffffff', '#f5fbff', '#e9f6fb'];
const PARTICLE_COUNT = 200;
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

        const renderer = new Renderer({
            dpr: PIXEL_RATIO,
            depth: false,
            alpha: true,
        });

        const { gl } = renderer;
        gl.clearColor(0, 0, 0, 0);
        container.appendChild(gl.canvas);

        const camera = new Camera(gl, { fov: 15 });
        camera.position.set(0, 0, 20);

        const resize = () => {
            const width = container.clientWidth;
            const height = container.clientHeight;
            renderer.setSize(width, height);
            camera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
        };

        const handleMouseMove = (event: MouseEvent) => {
            const rect = container.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
            mouseRef.current = { x, y };
        };

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

        const update = (time: number) => {
            animationFrameId = window.requestAnimationFrame(update);
            const delta = time - lastTime;
            lastTime = time;
            elapsed += delta * PARTICLE_SPEED;

            program.uniforms.uTime.value = elapsed * 0.001;
            particles.position.x = -mouseRef.current.x * PARTICLE_HOVER_FACTOR;
            particles.position.y = -mouseRef.current.y * PARTICLE_HOVER_FACTOR;

            renderer.render({ scene: particles, camera });
        };

        animationFrameId = window.requestAnimationFrame(update);

        return () => {
            window.removeEventListener('resize', resize);
            container.removeEventListener('mousemove', handleMouseMove);
            window.cancelAnimationFrame(animationFrameId);

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
