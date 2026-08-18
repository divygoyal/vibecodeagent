'use client';

import { useEffect, useRef } from 'react';
import { Camera, Geometry, Mesh, Program, Renderer } from 'ogl';

const PARTICLE_COLORS = ['#ffffff', '#f5fbff', '#e9f6fb', '#7AD9DA'];
const PARTICLE_COUNT = 400;
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

interface GalaxyScene {
    dispose: () => void;
}

// Build one full galaxy scene (renderer + canvas + RAF loop). Returns a
// dispose() so the caller can tear it down — used both on unmount and to
// rebuild after a WebGL context loss.
function buildGalaxyScene(
    container: HTMLDivElement,
    mouseRef: { current: { x: number; y: number } },
    onContextLost: () => void,
): GalaxyScene | null {
    let renderer: Renderer;
    try {
        renderer = new Renderer({
            dpr: PIXEL_RATIO,
            depth: false,
            alpha: true,
        });
    } catch {
        return null;
    }

    const { gl } = renderer;
    gl.clearColor(0, 0, 0, 0);
    container.appendChild(gl.canvas);

    const camera = new Camera(gl, { fov: 15 });
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
    let alive = true;
    // Frame counter consulted by the watchdog below to detect a silently
    // stopped RAF loop (canvas in DOM and context alive, but nothing rendering).
    let frameCount = 0;

    const update = (time: number) => {
        if (!alive) return;
        animationFrameId = window.requestAnimationFrame(update);
        frameCount += 1;
        const delta = time - lastTime;
        lastTime = time;
        elapsed += delta * PARTICLE_SPEED;

        program.uniforms.uTime.value = elapsed * 0.001;
        particles.position.x = -mouseRef.current.x * PARTICLE_HOVER_FACTOR;
        particles.position.y = -mouseRef.current.y * PARTICLE_HOVER_FACTOR;

        renderer.render({ scene: particles, camera });
    };

    animationFrameId = window.requestAnimationFrame(update);

    if (typeof console !== 'undefined' && console.info) {
        console.info('hero-galaxy: scene started');
    }

    // ── WebGL context loss handler ──
    // Calling event.preventDefault() opts in to recovery (browser keeps the
    // canvas eligible for webglcontextrestored). But we DO NOT wait for that
    // restoration: Chrome only fires it when GPU conditions ease and there's
    // no guarantee they will. Instead we immediately notify the parent so it
    // can fully tear down and rebuild from scratch on a fresh context.
    const handleContextLost = (e: Event) => {
        e.preventDefault();
        alive = false;
        window.cancelAnimationFrame(animationFrameId);
        if (typeof console !== 'undefined' && console.info) {
            console.info('hero-galaxy: webglcontextlost, scheduling rebuild');
        }
        onContextLost();
    };
    gl.canvas.addEventListener('webglcontextlost', handleContextLost as EventListener, false);

    const handleVisibility = () => {
        if (!alive) return;
        if (document.hidden) {
            window.cancelAnimationFrame(animationFrameId);
        } else {
            lastTime = performance.now();
            animationFrameId = window.requestAnimationFrame(update);
        }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // ── Diagnostic watchdog ──
    // Production reports of "galaxy disappears after ~2s" had no console errors
    // and no webglcontextlost event firing. This watchdog ticks every 2s and
    // checks four things that can silently cause the canvas to stop being
    // visible without any error surfacing:
    //   1. canvas removed from its container (extension, external script, or
    //      React reconciliation moving things)
    //   2. canvas's CSS clientWidth/Height became 0 (layout shifted it out)
    //   3. container display:none / visibility:hidden (parent class changed)
    //   4. RAF loop silently stopped (frame counter didn't advance)
    // On any anomaly we log to console and trigger the same rebuild path that
    // context loss uses, so a fresh scene comes up. Logs use console.info so
    // they show under "Default levels" in DevTools without being noisy errors.
    let lastFrameCount = 0;
    const watchdog = window.setInterval(() => {
        if (!alive) return;
        const inDom = container.contains(gl.canvas);
        const canvasW = gl.canvas.clientWidth;
        const canvasH = gl.canvas.clientHeight;
        const styles = window.getComputedStyle(container);
        const display = styles.display;
        const visibility = styles.visibility;
        const opacity = styles.opacity;
        const framesIn2s = frameCount - lastFrameCount;
        lastFrameCount = frameCount;

        const stuck = framesIn2s === 0;
        const hidden = display === 'none' || visibility === 'hidden' || Number(opacity) === 0;
        const sized = canvasW > 0 && canvasH > 0;

        if (!inDom || stuck || hidden || !sized) {
            if (console.info) {
                console.info('hero-galaxy: anomaly', {
                    inDom,
                    canvasSize: `${canvasW}x${canvasH}`,
                    containerDisplay: display,
                    containerVisibility: visibility,
                    containerOpacity: opacity,
                    framesIn2s,
                });
            }
        }

        if (!inDom || hidden || !sized) {
            // Canvas isn't visible — full rebuild via the same path context
            // loss takes. The new scene will measure the container freshly.
            alive = false;
            window.cancelAnimationFrame(animationFrameId);
            window.clearInterval(watchdog);
            onContextLost();
        } else if (stuck) {
            // RAF loop died but canvas is still healthy — just restart the loop
            // without tearing down GL resources.
            lastTime = performance.now();
            animationFrameId = window.requestAnimationFrame(update);
        }
    }, 2000);

    const dispose = () => {
        alive = false;
        window.clearInterval(watchdog);
        ro?.disconnect();
        window.removeEventListener('resize', resize);
        container.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('visibilitychange', handleVisibility);
        gl.canvas.removeEventListener('webglcontextlost', handleContextLost as EventListener);
        window.cancelAnimationFrame(animationFrameId);

        try {
            const loseCtx = gl.getExtension('WEBGL_lose_context');
            loseCtx?.loseContext();
        } catch { /* extension unsupported — fine */ }

        if (container.contains(gl.canvas)) {
            container.removeChild(gl.canvas);
        }
    };

    return { dispose };
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

        let scene: GalaxyScene | null = null;
        let retryTimer: number | null = null;
        let unmounted = false;

        const init = (attempt = 0) => {
            if (unmounted) return;
            scene = buildGalaxyScene(container, mouseRef, handleLost);
            if (!scene) {
                // Renderer construction failed — most likely WebGL was unavailable
                // or the GPU is still under pressure from a prior eviction.
                // Back off and try again; cap attempts so we don't spin forever.
                if (attempt >= 4) {
                    if (typeof console !== 'undefined' && console.warn) {
                        console.warn('hero-galaxy: giving up after 4 init attempts');
                    }
                    return;
                }
                const delay = 800 * Math.pow(1.5, attempt); // 800, 1200, 1800, 2700ms
                retryTimer = window.setTimeout(() => {
                    retryTimer = null;
                    init(attempt + 1);
                }, delay);
            }
        };

        // Note: this closure is captured by buildGalaxyScene before scene
        // assignment, so we read scene through the outer variable at call time.
        const handleLost = () => {
            if (unmounted) return;
            scene?.dispose();
            scene = null;
            if (retryTimer) window.clearTimeout(retryTimer);
            // Short delay so the GPU process has a beat to settle before we
            // ask for a new context — without it, Renderer construction tends
            // to immediately fail again with the same pressure.
            retryTimer = window.setTimeout(() => {
                retryTimer = null;
                init();
            }, 800);
        };

        init();

        return () => {
            unmounted = true;
            if (retryTimer) window.clearTimeout(retryTimer);
            scene?.dispose();
            scene = null;
        };
    }, []);

    return (
        <div
            ref={containerRef}
            className={`pointer-events-none absolute inset-0 overflow-hidden opacity-90 ${className}`}
        />
    );
}
