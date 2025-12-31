import * as THREE from "three";

export type MorphPoint = {
  scatterPosition: THREE.Vector3;
  treePosition: THREE.Vector3;
  scatterQuaternion: THREE.Quaternion;
  treeQuaternion: THREE.Quaternion;
  scatterScale: THREE.Vector3;
  treeScale: THREE.Vector3;
  seed: number;
};

export type ConeParams = {
  height: number;
  radiusBase: number;
  radiusTop: number;
  yBase: number;
};

export function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** 散落：球体内均匀随机 */
export function randomPointInSphere(radius: number, rng = Math.random) {
  const u = rng();
  const v = rng();
  const w = rng();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  const r = radius * Math.cbrt(w);

  const sinPhi = Math.sin(phi);
  return new THREE.Vector3(
    r * sinPhi * Math.cos(theta),
    r * Math.cos(phi),
    r * sinPhi * Math.sin(theta)
  );
}

/** 树：给定高度 y 的时候，圆锥的半径 */
export function coneRadiusAtY(y: number, p: ConeParams) {
  const tt = THREE.MathUtils.clamp((y - p.yBase) / p.height, 0, 1);
  return THREE.MathUtils.lerp(p.radiusBase, p.radiusTop, tt);
}

/** 成树：在圆锥体附近取点（偏外壳 + 底部更密） */
export function randomPointInConeBiased(
  p: ConeParams,
  rng = Math.random,
  surfaceBias = 0.25,
  heightBias = 1.8
) {
  const raw = rng();
  const t = Math.pow(raw, 1 / heightBias); // >1 偏底部
  const y = p.yBase + t * p.height;

  const rMax = coneRadiusAtY(y, p);
  const r = rMax * Math.pow(rng(), surfaceBias); // 越小越贴外壳

  const ang = rng() * Math.PI * 2;
  return new THREE.Vector3(r * Math.cos(ang), y, r * Math.sin(ang));
}

export function randomQuaternion(rng = Math.random) {
  const e = new THREE.Euler(
    (rng() - 0.5) * Math.PI,
    (rng() - 0.5) * Math.PI,
    (rng() - 0.5) * Math.PI
  );
  return new THREE.Quaternion().setFromEuler(e);
}

/** 成树时让物体“朝外”一点（更像挂饰/针叶） */
export function outwardQuaternionFromPosition(pos: THREE.Vector3) {
  const outward = new THREE.Vector3(pos.x, 0, pos.z);
  if (outward.lengthSq() < 1e-6) outward.set(1, 0, 0);
  outward.normalize();

  const origin = new THREE.Vector3(0, pos.y, 0);
  const target = new THREE.Vector3(outward.x, pos.y, outward.z);
  const m = new THREE.Matrix4().lookAt(origin, target, new THREE.Vector3(0, 1, 0));
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

/** 通用：生成 N 个元素的 scatter/tree 双坐标 */
export function buildMorphPoints(
  count: number,
  opts: {
    scatterRadius: number;
    cone: ConeParams;
    baseScale: { min: number; max: number };
    surfaceBias?: number;
    heightBias?: number;
    extraTreeRadialOffset?: number;
  }
): MorphPoint[] {
  const {
    scatterRadius,
    cone,
    baseScale,
    surfaceBias = 0.25,
    heightBias = 1.8,
    extraTreeRadialOffset = 0,
  } = opts;

  const points: MorphPoint[] = [];
  for (let i = 0; i < count; i++) {
    const seed = (i + 1) * 99991;

    const scatterPosition = randomPointInSphere(scatterRadius);
    const treePosition = randomPointInConeBiased(cone, Math.random, surfaceBias, heightBias);

    if (extraTreeRadialOffset !== 0) {
      const radial = new THREE.Vector3(treePosition.x, 0, treePosition.z);
      if (radial.lengthSq() > 1e-6) {
        radial.normalize().multiplyScalar(extraTreeRadialOffset);
        treePosition.add(radial);
      }
    }

    const s = THREE.MathUtils.lerp(baseScale.min, baseScale.max, Math.random());
    const scale = new THREE.Vector3(1, 1, 1).multiplyScalar(s);

    points.push({
      scatterPosition,
      treePosition,
      scatterQuaternion: randomQuaternion(),
      treeQuaternion: outwardQuaternionFromPosition(treePosition),
      scatterScale: scale,
      treeScale: scale,
      seed,
    });
  }
  return points;
}

/** 20 个拍立得：分层 + 螺旋，更“高级” */
/** 拍立得：分层 + 螺旋，可配置数量 */
export function buildPolaroidPoints(cone: ConeParams, count = 20): MorphPoint[] {
  // 目标：尽量做成接近方阵的 layers x perLayer
  const layers = Math.max(1, Math.round(Math.sqrt(count))); // 例如 25 -> 5
  const perLayer = Math.max(1, Math.ceil(count / layers));  // 例如 25 -> 5

  const pts: MorphPoint[] = [];

  for (let i = 0; i < count; i++) {
    const layer = Math.floor(i / perLayer);
    const idx = i % perLayer;

    const tY = (layer + 0.8) / (layers + 0.6);
    const y = cone.yBase + tY * cone.height;

    const r = coneRadiusAtY(y, cone) * 1.08;
    const ang = (idx / perLayer) * Math.PI * 2 + layer * 0.45;

    const treePosition = new THREE.Vector3(r * Math.cos(ang), y, r * Math.sin(ang));

    pts.push({
      scatterPosition: randomPointInSphere(10),
      treePosition,
      scatterQuaternion: randomQuaternion(),
      treeQuaternion: outwardQuaternionFromPosition(treePosition),
      scatterScale: new THREE.Vector3(0.9, 0.9, 0.9),
      treeScale: new THREE.Vector3(0.9, 0.9, 0.9),
      seed: (i + 1) * 31337,
    });
  }

  return pts;
}

// 兼容旧的 import（不想动旧代码也不会报错）
export function buildPolaroidPoints20(cone: ConeParams): MorphPoint[] {
  return buildPolaroidPoints(cone, 20);
}

