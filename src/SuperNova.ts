import { ThreeComponent } from "three-component-ts";
import { random } from "./Util";
import { SuperNovaAnimation } from "./SuperNovaAnimation";



export class SuperNova extends ThreeComponent {

    private animations = new Array<SuperNovaAnimation>();

    constructor() {
        super();
        const canvas = document.getElementById("scene");
        this.initThree(canvas);
    }

    // influenced by https://waldemarlehner.github.io/js-fiddles/varyingSizePoints/
    protected populateScene(): void {

        this.animations.push(new SuperNovaAnimation(this.scene));
        //this.animations.push(new StarBurstAnimation(this.scene));

        this.camera.position.z = 200;
    }

    startRenderer() {
        this.animations.forEach((animation) => {
            this.startAnimation(animation);
        });

        super.startRenderer();
    }

    animationStopped(animation: SuperNovaAnimation) {
        setTimeout(() => {
            this.startAnimation(animation)
        }, random(1000, 3000));
    }

    startAnimation(animation: SuperNovaAnimation) {
        const complete = animation.start();
        complete.subscribe({
            complete: () => this.animationStopped(animation)
        });
    }

    animate() {
        // super.animate();
        this.animations.forEach((animation) => {
            animation.animate();
        });
    }
}
