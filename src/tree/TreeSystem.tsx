import * as React from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { TreeMorphState, useTreeStore } from "./store";
import {
  buildMorphPoints,
  buildPolaroidPoints,
  easeInOutCubic,
  type ConeParams,
  type MorphPoint,
} from "./sampling";
import { useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";

const tmpMat = new THREE.Matrix4();
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tmpUp = new THREE.Vector3();
const worldUp = new THREE.Vector3(0, 1, 0);

function buildGarlandCurve(cone: ConeParams, turns = 7, samples = 220) {
  const pts: THREE.Vector3[] = [];

  for (let i = 0; i < samples; i++) {
    const u = i / (samples - 1); // 0..1
    const y = cone.yBase + u * cone.height;

    const radius = THREE.MathUtils.lerp(cone.radiusBase, cone.radiusTop, u);

    // 让灯带贴近树表面、稍微浮出来一点
    const r = radius + 0.35;

    // 螺旋角度：绕 turns 圈
    const a = u * turns * Math.PI * 2;

    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;

    pts.push(new THREE.Vector3(x, y, z));
  }

  return new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.8);
}

function buildGarlandPoints(cone: ConeParams, count = 140, turns = 7): MorphPoint[] {
  const pts: MorphPoint[] = [];
  const rng = (i: number) => {
    // 简单可重复的伪随机
    const x = Math.sin(i * 999.123) * 10000;
    return x - Math.floor(x);
  };

  for (let i = 0; i < count; i++) {
    const u = i / (count - 1);               // 0..1
    const y = cone.yBase + u * cone.height;  // 从底到顶
    const radius = THREE.MathUtils.lerp(cone.radiusBase, cone.radiusTop, u);

    const angle = u * turns * Math.PI * 2;   // 螺旋绕树
    const r = radius + 0.32;                 // 稍微离开树表面一点

    const tx = Math.cos(angle) * r;
    const tz = Math.sin(angle) * r;

    const treePos = new THREE.Vector3(tx, y, tz);
    const outward = treePos.clone().sub(new THREE.Vector3(0, cone.yBase + cone.height * 0.5, 0)).normalize();

    // 小灯不需要太复杂的旋转：保持直立即可
    const treeQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), outward);
    const treeScale = new THREE.Vector3(0.22, 0.22, 0.22);

    // scatter: 随机散到外面
    const rr = THREE.MathUtils.lerp(cone.radiusBase + 6, cone.radiusBase + 10, rng(i));
    const aa = rng(i + 7) * Math.PI * 2;
    const sy = THREE.MathUtils.lerp(cone.yBase - 1, cone.yBase + cone.height + 2, rng(i + 13));
    const scatterPos = new THREE.Vector3(Math.cos(aa) * rr, sy, Math.sin(aa) * rr);

    const scatterQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(rng(i + 1) * Math.PI, rng(i + 2) * Math.PI, rng(i + 3) * Math.PI)
    );
    const scatterScale = new THREE.Vector3(0.22, 0.22, 0.22);

    pts.push({
      seed: i,
      treePosition: treePos,
      treeQuaternion: treeQuat,
      treeScale,
      scatterPosition: scatterPos,
      scatterQuaternion: scatterQuat,
      scatterScale,
    });
  }

  return pts;
}


function MorphInstanced({
  points,
  geometry,
  material,
  wobble = 0.35,
}: {
  points: MorphPoint[];
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  wobble?: number;
}) {
  const ref = React.useRef<THREE.InstancedMesh>(null!);
  // const { state, progress, setProgress } = useTreeStore();
  const progress = useTreeStore((s) => s.progress);


  useFrame((r3f, dt) => {
    // const target = state === TreeMorphState.TREE_SHAPE ? 1 : 0;
    // const next = THREE.MathUtils.damp(progress, target, 1.25, dt);
    // if (Math.abs(next - progress) > 1e-5) setProgress(next);

    const t = easeInOutCubic(progress);
    const time = r3f.clock.elapsedTime;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];

      tmpPos.copy(p.scatterPosition).lerp(p.treePosition, t);
      tmpQuat.copy(p.scatterQuaternion).slerp(p.treeQuaternion, t);
      tmpScale.copy(p.scatterScale).lerp(p.treeScale, t);

      // 漂浮：只在散落时明显
      const k = (1 - t) * wobble;
      tmpPos.y += Math.sin(time * 0.9 + p.seed * 0.0001) * k;

      tmpMat.compose(tmpPos, tmpQuat, tmpScale);
      ref.current.setMatrixAt(i, tmpMat);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh
    ref={ref}
    args={[geometry, material, points.length]}
    frustumCulled={false}
  />;
}

function PolaroidField({
  points,
  textures,
  center,
}: {
  points: MorphPoint[];
  textures: THREE.Texture[];
  center: THREE.Vector3;
}) {
  const refs = React.useRef<THREE.Group[]>([]);
  const progress = useTreeStore((s) => s.progress);

  const state = useTreeStore((s) => s.state);
  const selectedPolaroid = useTreeStore((s) => s.selectedPolaroid);
  const selectPolaroid = useTreeStore((s) => s.selectPolaroid);

  const { camera } = useThree();

  // 临时变量（避免每帧 new）
  const outward = React.useMemo(() => new THREE.Vector3(), []);
  const right = React.useMemo(() => new THREE.Vector3(), []);
  const up = React.useMemo(() => new THREE.Vector3(), []);
  const mat = React.useMemo(() => new THREE.Matrix4(), []);
  const qUpright = React.useMemo(() => new THREE.Quaternion(), []);
  const qFinal = React.useMemo(() => new THREE.Quaternion(), []);
  const pos = React.useMemo(() => new THREE.Vector3(), []);
  const scl = React.useMemo(() => new THREE.Vector3(), []);
  const worldUp = React.useMemo(() => new THREE.Vector3(0, 1, 0), []);

  // 聚焦用
  const camDir = React.useMemo(() => new THREE.Vector3(), []);
  const focusWorld = React.useMemo(() => new THREE.Vector3(), []);
  const focusLocal = React.useMemo(() => new THREE.Vector3(), []);
  const mLook = React.useMemo(() => new THREE.Matrix4(), []);
  const qLook = React.useMemo(() => new THREE.Quaternion(), []);
  const qFlip = React.useMemo(
    () => new THREE.Quaternion().setFromAxisAngle(worldUp, Math.PI),
    [worldUp]
  );
  const gWorldPos = React.useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    // 0~1：散 -> 树
    const t = easeInOutCubic(progress);

    // 让“直立朝外”只在接近树形时逐渐强制（避免一开始就被掰直导致看起来乱）
    const align = THREE.MathUtils.clamp((t - 0.75) / 0.25, 0, 1);
    const alignEased = align * align * (3 - 2 * align); // smoothstep

    for (let i = 0; i < points.length; i++) {
      const g = refs.current[i];
      if (!g) continue;

      const p = points[i];

      // =========================
      // 主题聚焦：仅在 SCATTERED 且选中时生效
      // 把被选中的拍立得拉到镜头前，并放大、正对相机
      // =========================
      if (state === TreeMorphState.SCATTERED && selectedPolaroid === i) {
        // 目标世界坐标：相机前方固定距离
        camera.getWorldDirection(camDir);
        focusWorld
          .copy(camera.position)
          .add(camDir.multiplyScalar(2.8))
          .addScaledVector(worldUp, -0.15); // 稍微往下压一点更舒服

        // 转换到父节点本地坐标（因为 TreeSystem 外层 group 有 scale）
        if (g.parent) {
          focusLocal.copy(focusWorld);
          g.parent.worldToLocal(focusLocal);
          g.position.lerp(focusLocal, 0.18);
        } else {
          g.position.lerp(focusWorld, 0.18);
        }

        // 放大
        g.scale.lerp(scl.set(2.3, 2.3, 2.3), 0.18);

        // 正对相机（保持直立）
        // 说明：Three 的 lookAt 会让 -Z 指向目标；但我们的照片正面是 +Z
        // 所以额外乘一个 180° 的 y 轴翻转，让 +Z 朝向相机。
        g.getWorldPosition(gWorldPos);
        mLook.lookAt(gWorldPos, camera.position, worldUp);
        qLook.setFromRotationMatrix(mLook).multiply(qFlip);
        g.quaternion.slerp(qLook, 0.18);

        continue; // 主题拍立得不参与 morph
      }

      // 1) 位置/缩放：严格跟 progress 走（散落时才散）
      pos.copy(p.scatterPosition).lerp(p.treePosition, t);
      scl.copy(p.scatterScale).lerp(p.treeScale, t);

      g.position.copy(pos);
      g.scale.copy(scl);

      // 2) 先做基础旋转（scatter -> treeQuaternion）
      qFinal.copy(p.scatterQuaternion).slerp(p.treeQuaternion, t);

      // 3) 再在接近 TREE 时，把“照片正面 +Z”强制对齐 outward，并固定 worldUp 保持直立
      // outward = 从树心指向该拍立得的位置（朝外）
      outward.copy(center).sub(p.treePosition).normalize();

      // right = outward × worldUp
      right.copy(outward).cross(worldUp);
      if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
      right.normalize();

      // up = right × outward
      up.copy(right).cross(outward).normalize();

      // 用 right/up/outward 组成旋转矩阵，使 group 的 +Z = outward，并且“上”是 worldUp 系的 up
      mat.makeBasis(right, up, outward);
      qUpright.setFromRotationMatrix(mat);

      // 只在靠近树形时逐渐对齐直立朝外
      qFinal.slerp(qUpright, alignEased);

      g.quaternion.copy(qFinal);
    }
  });

  return (
    <>
      {points.map((p, i) => (
        <group
          key={i}
          ref={(el) => {
            if (el) refs.current[i] = el;
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            if (state === TreeMorphState.SCATTERED) {
              selectPolaroid(i);
            }
          }}
        >
          {/* 白色相框 */}
          <mesh>
            <boxGeometry args={[1.15, 1.45, 0.08]} />
            <meshStandardMaterial color="#F5F5F5" roughness={0.6} metalness={0.05} />
          </mesh>

          {/* 照片：plane 默认正面是 +Z，所以我们上面 makeBasis 里第三轴用 outward 就对了 */}
          <mesh position={[0, 0.02, 0.06]}>
            <planeGeometry args={[0.9, 1.05]} />
            <meshBasicMaterial
              map={textures[i]}
              toneMapped={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}
    </>
  );
}


export function TreeSystem() {
  const setProgress = useTreeStore((s) => s.setProgress);
  const setState = useTreeStore((s) => s.setState);
  const progress = useTreeStore((s) => s.progress);
  const cone = React.useMemo<ConeParams>(
    () => ({ height: 10.5, radiusBase: 4.6, radiusTop: 0.25, yBase: -4.8 }),
    []
  );
  const treeCenter = React.useMemo(
    () => new THREE.Vector3(0, cone.yBase + cone.height * 0.5, 0),
    [cone]
  );
  const state = useTreeStore((s) => s.state);
  const selectedPolaroid = useTreeStore((s) => s.selectedPolaroid);
  const clearPolaroid = useTreeStore((s) => s.clearPolaroid);


  const photoUrls = React.useMemo(
    () => Array.from({ length: 25 }, (_, i) => `/photos/${i + 1}.JPG`),
    []
  );

  // useTexture 支持数组，通常会返回 Texture[]
  const textures = useTexture(photoUrls) as THREE.Texture[];

  const needlePoints = React.useMemo(
    () =>
      buildMorphPoints(2400, {
        scatterRadius: 11.5,
        cone,
        baseScale: { min: 0.35, max: 0.75 },
        surfaceBias: 0.18,
        heightBias: 0.5,
      }),
    [cone]
  );

  const ornamentPoints = React.useMemo(
    () =>
      buildMorphPoints(85, {   // ✅ 160 -> 110
        scatterRadius: 10,
        cone,
        baseScale: { min: 0.55, max: 1.1 },
        surfaceBias: 0.12,
        heightBias: 1.2,
        extraTreeRadialOffset: 0.18,
      }),
    [cone]
  );

  const redOrnamentPoints = React.useMemo(
    () =>
      buildMorphPoints(42, {
        scatterRadius: 10,
        cone,
        baseScale: { min: 0.55, max: 0.95 },
        surfaceBias: 0.12,
        heightBias: 1.7,
        extraTreeRadialOffset: 0.22,
      }),
    [cone]
  );
  const garlandPoints = React.useMemo(() => buildGarlandPoints(cone, 160, 7), [cone]);

  const garlandCurve = React.useMemo(() => buildGarlandCurve(cone, 7, 240), [cone]);

  const polaroidPoints = React.useMemo(() => buildPolaroidPoints(cone, 25), [cone]);

  const needleGeo = React.useMemo(() => new THREE.CylinderGeometry(0.03, 0.06, 0.65, 6, 1), []);
  const ornamentGeo = React.useMemo(() => new THREE.SphereGeometry(0.18, 18, 18), []);
  const polaroidGeo = React.useMemo(() => new THREE.BoxGeometry(0.9, 0.65, 0.06), []);
  const garlandGeo = React.useMemo(() => new THREE.SphereGeometry(0.12, 12, 12), []);
  const garlandTubeGeo = React.useMemo(
  () =>
    new THREE.TubeGeometry(
      garlandCurve,
      600,     // tubularSegments：越大越顺滑
      0.03,   // 半径：灯带线粗细（可调 0.03~0.07）
      10,      // radialSegments
      false
    ),
  [garlandCurve]
);

  // const needleMat = React.useMemo(
  //   () => new THREE.MeshStandardMaterial({ color: "#0B3B2E", roughness: 0.55, metalness: 0.15 }),
  //   []
  // );
  const needleMat = React.useMemo(
  () =>
    new THREE.MeshStandardMaterial({
      color: "#0B3B2E",
      roughness: 0.35,
      metalness: 0.15,
      envMapIntensity: 1.2,
    }),
  []
);

  // const goldMat = React.useMemo(
  //   () => new THREE.MeshStandardMaterial({ color: "#D6B35A", roughness: 0.18, metalness: 1.0 }),
  //   []
  // );
  const goldMat = React.useMemo(
  () =>
    new THREE.MeshPhysicalMaterial({
      color: "#D6B35A",
      metalness: 1,
      roughness: 0.08,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      reflectivity: 1,
      envMapIntensity: 2.0,
      emissive: new THREE.Color("#5a3a00"),
      emissiveIntensity: 0.15,
    }),
  []
);

  const redMat = React.useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#B3121A",
        metalness: 0.2,
        roughness: 0.25,
        clearcoat: 1,
        clearcoatRoughness: 0.12,
        emissive: new THREE.Color("#3a0000"),
        emissiveIntensity: 0.25,
        envMapIntensity: 1.5,
      }),
    []
  );

  const garlandMat = React.useMemo(
  () =>
    new THREE.MeshStandardMaterial({
      color: "#FFD7A1",
      emissive: new THREE.Color("#FFD7A1"),
      emissiveIntensity: 1.6,
      roughness: 0.35,
      metalness: 0.0,
    }),
  []
);

const garlandWireMat = React.useMemo(
  () =>
    new THREE.MeshStandardMaterial({
      color: "#6b4a1f",
      roughness: 0.75,
      metalness: 0.15,
      emissive: new THREE.Color("#0f0a05"),
      emissiveIntensity: 0.25,
    }),
  []
);

  const polaroidMat = React.useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#F4F4F4", roughness: 0.65, metalness: 0.0 }),
    []
  );

  const toggle = useTreeStore((s) => s.toggle);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.code === "Space" && toggle();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const { viewport } = useThree();

  // 你树大概高 10.5，给它留一点边距
  const treeScale = React.useMemo(() => {
    const fitW = viewport.width / 10;   // 10 是经验值，可调
    const fitH = viewport.height / 12;  // 12 是经验值，可调
    return Math.min(fitW, fitH) * 1.05; // 1.05 稍微放大一点更好看
  }, [viewport.width, viewport.height]);

  React.useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      // scroll down: e.deltaY > 0  => 变散落 => progress 往 0
      // scroll up: e.deltaY < 0    => 变成树 => progress 往 1
      const speed = 0.0012; // 手感参数
      const next = THREE.MathUtils.clamp(progress - e.deltaY * speed, 0, 1);
      setProgress(next);

      // 可选：超过阈值就更新 state（给 UI 用）
      setState(next > 0.5 ? TreeMorphState.TREE_SHAPE : TreeMorphState.SCATTERED);
    };

    window.addEventListener("wheel", onWheel, { passive: true });
    return () => window.removeEventListener("wheel", onWheel);
  }, [progress, setProgress, setState]);

  // React.useEffect(() => {
  //   let last = 0;
  //   const cooldown = 180; // ms，手感参数：越大越不容易抖动

  //   const onWheel = (e: WheelEvent) => {
  //     const now = performance.now();
  //     if (now - last < cooldown) return;
  //     last = now;

  //     if (e.deltaY > 0) {
  //       // scroll down -> scattered
  //       setProgress(0);
  //       setState(TreeMorphState.SCATTERED);
  //     } else if (e.deltaY < 0) {
  //       // scroll up -> tree
  //       setProgress(1);
  //       setState(TreeMorphState.TREE_SHAPE);
  //     }
  //   };

  //   window.addEventListener("wheel", onWheel, { passive: true });
  //   return () => window.removeEventListener("wheel", onWheel);
  // }, [setProgress, setState]);

  return (
    <group
      scale={treeScale}
      onPointerDown={(e) => {
        // 点击空白处关闭“主题拍立得”
        // （拍立得自身点击已 stopPropagation，所以这里不会误触）
        if (state === TreeMorphState.SCATTERED && selectedPolaroid !== null) {
          e.stopPropagation();
          clearPolaroid();
        }
      }}
    >
      
      {/* 灯光 */}
      <ambientLight intensity={0.25} />
      <directionalLight position={[6, 8, 5]} intensity={1.2} color={"#FFD7A1"} />
      <directionalLight position={[-6, 5, -4]} intensity={0.8} color={"#1DB08A"} />
      <pointLight position={[0, 4, 0]} intensity={35} distance={14} color="#FFD7A1" />
      <pointLight position={[2, 1, 2]} intensity={18} distance={10} color="#1DB08A" />
      <pointLight position={[-2, 2, -2]} intensity={18} distance={10} color="#FFD7A1" />


      {/* 实例渲染 */}
      <MorphInstanced points={needlePoints} geometry={needleGeo} material={needleMat} wobble={0.45} />
      <MorphInstanced points={ornamentPoints} geometry={ornamentGeo} material={goldMat} wobble={0.3} />
      <MorphInstanced points={redOrnamentPoints} geometry={ornamentGeo} material={redMat} wobble={0.28} />
      <MorphInstanced points={garlandPoints} geometry={garlandGeo} material={garlandMat} wobble={0.12} />
      {progress > 0.9 && (
        <mesh geometry={garlandTubeGeo} material={garlandWireMat} frustumCulled={false} />
      )}

      {/* 拍立得：25 个独立 mesh（支持贴图） */}
      {/* {polaroidPoints.map((p, i) => (
        <group
          key={i}
          position={p.treePosition}
          quaternion={p.treeQuaternion}
          scale={p.treeScale}
        >
          {/* 白色相框 */}
          {/* <mesh>
            <boxGeometry args={[1.15, 1.45, 0.08]} />
            <meshStandardMaterial color="#F5F5F5" roughness={0.6} metalness={0.05} />
          </mesh>

          {/* 照片（真正 apply texture 的地方） */}
          {/* <mesh position={[0, 0.02, 0.06]}>
            <planeGeometry args={[0.9, 1.05]} />
            <meshBasicMaterial
              map={textures[i]}
              toneMapped={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))} */}
      {/* 拍立得（朝外） */}
      <PolaroidField
        points={polaroidPoints}
        textures={textures}
        center={treeCenter}
      />



      {/* 提示 */}
      <Html center position={[0, cone.yBase + cone.height + 1.4, 0]} style={{ pointerEvents: "none" }}>
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            background: "rgba(10,10,10,0.35)",
            border: "1px solid rgba(255,215,161,0.25)",
            color: "rgba(255,255,255,0.9)",
            fontFamily: "ui-sans-serif, system-ui",
            backdropFilter: "blur(10px)",
            minWidth: 240,
            textAlign: "center",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Arix Signature Tree</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            Click / Press <b>Space</b> to morph
          </div>
        </div>
      </Html>
    </group>
  );
}
