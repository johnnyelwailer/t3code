/**
 * The asset half of `ModelStage`'s renderer: one glTF loader per page (KTX2 textures through
 * the Basis transcoder, meshopt geometry), one decode per asset, and the diffuse-only copies the
 * `low` tier swaps in. Loaded only with the lazy canvas chunk.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { type GLTF, GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import basisTranscoderJs from "three/examples/jsm/libs/basis/basis_transcoder.js?url";
import basisTranscoderWasm from "three/examples/jsm/libs/basis/basis_transcoder.wasm?url";

let gltfLoader: GLTFLoader | null = null;
const models = new Map<string, Promise<GLTF>>();

function loaderFor(renderer: THREE.WebGLRenderer): GLTFLoader {
  if (gltfLoader) return gltfLoader;
  // The transcoder is two files KTX2Loader fetches by name from a directory; Vite fingerprints
  // each one, so the names are mapped to their built URLs.
  const transcoder = new THREE.LoadingManager();
  transcoder.setURLModifier((url) =>
    url.endsWith("basis_transcoder.js")
      ? basisTranscoderJs
      : url.endsWith("basis_transcoder.wasm")
        ? basisTranscoderWasm
        : url,
  );
  const ktx2 = new KTX2Loader(transcoder).setTranscoderPath("./").detectSupport(renderer);
  gltfLoader = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
  return gltfLoader;
}

/** One decode per asset per page; every stage clones the result. */
export function loadModel(src: string, renderer: THREE.WebGLRenderer): Promise<GLTF> {
  let model = models.get(src);
  if (!model) {
    model = loaderFor(renderer).loadAsync(src);
    models.set(src, model);
    model.catch(() => models.delete(src));
  }
  return model;
}

/**
 * Lambert has no sheen: for a material with one, a faint glow of the sheen colour stands in, so a
 * soft (fabric, plush) asset keeps its pastel read at the low tier instead of going dark.
 */
function sheenStandIn(material: THREE.Material): THREE.Color {
  const physical = material as Partial<THREE.MeshPhysicalMaterial>;
  if (!physical.sheen || !physical.sheenColor) return new THREE.Color(0x000000);
  return physical.sheenColor.clone().multiplyScalar(0.12 * Math.min(physical.sheen, 1));
}

const lambertCopies = new WeakMap<THREE.Material, THREE.MeshLambertMaterial>();
export function toLambert(material: THREE.Material): THREE.MeshLambertMaterial {
  let copy = lambertCopies.get(material);
  if (!copy) {
    const source = material as THREE.MeshStandardMaterial;
    copy = new THREE.MeshLambertMaterial({
      map: source.map ?? null,
      color: source.color ?? new THREE.Color(0xffffff),
      transparent: source.transparent,
      alphaTest: source.alphaTest,
      side: source.side,
      emissive: sheenStandIn(material),
    });
    lambertCopies.set(material, copy);
  }
  return copy;
}

/**
 * `full`: the room environment (returned, for the caller to dispose), a warm key and a rim light,
 * matching the plush look's studio. `low`: hemisphere + key only (Lambert ignores the
 * environment).
 */
export function lightStage(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  tier: "full" | "low",
): THREE.Texture | null {
  if (tier === "low") {
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(1.5, 3, 2.5);
    scene.add(key, new THREE.HemisphereLight(0xffffff, 0x8a7a70, 2.0));
    return null;
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = environment;
  scene.environmentIntensity = 0.6;
  const key = new THREE.DirectionalLight(0xfff1e0, 2.0);
  key.position.set(2, 3, 3);
  const rim = new THREE.DirectionalLight(0xffffff, 1.6);
  rim.position.set(0, 2.5, -3);
  scene.add(key, rim, new THREE.HemisphereLight(0xffffff, 0x8a7a70, 0.35));
  return environment;
}
