import { Canvas } from "@react-three/fiber";
import { TreeSystem } from "./tree/TreeSystem";
import { Environment } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { OrbitControls } from "@react-three/drei";
import { Suspense } from "react";

export default function App() {
  return (
    <div style={{ width: "100vw", height: "100vh", background: "#050707" }}>
      <Canvas camera={{ position: [0, 2.5, 12], fov: 42 }}>
        {/* 让金属产生真实反射：奢华感核心 */}
        <Environment preset="city" />

        {/* 后期：高光辉光 */}
        <EffectComposer>
          <Bloom intensity={1.2} luminanceThreshold={0.2} luminanceSmoothing={0.85} />
          <Vignette eskil={false} offset={0.25} darkness={0.9} />
        </EffectComposer>
        <Suspense fallback={null}>
          <TreeSystem />
        </Suspense>
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          rotateSpeed={0.7}
          minPolarAngle={Math.PI / 2.2}
          maxPolarAngle={Math.PI / 2.2}
        />
      </Canvas>
    </div>
  );
}
