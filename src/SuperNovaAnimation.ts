import { Color, BufferGeometry, BufferAttribute, ShaderMaterial, Points, Scene } from "three";
import { AnimatedVector, createCircleTexture, randomPointInCircle, random, flipCoin, RGB_COLORS } from "./Util";
import { Subject, Observable } from 'rxjs';

// todo: convert to overridable options
const MIN_PT_SIZE = 0.5;
const MAX_PT_SIZE = 2.5;
const MAX_PTS_COUNT = 2000;
const MAX_DIST_FROM_ORIGIN1 = 3;
const MAX_DIST_FROM_ORIGIN2 = 8;
const MAX_VELOCITY = 0.3;
const MIN_VELOCITY = 0.1;
const MIN_COLOR_FADE_RATE = 0.02;
const MAX_COLOR_FADE_RATE = 0.03;
const MAX_DRIFT = 1.0;
const MAX_DRIFT_FREQ = 20; // percentage
const FADEIN_RATE = 0.05;
enum BURST_SHAPE { RANDOM = 0, RING };
enum TIMELINE { STOPPED = -1, FADE_IN = 0, EXPLODE = 1000, FADE_OUT = 5000, END = 6500 }


export class SuperNovaAnimation {

    private static POINTS_OBJECT3_NAME = "STAR_ANIMATION";
    private static INSTANCE_CNT = 1;

    private name: string;
    private ptsInfos: AnimatedVector[];

    private state = TIMELINE.STOPPED;
    private animationStartTime = -1;
    private animationElapsedTime = TIMELINE.STOPPED;

    private completion: Subject<void>;


    constructor(private scene: Scene) {

        this.init();
    }

    init() {

        this.ptsInfos = [];

        const vertices = [];
        const colors = [];
        const sizes = [];

        for (let i = 0; i < MAX_PTS_COUNT; i++) {

            vertices.push(0, 0, 0);
            sizes.push(0);
            colors.push(0.0, 0.0, 0.0);

            this.ptsInfos.push(new AnimatedVector(0, 0, 0));
        }

        const geometry = new BufferGeometry();
        geometry.addAttribute("position", new BufferAttribute(new Float32Array(vertices), 3));
        geometry.addAttribute("customColor", new BufferAttribute(new Float32Array(colors), 3));
        geometry.addAttribute("size", new BufferAttribute(new Float32Array(sizes), 1));
        geometry.computeBoundingSphere();

        let shadermaterial = new ShaderMaterial({
            uniforms: {
                amplitude: { value: 1.0 },
                color: { value: new Color(0xFFFFFF) },
                texture: { value: createCircleTexture('#FFFFFF', 256) }
            },
            vertexShader: document.getElementById('vertexshader').textContent,
            fragmentShader: document.getElementById('fragmentshader').textContent,
            depthTest: false,
            transparent: true
        });

        this.name = SuperNovaAnimation.POINTS_OBJECT3_NAME + ++SuperNovaAnimation.INSTANCE_CNT;
        const points = new Points(geometry, shadermaterial);
        points.name = this.name;
        this.scene.add(points);
    }

    start(): Observable<void> {
        this.reset();
        this.animationStartTime = Date.now();
        this.state = TIMELINE.FADE_IN;
        this.completion = new Subject<void>();
        return this.completion;
    }

    stop() {
        this.animationStopped();
    }


    isRunning(): boolean {
        return this.state != TIMELINE.STOPPED && this.state != TIMELINE.END;
    }

    reset() {

        //determine the profile of the explosion
        const burstShape = flipCoin() ? BURST_SHAPE.RING : BURST_SHAPE.RANDOM;
        // flip coint and reverse velocity vector 50% of the time
        const invert = flipCoin() ? 1 : -1.5;

        // drift is a random +/- delta to some velocity vector directions
        let driftFreq = Math.round(MAX_PTS_COUNT * random(0, MAX_DRIFT_FREQ) / 100);
        driftFreq = driftFreq == 0 ? MAX_PTS_COUNT : driftFreq;

        // center of new cluster
        const center = randomPointInCircle(150);
        const x = center.x;
        const y = center.y;

        const positions = this.geometry.attributes.position.array as Float32Array;
        const colors = this.geometry.attributes.customColor.array as Float32Array;
        const sizes = this.geometry.attributes.size.array as Float32Array;

        // reset all point position, color, size and velocity vectors
        for (let i = 0; i < MAX_PTS_COUNT; i++) {

            // select random pt & store to geometry and to its corresponding ptInfo
            const pt = randomPointInCircle(
                (i % 9 == 0 ? MAX_DIST_FROM_ORIGIN2 : MAX_DIST_FROM_ORIGIN1),
                x, y);
            positions[i * 3] = pt.x;
            positions[i * 3 + 1] = pt.y;
            positions[i * 3 + 2] = 0;

            const ptInfo = this.ptsInfos[i];
            ptInfo.set(pt.x, pt.y, 0);

            // compute velocity vector from center thru this pt
            ptInfo.velocity.set(
                (pt.x - x),
                (pt.y - y),
                0.1);
            const dist = ptInfo.velocity.length(); //for ring burst
            ptInfo.velocity.normalize();

            // reverse velocity vector to simulate implosion, followed by explosion
            ptInfo.velocity.multiplyScalar(invert);

            let vel = 0;
            switch (burstShape) {

                case BURST_SHAPE.RANDOM:
                    // randomly distributed pts explosion
                    // randomly scale the velocity vector's magnitude
                    vel = random(MIN_VELOCITY, MAX_VELOCITY);
                    break;
                case BURST_SHAPE.RING:
                    // ring burst explosion
                    // pts velocity is function of dist from center. Closer pts ot center
                    // move faster.
                    vel = MIN_VELOCITY +
                        ((MAX_VELOCITY - MIN_VELOCITY) * (1.0 - dist / MAX_DIST_FROM_ORIGIN2));
                    break;
            }

            ptInfo.velocity.x *= vel;
            ptInfo.velocity.y *= -vel;
            ptInfo.velocity.z *= random(0.01,0.5);

            //add random drift to some points
            if (i % driftFreq == 0) {
                let driftX = random(-MAX_DRIFT, MAX_DRIFT);
                ptInfo.velocity.x += driftX;

                let driftY = random(-MAX_DRIFT, MAX_DRIFT);
                ptInfo.velocity.y += driftY;
            }

            const size = random(MIN_PT_SIZE, MAX_PT_SIZE);
            sizes[i] = size;

            const initColorVal = 0.0;
            colors[i * 3] = initColorVal;
            colors[i * 3 + 1] = initColorVal;
            colors[i * 3 + 2] = initColorVal;
            ptInfo.color = RGB_COLORS[Math.round(random(0, RGB_COLORS.length - 1))];

            ptInfo.colorFadeOutRate = -random(MIN_COLOR_FADE_RATE, MAX_COLOR_FADE_RATE);
        }

        (this.geometry.attributes.position as BufferAttribute).needsUpdate = true;
        (this.geometry.attributes.size as BufferAttribute).needsUpdate = true;
        (this.geometry.attributes.customColor as BufferAttribute).needsUpdate = true;
    }

    animate() {
        this.updateState();

        // detect when not animating
        if (this.state == TIMELINE.STOPPED) return;

        const positions = this.geometry.attributes.position.array as Float32Array;
        const colors = this.geometry.attributes.customColor.array as Float32Array;

        for (let i = 0; i < MAX_PTS_COUNT; i++) {

            const ptInfo = this.ptsInfos[i];

            // fade-in points, why not an indexed api on color to avoid this silly switch????
            if (this.state == TIMELINE.FADE_IN) {
                let color: number;
                for (let j = 0; j < 3; j++) {
                    switch (j) {
                        case 0:
                            color = ptInfo.color.r;
                            break;
                        case 1:
                            color = ptInfo.color.g;
                            break;
                        case 2:
                            color = ptInfo.color.b;
                            break;
                    }

                    color =
                        Math.min(
                            colors[i * 3 + j] + FADEIN_RATE,
                            color);

                    colors[i * 3 + j] = color
                }
                continue;
            }

            if (this.state == TIMELINE.EXPLODE || this.state == TIMELINE.FADE_OUT) {
                positions[i * 3] += ptInfo.velocity.x;
                positions[i * 3 + 1] -= ptInfo.velocity.y;
                positions[i * 3 + 2] += ptInfo.velocity.z;
            }

            if (this.state == TIMELINE.FADE_OUT) {
                let color: number;
                for (let j = 0; j < 3; j++) {

                    color = Math.max(
                        colors[i * 3 + j] + ptInfo.colorFadeOutRate,
                        0);

                    colors[i * 3 + j] = color;
                }

            }
        }

        (this.geometry.attributes.position as BufferAttribute).needsUpdate = true;
        (this.geometry.attributes.customColor as BufferAttribute).needsUpdate = true;
    }

    private updateState() {

        if (this.animationStartTime != TIMELINE.STOPPED) {
            this.animationElapsedTime = Date.now() - this.animationStartTime;
        }

        // detect when not animating
        if (this.state != TIMELINE.STOPPED &&
            (this.animationElapsedTime < TIMELINE.FADE_IN ||
                this.animationElapsedTime > TIMELINE.END)) {
                    this.animationStopped();
            return
        }

        this.animationElapsedTime = Date.now() - this.animationStartTime;

        if (this.animationElapsedTime < TIMELINE.EXPLODE) {
            if (this.state != TIMELINE.FADE_IN) this.state = TIMELINE.FADE_IN;
            return
        }

        if (this.animationElapsedTime < TIMELINE.FADE_OUT) {
            if (this.state != TIMELINE.EXPLODE) this.state = TIMELINE.EXPLODE;
            return
        }

        if (this.animationElapsedTime < TIMELINE.END) {
            if (this.state != TIMELINE.FADE_OUT) this.state = TIMELINE.FADE_OUT;
            return
        }

    }

    private animationStopped() {
        this.state = TIMELINE.STOPPED;
        this.animationElapsedTime = TIMELINE.STOPPED;
        this.completion.complete();
    }

    get points(): Points {
        return this.scene.getObjectByName(this.name) as Points;
    }

    get geometry(): BufferGeometry {
        return this.points.geometry as BufferGeometry;
    }
}

