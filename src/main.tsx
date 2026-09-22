import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import App from "./App";
import "./styles.css";

const url = import.meta.env.VITE_CONVEX_URL;
const root = createRoot(document.getElementById("root")!);

root.render(<StrictMode>{url ? <ConvexProvider client={new ConvexReactClient(url)}><App connected /></ConvexProvider> : <App connected={false} />}</StrictMode>);
