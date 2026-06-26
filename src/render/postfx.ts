// Post-processing pipeline (EffectComposer + UnrealBloom).
//
// The renderer hands us its WebGLRenderer/Scene/Camera and then calls render()
// instead of renderer.render(). When disabled we fall back to a plain direct
// render so the cost can be toggled off cheaply.

import { Vector2, type Camera, type Scene, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { BLOOM } from './style';

export class PostFX {
  private renderer: WebGLRenderer;
  private scene: Scene;
  private camera: Camera;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private enabled = true;

  constructor(renderer: WebGLRenderer, scene: Scene, camera: Camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    const size = renderer.getSize(new Vector2());
    this.composer = new EffectComposer(renderer);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.composer.setSize(size.x, size.y);

    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new Vector2(size.x, size.y), BLOOM.strength, BLOOM.radius, BLOOM.threshold);
    this.composer.addPass(this.bloom);
    // OutputPass handles tone mapping + color space conversion at the end.
    this.composer.addPass(new OutputPass());
  }

  resize(w: number, h: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
  }

  /** true → composited (bloom) render; false → plain direct render. */
  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  render(): void {
    if (this.enabled) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  dispose(): void {
    this.bloom.dispose();
    this.composer.dispose();
  }
}
