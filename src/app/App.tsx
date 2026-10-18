import { useRoute } from "./router";
import { Panel } from "../ui/components";

export function App() {
  const [route] = useRoute();
  return (
    <div className="col" style={{ height: "100%", padding: 24 }}>
      <h1 style={{ letterSpacing: "0.4em", margin: 0, fontSize: 18 }}>BELFRY</h1>
      <Panel title={route.name}>
        <span className="dim">Screen placeholder for “{route.name}”.</span>
      </Panel>
    </div>
  );
}
